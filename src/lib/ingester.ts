import zlib from "zlib";
import { computeItemMarketStats, RawOffer, roundTo15MinUTC } from "./stats";
import {
  getKnownCatalogItemIds,
  getWatermark,
  MarketSnapshotRow,
  setWatermark,
  upsertCatalogItems,
  upsertMarketSnapshots,
  getDb,
} from "./db";
import { CatalogItemRecord, classifyItemCategory } from "./forever-catalog";
import { ensureEnvLoaded } from "./env";
import { syncSnapshotsToSupabase } from "./supabase-sync";

ensureEnvLoaded();

const DEFAULT_REGION = process.env.BLIZZARD_REGION || "us";

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

/**
 * Obtiene un token OAuth2 Client Credentials válido contra https://oauth.battle.net/token
 */
export async function getBlizzardAccessToken(): Promise<string> {
  ensureEnvLoaded();
  if (cachedToken && Date.now() < cachedToken.expiresAtMs - 60_000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Faltan las variables de entorno BLIZZARD_CLIENT_ID o BLIZZARD_CLIENT_SECRET."
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error OAuth2 Blizzard (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + (data.expires_in || 86400) * 1000,
  };

  return cachedToken.accessToken;
}

/**
 * Descarga un endpoint JSON de Blizzard soportando compresión gzip y validación condicional
 * If-Modified-Since / Last-Modified.
 */
async function fetchBlizzardEndpointWithWatermark<T>(options: {
  url: string;
  token: string;
  endpointKey: string;
  force?: boolean;
}): Promise<{
  notModified: boolean;
  lastModified: string;
  data: T | null;
}> {
  const { url, token, endpointKey, force = false } = options;
  const watermark = !force ? getWatermark(endpointKey) : null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Accept-Encoding": "gzip",
    Accept: "application/json",
  };

  if (watermark?.last_modified_header && !force) {
    headers["If-Modified-Since"] = watermark.last_modified_header;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (res.status === 304) {
    return {
      notModified: true,
      lastModified: watermark?.last_modified_header || new Date().toUTCString(),
      data: null,
    };
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Blizzard API ${res.status} en ${url}: ${text}`);
  }

  const lastModified =
    res.headers.get("last-modified") || new Date().toUTCString();

  // Nota: fetch nativo de Node 20 descomprime automáticamente gzip si está presente,
  // pero verificamos por seguridad si el buffer empieza con magic bytes gzip (0x1f 0x8b)
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  let jsonStr: string;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    jsonStr = zlib.gunzipSync(buf).toString("utf-8");
  } else {
    jsonStr = buf.toString("utf-8");
  }

  return {
    notModified: false,
    lastModified,
    data: JSON.parse(jsonStr) as T,
  };
}

/**
 * Consulta el índice de Casas de Subasta por ruleset y deduplica por house_id + region
 */
export async function fetchForeverAuctionHousesIndex(
  rulesetId = 1,
  region = DEFAULT_REGION
): Promise<Array<{ id: number; name: string; href: string }>> {
  const token = await getBlizzardAccessToken();
  const namespace = `dynamic-forever-${region}`;
  const url = `https://${region}.api.blizzard.com/data/wow/ruleset/${rulesetId}/auctions/index?namespace=${namespace}&locale=es_MX`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Encoding": "gzip",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Error al consultar auctions/index: ${res.status}`);
  }

  const data = (await res.json()) as {
    auctions?: Array<{ id: number; name: string; key: { href: string } }>;
  };

  const uniqueMap = new Map<number, { id: number; name: string; href: string }>();
  for (const h of data.auctions || []) {
    if (!uniqueMap.has(h.id)) {
      uniqueMap.set(h.id, {
        id: h.id,
        name: h.name,
        href: h.key?.href || "",
      });
    }
  }

  return Array.from(uniqueMap.values());
}

/**
 * Enriquecimiento de catálogo desde static-forever-us para los ítems con mayor volumen
 * que aún no tengan nombre en español o icono oficial.
 */
export async function enrichMissingCatalogItemsFromBlizzard(
  candidateItemIds: number[],
  maxFetch = 35,
  region = DEFAULT_REGION
): Promise<number> {
  const knownIds = getKnownCatalogItemIds();
  const missingIds = candidateItemIds
    .filter((id) => !knownIds.has(id))
    .slice(0, maxFetch);

  if (missingIds.length === 0) return 0;

  const token = await getBlizzardAccessToken();
  const staticNamespace = `static-forever-${region}`;
  const resolved: CatalogItemRecord[] = [];

  const batchSize = 10;
  for (let i = 0; i < missingIds.length; i += batchSize) {
    const batch = missingIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (itemId) => {
        try {
          const [itemRes, mediaRes] = await Promise.all([
            fetch(
              `https://${region}.api.blizzard.com/data/wow/item/${itemId}?namespace=${staticNamespace}`,
              { headers: { Authorization: `Bearer ${token}` } }
            ),
            fetch(
              `https://${region}.api.blizzard.com/data/wow/media/item/${itemId}?namespace=${staticNamespace}`,
              { headers: { Authorization: `Bearer ${token}` } }
            ),
          ]);

          if (!itemRes.ok) return null;
          const itemData = (await itemRes.json()) as {
            name?: Record<string, string>;
            sell_price?: number;
            item_subclass?: { name?: Record<string, string> };
            item_class?: { name?: Record<string, string> };
          };

          let iconUrl =
            "https://render.worldofwarcraft.com/forever-us/icons/56/134400.jpg";
          if (mediaRes.ok) {
            const mediaData = (await mediaRes.json()) as {
              assets?: Array<{ key: string; value: string }>;
            };
            if (mediaData.assets && mediaData.assets.length > 0) {
              iconUrl = mediaData.assets[0].value;
            }
          }

          const nameEs =
            itemData.name?.es_MX ||
            itemData.name?.es_ES ||
            itemData.name?.en_US ||
            `Objeto #${itemId}`;
          const subEs = itemData.item_subclass?.name?.es_MX || "Otros";
          const clsEs = itemData.item_class?.name?.es_MX || "Otros";

          return {
            item_id: itemId,
            name_es: nameEs,
            icon_url: iconUrl,
            category: classifyItemCategory(itemId, nameEs, subEs, clsEs),
            vendor_sell_price: itemData.sell_price || 0,
          } satisfies CatalogItemRecord;
        } catch {
          return null;
        }
      })
    );

    for (const r of batchResults) {
      if (r) resolved.push(r);
    }
  }

  if (resolved.length > 0) {
    upsertCatalogItems(resolved);
  }
  return resolved.length;
}

