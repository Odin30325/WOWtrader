import { computeItemMarketStats, RawOffer, roundTo15MinUTC } from "./stats";
import { MarketSnapshotRow } from "./db";

export interface ParsedAddonUploadResult {
  uploadedBy: string;
  houseId: number;
  region: string;
  snapshotTimeISO: string;
  snapshots: MarketSnapshotRow[];
}

/**
 * Convierte una tabla Lua de SavedVariables (ForeverMarketAuditDB = { ... })
 * en un objeto JavaScript válido o extrae sus bloques de ítems y ofertas.
 */
function luaTableToJsonCompatible(luaContent: string): unknown {
  // 1. Eliminar comentarios Lua (-- hasta fin de línea)
  let cleaned = luaContent.replace(/--[^\r\n]*/g, "");

  // 2. Extraer el cuerpo después de ForeverMarketAuditDB =
  const assignMatch = cleaned.match(/ForeverMarketAuditDB\s*=\s*(\{[\s\S]*\})/);
  if (assignMatch) {
    cleaned = assignMatch[1];
  } else {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  // 3. Transformar claves Lua: ["key"] = -> "key":  y  [12345] = -> "12345":
  cleaned = cleaned.replace(/\[\s*"([^"]+)"\s*\]\s*=/g, '"$1":');
  cleaned = cleaned.replace(/\[\s*(\d+)\s*\]\s*=/g, '"$1":');
  // Claves identificadoras simples: key = -> "key":
  cleaned = cleaned.replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g, '$1"$2":');
  // Reemplazar nil por null
  cleaned = cleaned.replace(/:\s*nil\b/g, ": null");

  // 4. Convertir listas Lua { { ... }, { ... } } (objetos sin clave dentro de llaves) a arrays JSON [ ... ]
  // Aplicamos múltiples pasadas de adentro hacia afuera para tablas que contienen elementos sin ':'
  for (let pass = 0; pass < 6; pass++) {
    cleaned = cleaned.replace(/\{([^{}]*)\}/g, (full, inner: string) => {
      const trimmed = inner.trim();
      if (!trimmed) return "[]";
      // Si el nivel actual tiene pares "clave": valor, es un objeto JSON
      if (/^"[^"]+"\s*:/.test(trimmed)) {
        return `{${inner}}`;
      }
      return `[${inner}]`;
    });
    // Segunda pasada para arrays de objetos: { {"a":1}, {"b":2} }
    cleaned = cleaned.replace(
      /\{\s*(\{[^{}]*\}(?:\s*,\s*\{[^{}]*\})*)\s*,?\s*\}/g,
      "[$1]"
    );
  }

  // 5. Eliminar comas finales antes de } o ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  return JSON.parse(cleaned);
}

/**
 * MÓDULO A.2: Parser de ForeverMarketAudit.lua (SavedVariables del Clan)
 * Soporta tanto el formato completo de ForeverMarketAuditDB como listas directas de ofertas
 * capturadas con C_AuctionHouse.
 */