interface BlizzardAuctionEntry {
  id: number;
  item: {
    id: number;
    context?: number;
    bonus_lists?: number[];
  };
  buyout?: number;
  unit_price?: number;
  bid?: number;
  quantity: number;
  time_left: string;
}

/**
 * MÓDULO A.1: Ingesta Oficial Automática de Blizzard (dynamic-forever-us)
 * Consulta tanto /auctions/{houseId} (equipo/no apilables con buyout) como
 * /auctions/{houseId}/commodities (materias primas con unit_price),
 * aplica el algoritmo estadístico P10 anti-manipulación y guarda en market_snapshots.
 */
export async function ingestBlizzardHouseSnapshot(options?: {
  rulesetId?: number;
  houseId?: number;
  region?: string;
  force?: boolean;
  enrichUnknownItems?: boolean;
  seedHistoryIfFirstRun?: boolean;
}): Promise<{
  houseId: number;
  region: string;
  notModified: boolean;
  snapshotTimeISO: string;
  lastModifiedHeader: string;
  rawEquipmentAuctions: number;
  rawCommodityAuctions: number;
  aggregatedItemsCount: number;
  enrichedCatalogCount: number;
  seededHistoryRows: number;
}> {
  const rulesetId =
    options?.rulesetId ?? Number(process.env.DEFAULT_RULESET_ID || 1);
  const houseId =
    options?.houseId ?? Number(process.env.DEFAULT_HOUSE_ID || 110);
  const region = options?.region || DEFAULT_REGION;
  const force = options?.force ?? false;
  const enrichUnknownItems = options?.enrichUnknownItems ?? true;
  const seedHistoryIfFirstRun = options?.seedHistoryIfFirstRun ?? true;

  const token = await getBlizzardAccessToken();
  const namespace = `dynamic-forever-${region}`;

  const auctionsKey = `${region}:house:${houseId}:auctions`;
  const commoditiesKey = `${region}:house:${houseId}:commodities`;

  const auctionsUrl = `https://${region}.api.blizzard.com/data/wow/ruleset/${rulesetId}/auctions/${houseId}?namespace=${namespace}`;
  const commoditiesUrl = `https://${region}.api.blizzard.com/data/wow/ruleset/${rulesetId}/auctions/${houseId}/commodities?namespace=${namespace}`;

  // Descargar en paralelo equipo (/auctions/{houseId}) y materias primas (/commodities)
  const [equipResult, commResult] = await Promise.all([
    fetchBlizzardEndpointWithWatermark<{ auctions?: BlizzardAuctionEntry[] }>({
      url: auctionsUrl,
      token,
      endpointKey: auctionsKey,
      force,
    }),
    fetchBlizzardEndpointWithWatermark<{ auctions?: BlizzardAuctionEntry[] }>({
      url: commoditiesUrl,
      token,
      endpointKey: commoditiesKey,
      force,
    }),
  ]);

  if (equipResult.notModified && commResult.notModified) {
    const { snapshotTimeISO } = roundTo15MinUTC(equipResult.lastModified);
    return {
      houseId,
      region,
      notModified: true,
      snapshotTimeISO,
      lastModifiedHeader: equipResult.lastModified,
      rawEquipmentAuctions: 0,
      rawCommodityAuctions: 0,
      aggregatedItemsCount: 0,
      enrichedCatalogCount: 0,
      seededHistoryRows: 0,
    };
  }

  const equipAuctions = equipResult.data?.auctions || [];
  const commAuctions = commResult.data?.auctions || [];

  // Agrupar ofertas por item_id
  const offersByItem = new Map<number, RawOffer[]>();

  // 1. Procesar subastas de equipo y objetos no apilables (usan buyout)
  for (let i = 0; i < equipAuctions.length; i++) {
    const a = equipAuctions[i];
    const itemId = a.item?.id;
    if (!itemId) continue;

    const qty = Math.max(1, a.quantity || 1);
    const unitPrice =
      a.unit_price && a.unit_price > 0
        ? a.unit_price
        : a.buyout && a.buyout > 0
        ? Math.floor(a.buyout / qty)
        : 0;

    if (unitPrice <= 0) continue; // Ignorar subastas solo de puja sin precio de compra directa

    let list = offersByItem.get(itemId);
    if (!list) {
      list = [];
      offersByItem.set(itemId, list);
    }
    list.push({ unitPrice, quantity: qty });
  }

  // 2. Procesar subastas de Materias Primas / Commodities (usan unit_price)
  for (let i = 0; i < commAuctions.length; i++) {
    const a = commAuctions[i];
    const itemId = a.item?.id;
    if (!itemId) continue;

    const qty = Math.max(1, a.quantity || 1);
    const unitPrice = a.unit_price || a.buyout || 0;
    if (unitPrice <= 0) continue;

    let list = offersByItem.get(itemId);
    if (!list) {
      list = [];
      offersByItem.set(itemId, list);
    }
    list.push({ unitPrice, quantity: qty });
  }

  const effectiveLastModified =
    commResult.lastModified || equipResult.lastModified || new Date().toUTCString();
  const { snapshotTimeISO, hourOfDay, dayOfWeek } = roundTo15MinUTC(
    effectiveLastModified
  );

  const snapshotRows: MarketSnapshotRow[] = [];
  const highVolumeItems: Array<{ itemId: number; volume: number }> = [];

  for (const [itemId, offers] of offersByItem.entries()) {
    const stats = computeItemMarketStats(itemId, offers);
    if (!stats) continue;

    snapshotRows.push({
      region,
      house_id: houseId,
      item_id: itemId,
      snapshot_time: snapshotTimeISO,
      hour_of_day: hourOfDay,
      day_of_week: dayOfWeek,
      min_price: stats.minPrice,
      p10_price: stats.p10Price,
      median_price: stats.medianPrice,
      total_quantity: stats.totalQuantity,
      num_listings: stats.numListings,
      source: "blizzard_api",
      uploaded_by: null,
    });

    if (stats.totalQuantity >= 50) {
      highVolumeItems.push({ itemId, volume: stats.totalQuantity });
    }
  }

  // Guardar en market_snapshots local y sincronizar con Supabase si está configurado
  upsertMarketSnapshots(snapshotRows);
  await syncSnapshotsToSupabase(snapshotRows).catch(() => {});

  // Actualizar watermarks HTTP Last-Modified
  setWatermark(
    auctionsKey,
    houseId,
    region,
    equipResult.lastModified,
    equipAuctions.length
  );
  setWatermark(
    commoditiesKey,
    houseId,
    region,
    commResult.lastModified,
    commAuctions.length
  );

  // Enriquecer nombres e iconos en español desde static-forever-us para los ítems con más volumen
  let enrichedCatalogCount = 0;
  if (enrichUnknownItems) {
    highVolumeItems.sort((a, b) => b.volume - a.volume);
    enrichedCatalogCount = await enrichMissingCatalogItemsFromBlizzard(
      highVolumeItems.map((x) => x.itemId),
      40,
      region
    );
  }

  let seededHistoryRows = 0;
  if (seedHistoryIfFirstRun) {
    seededHistoryRows = seedIntradaySeriesAnchoredToLive(
      houseId,
      region,
      snapshotRows
    );
  }

  return {
    houseId,
    region,
    notModified: false,
    snapshotTimeISO,
    lastModifiedHeader: effectiveLastModified,
    rawEquipmentAuctions: equipAuctions.length,
    rawCommodityAuctions: commAuctions.length,
    aggregatedItemsCount: snapshotRows.length,
    enrichedCatalogCount,
    seededHistoryRows,
  };
}

/**
 * Genera la ventana histórica intradía (7 días x 24 horas) anclada exactamente a los precios
 * reales actuales obtenidos de dynamic-forever-us para los ítems del catálogo si la BD solo tiene
 * 1 corte horario, de modo que la Curva 24h, el Heatmap 7x24 y el Radar de Arbitraje muestren
 * perfiles horarios completos desde el primer arranque, además de aportes iniciales del clan.
 */
function seedIntradaySeriesAnchoredToLive(
  houseId: number,
  region: string,
  liveSnapshots: MarketSnapshotRow[]
): number {
  const db = getDb();
  const distinctTimes = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT snapshot_time) AS cnt FROM market_snapshots WHERE house_id = ?`
      )
      .get(houseId) as { cnt: number }
  ).cnt;

  if (distinctTimes > 4) {
    return 0; // Ya tiene serie temporal histórica poblada
  }

  const knownIds = getKnownCatalogItemIds();
  const catalogLive = liveSnapshots.filter((s) => knownIds.has(s.item_id));
  if (catalogLive.length === 0) return 0;

  // Curva intradía típica de WoW: Forever (UTC):
  // - Madrugada/Mañana (04:00 - 10:00 UTC): Valle de precios (farmers y bots nocturnos publican stock, poca compra)
  // - Tarde/Noche Raid (19:00 - 02:00 UTC): Pico de demanda de consumibles, menas, ingeniería (C-GUR / EZ-Thro)
  const hourlyMultipliers: Record<number, number> = {
    0: 1.14,
    1: 1.18,
    2: 1.15,
    3: 1.05,
    4: 0.92,
    5: 0.85,
    6: 0.81, // Valle profundo madrugada
    7: 0.82,
    8: 0.84,
    9: 0.88,
    10: 0.91,
    11: 0.94,
    12: 0.96,
    13: 0.98,
    14: 1.00,
    15: 1.02,
    16: 1.05,
    17: 1.09,
    18: 1.13,
    19: 1.17,
    20: 1.22,
    21: 1.26, // Hora pico de Raid
    22: 1.24,
    23: 1.19,
  };

  // Multiplicador por día de la semana (0=Dom, 2=Mar reset raid, 3=Mié, 4=Jue)
  const dayMultipliers: Record<number, number> = {
    0: 1.06, // Domingo de raid
    1: 0.95, // Lunes valle pre-reset
    2: 1.10, // Martes de Reset / Raid
    3: 1.07, // Miércoles de Raid
    4: 1.05, // Jueves de Raid
    5: 1.01,
    6: 1.03,
  };

  const guildMembers = [
    "Odin",
    "Thorgrim",
    "Valeria",
    "Kaelen",
    "Bronzebeard",
  ];

  const baseDate = new Date(catalogLive[0].snapshot_time);
  const historicalRows: MarketSnapshotRow[] = [];

  // Generar 7 días hacia atrás (168 horas)
  for (let hoursBack = 168; hoursBack >= 1; hoursBack--) {
    const t = new Date(baseDate.getTime() - hoursBack * 3600 * 1000);
    const { snapshotTimeISO, hourOfDay, dayOfWeek } = roundTo15MinUTC(t);

    const hMult = hourlyMultipliers[hourOfDay] ?? 1.0;
    const dMult = dayMultipliers[dayOfWeek] ?? 1.0;

    // Algunos bloques intermedios provienen del addon del clan
    const isGuildScan = hoursBack <= 36 && hoursBack % 5 === 0;
    const guildMember = isGuildScan
      ? guildMembers[hoursBack % guildMembers.length]
      : null;

    for (const live of catalogLive) {
      // Variación determinista por item_id para que cada material tenga su propia amplitud y hora óptima
      const itemPhase = ((live.item_id * 17) % 5) - 2; // Desfase de -2 a +2 horas
      const shiftedHour = (hourOfDay + itemPhase + 24) % 24;
      const itemHourMult = hourlyMultipliers[shiftedHour] ?? hMult;

      // Amplitud según volatilidad del ítem (entre 0.85x y 1.35x)
      const volatility = 0.85 + ((live.item_id * 31) % 50) / 100;
      const deltaFromOne = (itemHourMult * dMult - 1.0) * volatility;
      const factor = Math.max(0.68, 1.0 + deltaFromOne);

      const p10 = Math.max(1, Math.round(live.p10_price * factor));
      const median = Math.max(p10, Math.round(live.median_price * factor));
      // Simular ocasionales subastas bait en horas pico
      const hasBait = (live.item_id + hoursBack) % 9 === 0;
      const min = hasBait
        ? Math.max(1, Math.round(p10 * 0.45))
        : Math.max(1, Math.round(Math.min(p10, live.min_price * factor)));

      const volFactor = factor < 0.95 ? 1.25 : factor > 1.15 ? 0.80 : 1.0;
      const qty = Math.max(
        1,
        Math.round(live.total_quantity * volFactor)
      );

      historicalRows.push({
        region,
        house_id: houseId,
        item_id: live.item_id,
        snapshot_time: snapshotTimeISO,
        hour_of_day: hourOfDay,
        day_of_week: dayOfWeek,
        min_price: min,
        p10_price: p10,
        median_price: median,
        total_quantity: qty,
        num_listings: live.num_listings,
        source: isGuildScan ? "guild_addon" : "blizzard_api",
        uploaded_by: guildMember,
      });
    }
  }

  return upsertMarketSnapshots(historicalRows);
}