export function parseForeverMarketAuditLua(
  rawContent: string,
  options?: {
    overridePlayer?: string;
    overrideHouseId?: number;
    region?: string;
  }
): ParsedAddonUploadResult {
  const defaultHouseId =
    options?.overrideHouseId || Number(process.env.DEFAULT_HOUSE_ID || 110);
  const region = options?.region || process.env.BLIZZARD_REGION || "us";

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = luaTableToJsonCompatible(rawContent) as Record<string, unknown>;
  } catch {
    // Fallback regex extractor si el archivo Lua tiene formato libre
    parsed = null;
  }

  let uploadedBy = options?.overridePlayer?.trim() || "";
  let houseId = defaultHouseId;
  let scanTimestampMs = Date.now();

  const snapshots: MarketSnapshotRow[] = [];

  if (parsed && typeof parsed === "object") {
    const meta = (parsed.meta || {}) as Record<string, unknown>;
    if (!uploadedBy && typeof meta.player === "string" && meta.player.trim()) {
      uploadedBy = meta.player.trim();
    }
    if (typeof meta.houseId === "number" && meta.houseId > 0) {
      houseId = options?.overrideHouseId || meta.houseId;
    }
    if (typeof meta.lastScanTime === "number" && meta.lastScanTime > 0) {
      scanTimestampMs =
        meta.lastScanTime < 10_000_000_000
          ? meta.lastScanTime * 1000
          : meta.lastScanTime;
    }

    // Procesar bloque latestItems o items
    const itemsContainer = (parsed.latestItems ||
      parsed.items ||
      {}) as Record<string, Record<string, unknown>>;

    const { snapshotTimeISO, hourOfDay, dayOfWeek } =
      roundTo15MinUTC(scanTimestampMs);

    for (const [key, itemVal] of Object.entries(itemsContainer)) {
      const itemId = Number(key);
      if (!Number.isFinite(itemId) || itemId <= 0 || !itemVal) continue;

      const rawOffers = Array.isArray(itemVal.offers)
        ? (itemVal.offers as Array<Record<string, unknown>>)
        : [];

      if (rawOffers.length > 0) {
        const offers: RawOffer[] = rawOffers
          .map((o) => ({
            unitPrice: Number(o.unitPrice ?? o.unit_price ?? o.buyout ?? 0),
            quantity: Math.max(1, Number(o.quantity ?? o.count ?? 1)),
          }))
          .filter((o) => o.unitPrice > 0);

        const stats = computeItemMarketStats(itemId, offers);
        if (stats) {
          snapshots.push({
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
            source: "guild_addon",
            uploaded_by: uploadedBy || "Miembro del Clan",
          });
          continue;
        }
      }

      // Si viene pre-agregado desde el addon
      const p10 = Number(
        itemVal.p10Price ?? itemVal.p10_price ?? itemVal.unitPrice ?? 0
      );
      const min = Number(itemVal.minPrice ?? itemVal.min_price ?? p10);
      const median = Number(
        itemVal.medianPrice ?? itemVal.median_price ?? p10
      );
      const qty = Math.max(
        1,
        Number(itemVal.totalQuantity ?? itemVal.total_quantity ?? itemVal.quantity ?? 1)
      );
      const listings = Math.max(
        1,
        Number(itemVal.numListings ?? itemVal.num_listings ?? 1)
      );

      if (p10 > 0) {
        snapshots.push({
          region,
          house_id: houseId,
          item_id: itemId,
          snapshot_time: snapshotTimeISO,
          hour_of_day: hourOfDay,
          day_of_week: dayOfWeek,
          min_price: min > 0 ? min : p10,
          p10_price: p10,
          median_price: median > 0 ? median : p10,
          total_quantity: qty,
          num_listings: listings,
          source: "guild_addon",
          uploaded_by: uploadedBy || "Miembro del Clan",
        });
      }
    }
  }

  // Fallback regex si el archivo Lua tenía bloques [itemID] = { ... } no estándar
  if (snapshots.length === 0) {
    const playerMatch = rawContent.match(/\["player"\]\s*=\s*"([^"]+)"/);
    if (!uploadedBy && playerMatch) {
      uploadedBy = playerMatch[1];
    }
    const tsMatch = rawContent.match(/\["lastScanTime"\]\s*=\s*(\d+)/);
    if (tsMatch) {
      const ts = Number(tsMatch[1]);
      scanTimestampMs = ts < 10_000_000_000 ? ts * 1000 : ts;
    }

    const { snapshotTimeISO, hourOfDay, dayOfWeek } =
      roundTo15MinUTC(scanTimestampMs);

    const itemBlockRegex = /\[(\d+)\]\s*=\s*\{([\s\S]*?)\n\s*\}/g;
    let match: RegExpExecArray | null;
    while ((match = itemBlockRegex.exec(rawContent)) !== null) {
      const itemId = Number(match[1]);
      const body = match[2];
      if (!itemId || itemId <= 0) continue;

      const offers: RawOffer[] = [];
      const offerRegex =
        /\["unitPrice"\]\s*=\s*(\d+)[\s\S]*?\["quantity"\]\s*=\s*(\d+)|\["quantity"\]\s*=\s*(\d+)[\s\S]*?\["unitPrice"\]\s*=\s*(\d+)/g;
      let om: RegExpExecArray | null;
      while ((om = offerRegex.exec(body)) !== null) {
        const unitPrice = Number(om[1] || om[4]);
        const quantity = Number(om[2] || om[3]);
        if (unitPrice > 0 && quantity > 0) {
          offers.push({ unitPrice, quantity });
        }
      }

      if (offers.length > 0) {
        const stats = computeItemMarketStats(itemId, offers);
        if (stats) {
          snapshots.push({
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
            source: "guild_addon",
            uploaded_by: uploadedBy || "Odin",
          });
        }
      }
    }
  }

  if (!uploadedBy) {
    uploadedBy = "Odin";
  }

  const { snapshotTimeISO } = roundTo15MinUTC(scanTimestampMs);

  return {
    uploadedBy,
    houseId,
    region,
    snapshotTimeISO,
    snapshots,
  };
}
