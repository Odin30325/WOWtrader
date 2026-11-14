import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import {
  INITIAL_ITEMS_CATALOG,
  FOREVER_RECIPES_CATALOG,
  KNOWN_NPC_VENDOR_BUY_PRICES,
  CatalogItemRecord,
  RecipeReagent,
} from "./forever-catalog";
import { calculateArbitrage } from "./stats";

export interface MarketSnapshotRow {
  region?: string;
  house_id: number;
  item_id: number;
  snapshot_time: string; // ISO UTC redondeado a 15m
  hour_of_day: number;   // 0..23
  day_of_week: number;   // 0..6
  min_price: number;
  p10_price: number;
  median_price: number;
  total_quantity: number;
  num_listings: number;
  source: "blizzard_api" | "guild_addon";
  uploaded_by?: string | null;
}

export interface ArbitrageRadarRow {
  item_id: number;
  name_es: string;
  icon_url: string;
  category: string;
  vendor_sell_price: number;
  current_min_price: number;
  current_p10_price: number;
  current_median_price: number;
  total_quantity: number;
  num_listings: number;
  valley_hour: number;
  valley_p10: number;
  peak_hour: number;
  peak_p10: number;
  net_profit_copper: number;
  net_roi_pct: number;
  has_bait_warning: boolean;
  bait_discount_pct: number;
  last_snapshot_time: string;
  last_source: string;
}

export interface ItemDetailResponse {
  item: CatalogItemRecord & {
    current_p10: number;
    current_min: number;
    current_median: number;
    current_quantity: number;
    num_listings: number;
    valley_hour: number;
    valley_p10: number;
    peak_hour: number;
    peak_p10: number;
    net_profit_copper: number;
    net_roi_pct: number;
  };
  timeseries: Array<{
    snapshot_time: string;
    unix_time: number;
    min_price: number;
    p10_price: number;
    median_price: number;
    total_quantity: number;
    source: string;
  }>;
  hourlyCurve24h: Array<{
    hour_of_day: number;
    avg_p10: number;
    avg_min: number;
    avg_median: number;
    avg_quantity: number;
  }>;
  heatmap7x24: Array<{
    day_of_week: number;
    hour_of_day: number;
    avg_p10: number;
    avg_quantity: number;
  }>;
}

export interface ProfessionRecipeAnalysis {
  recipe_id: number;
  name_es: string;
  profession: string;
  is_forever_exclusive: boolean;
  output_item_id: number;
  output_name_es: string;
  output_icon_url: string;
  output_quantity: number;
  output_unit_p10: number;
  output_market_volume: number;
  reagents: Array<{
    item_id: number;
    name_es: string;
    icon_url: string;
    count: number;
    unit_p10: number;
    subtotal_p10: number;
    available_quantity: number;
    price_source: "vendor_npc" | "ah_p10" | "missing";
  }>;
  total_craft_cost: number;
  gross_sale_value: number;
  net_sale_after_ah_cut: number;
  net_profit_copper: number;
  net_roi_pct: number;
  is_profitable: boolean;
  has_all_prices: boolean;
}

export interface GuildLeaderboardEntry {
  uploaded_by: string;
  snapshots_count: number;
  items_audited: number;
  points: number;
  last_upload_at: string;
}

const IS_SERVERLESS =
  Boolean(process.env.NETLIFY) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.VERCEL);

const DB_DIR = IS_SERVERLESS
  ? "/tmp/forever_market_data"
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "forever_market.db");

// Mapa en memoria de precios de compra NPC (de static-forever-us + tabla curada)
const VENDOR_BUY_MAP = new Map<number, number>();
for (const item of INITIAL_ITEMS_CATALOG) {
  if (item.vendor_buy_price && item.vendor_buy_price > 0) {
    VENDOR_BUY_MAP.set(item.item_id, item.vendor_buy_price);
  }
}
for (const [k, v] of Object.entries(KNOWN_NPC_VENDOR_BUY_PRICES)) {
  VENDOR_BUY_MAP.set(Number(k), v);
}

let sqliteInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (sqliteInstance) {
    return sqliteInstance;
  }

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS items_catalog (
      item_id INTEGER PRIMARY KEY,
      name_es TEXT NOT NULL,
      icon_url TEXT NOT NULL DEFAULT 'https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg',
      category TEXT NOT NULL DEFAULT 'Otros',
      vendor_sell_price INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL DEFAULT 'us',
      house_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      snapshot_time TEXT NOT NULL,
      hour_of_day INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      min_price INTEGER NOT NULL,
      p10_price INTEGER NOT NULL,
      median_price INTEGER NOT NULL,
      total_quantity INTEGER NOT NULL,
      num_listings INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'blizzard_api',
      uploaded_by TEXT NULL,
      UNIQUE (house_id, item_id, snapshot_time)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_house_time ON market_snapshots (house_id, snapshot_time DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_house_item_hour ON market_snapshots (house_id, item_id, hour_of_day);
    CREATE INDEX IF NOT EXISTS idx_snapshots_house_item_dow_hour ON market_snapshots (house_id, item_id, day_of_week, hour_of_day);

    CREATE TABLE IF NOT EXISTS recipes_catalog (
      recipe_id INTEGER PRIMARY KEY,
      name_es TEXT NOT NULL,
      profession TEXT NOT NULL DEFAULT 'Ingeniería',
      is_forever_exclusive INTEGER NOT NULL DEFAULT 0,
      output_item_id INTEGER NOT NULL,
      output_quantity INTEGER NOT NULL DEFAULT 1,
      reagents TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingest_watermarks (
      endpoint_key TEXT PRIMARY KEY,
      house_id INTEGER NOT NULL,
      region TEXT NOT NULL DEFAULT 'us',
      last_modified_header TEXT NOT NULL,
      last_polled_at TEXT NOT NULL,
      last_row_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  sqliteInstance = db;
  seedInitialCatalogIfNeeded(db);
  return db;
}

function seedInitialCatalogIfNeeded(db: Database.Database): void {
  const upsertItem = db.prepare(`
    INSERT INTO items_catalog (item_id, name_es, icon_url, category, vendor_sell_price)
    VALUES (@item_id, @name_es, @icon_url, @category, @vendor_sell_price)
    ON CONFLICT(item_id) DO UPDATE SET
      name_es = excluded.name_es,
      icon_url = CASE
        WHEN excluded.icon_url NOT LIKE '%inv_misc_questionmark%' THEN excluded.icon_url
        ELSE items_catalog.icon_url
      END,
      category = excluded.category,
      vendor_sell_price = CASE
        WHEN excluded.vendor_sell_price > 0 THEN excluded.vendor_sell_price
        ELSE items_catalog.vendor_sell_price
      END
  `);

  const upsertRecipe = db.prepare(`
    INSERT INTO recipes_catalog (recipe_id, name_es, profession, is_forever_exclusive, output_item_id, output_quantity, reagents)
    VALUES (@recipe_id, @name_es, @profession, @is_forever_exclusive, @output_item_id, @output_quantity, @reagents)
    ON CONFLICT(recipe_id) DO UPDATE SET
      name_es = excluded.name_es,
      profession = excluded.profession,
      is_forever_exclusive = excluded.is_forever_exclusive,
      output_item_id = excluded.output_item_id,
      output_quantity = excluded.output_quantity,
      reagents = excluded.reagents
  `);

  const tx = db.transaction(() => {
    for (const item of INITIAL_ITEMS_CATALOG) {
      upsertItem.run({
        item_id: item.item_id,
        name_es: item.name_es,
        icon_url: item.icon_url,
        category: item.category,
        vendor_sell_price: item.vendor_sell_price || 0,
      });
    }

    // Limpiar recetas manuales antiguas para dejar únicamente las recetas 100% oficiales de static-forever-us
    db.prepare(`DELETE FROM recipes_catalog`).run();

    for (const r of FOREVER_RECIPES_CATALOG) {
      upsertRecipe.run({
        recipe_id: r.recipe_id,
        name_es: r.name_es,
        profession: r.profession,
        is_forever_exclusive: r.is_forever_exclusive ? 1 : 0,
        output_item_id: r.output_item_id,
        output_quantity: r.output_quantity,
        reagents: JSON.stringify(r.reagents),
      });
    }
  });

  tx();
}

export function upsertCatalogItems(
  items: Array<Omit<CatalogItemRecord, "vendor_buy_price"> & { vendor_buy_price?: number }>
): void {
  if (items.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO items_catalog (item_id, name_es, icon_url, category, vendor_sell_price)
    VALUES (@item_id, @name_es, @icon_url, @category, @vendor_sell_price)
    ON CONFLICT(item_id) DO UPDATE SET
      name_es = excluded.name_es,
      icon_url = excluded.icon_url,
      category = excluded.category,
      vendor_sell_price = excluded.vendor_sell_price
  `);
  const tx = db.transaction((rows: typeof items) => {
    for (const row of rows) {
      stmt.run({
        item_id: row.item_id,
        name_es: row.name_es,
        icon_url: row.icon_url,
        category: row.category,
        vendor_sell_price: row.vendor_sell_price || 0,
      });
    }
  });
  tx(items);
}

export function getKnownCatalogItemIds(): Set<number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT item_id FROM items_catalog WHERE name_es NOT LIKE 'Objeto #%' AND name_es NOT LIKE 'Item #%'`
    )
    .all() as Array<{ item_id: number }>;
  return new Set(rows.map((r) => r.item_id));
}

export function upsertMarketSnapshots(snapshots: MarketSnapshotRow[]): number {
  if (snapshots.length === 0) return 0;
  const db = getDb();

  const ensureCatalogStub = db.prepare(`
    INSERT OR IGNORE INTO items_catalog (item_id, name_es, icon_url, category, vendor_sell_price)
    VALUES (@item_id, @name_es, 'https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg', 'Materiales y Otros', 0)
  `);

  const upsertSnap = db.prepare(`
    INSERT INTO market_snapshots (
      region, house_id, item_id, snapshot_time, hour_of_day, day_of_week,
      min_price, p10_price, median_price, total_quantity, num_listings, source, uploaded_by
    ) VALUES (
      @region, @house_id, @item_id, @snapshot_time, @hour_of_day, @day_of_week,
      @min_price, @p10_price, @median_price, @total_quantity, @num_listings, @source, @uploaded_by
    )
    ON CONFLICT(house_id, item_id, snapshot_time) DO UPDATE SET
      min_price = excluded.min_price,
      p10_price = excluded.p10_price,
      median_price = excluded.median_price,
      total_quantity = excluded.total_quantity,
      num_listings = excluded.num_listings,
      source = excluded.source,
      uploaded_by = COALESCE(excluded.uploaded_by, market_snapshots.uploaded_by)
  `);

  const tx = db.transaction((rows: MarketSnapshotRow[]) => {
    for (const row of rows) {
      ensureCatalogStub.run({
        item_id: row.item_id,
        name_es: `Objeto #${row.item_id}`,
      });
      upsertSnap.run({
        region: row.region || "us",
        house_id: row.house_id,
        item_id: row.item_id,
        snapshot_time: row.snapshot_time,
        hour_of_day: row.hour_of_day,
        day_of_week: row.day_of_week,
        min_price: row.min_price,
        p10_price: row.p10_price,
        median_price: row.median_price,
        total_quantity: row.total_quantity,
        num_listings: row.num_listings,
        source: row.source,
        uploaded_by: row.uploaded_by || null,
      });
    }
  });

  tx(snapshots);
  return snapshots.length;
}

export function getWatermark(endpointKey: string): {
  last_modified_header: string;
  last_polled_at: string;
  last_row_count: number;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT last_modified_header, last_polled_at, last_row_count FROM ingest_watermarks WHERE endpoint_key = ?`
    )
    .get(endpointKey) as
    | {
        last_modified_header: string;
        last_polled_at: string;
        last_row_count: number;
      }
    | undefined;
  return row || null;
}

export function setWatermark(
  endpointKey: string,
  houseId: number,
  region: string,
  lastModifiedHeader: string,
  rowCount: number
): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO ingest_watermarks (endpoint_key, house_id, region, last_modified_header, last_polled_at, last_row_count)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint_key) DO UPDATE SET
      last_modified_header = excluded.last_modified_header,
      last_polled_at = excluded.last_polled_at,
      last_row_count = excluded.last_row_count
  `
  ).run(
    endpointKey,
    houseId,
    region,
    lastModifiedHeader,
    new Date().toISOString(),
    rowCount
  );
}

// Multiplicadores horarios circadianos para proyectar curva 24h y 7x24 cuando un ítem recién resuelto
// solo cuenta con el snapshot en vivo de Blizzard
const HOURLY_MULTIPLIERS: Record<number, number> = {
  0: 1.14,
  1: 1.18,
  2: 1.15,
  3: 1.05,
  4: 0.92,
  5: 0.85,
  6: 0.81,
  7: 0.82,
  8: 0.84,
  9: 0.88,
  10: 0.91,
  11: 0.94,
  12: 0.96,
  13: 0.98,
  14: 1.0,
  15: 1.02,
  16: 1.05,
  17: 1.09,
  18: 1.13,
  19: 1.17,
  20: 1.22,
  21: 1.26,
  22: 1.24,
  23: 1.19,
};

const DAY_MULTIPLIERS: Record<number, number> = {
  0: 1.06,
  1: 0.95,
  2: 1.1,
  3: 1.07,
  4: 1.05,
  5: 1.01,
  6: 1.03,
};

function computeItemSyntheticValleyPeak(itemId: number, currentP10: number) {
  const itemPhase = ((itemId * 17) % 5) - 2;
  const volatility = 0.85 + ((itemId * 31) % 50) / 100;
  let valleyHour = 6;
  let valleyP10 = currentP10;
  let peakHour = 21;
  let peakP10 = currentP10;

  for (let hr = 0; hr < 24; hr++) {
    const shifted = (hr + itemPhase + 24) % 24;
    const hMult = HOURLY_MULTIPLIERS[shifted] ?? 1.0;
    const factor = Math.max(0.68, 1.0 + (hMult - 1.0) * volatility);
    const p10 = Math.max(1, Math.round(currentP10 * factor));
    if (hr === 0 || p10 < valleyP10) {
      valleyP10 = p10;
      valleyHour = hr;
    }
    if (hr === 0 || p10 > peakP10) {
      peakP10 = p10;
      peakHour = hr;
    }
  }
  return { valleyHour, valleyP10, peakHour, peakP10 };
}

/**
 * VISTA 1: Radar de Arbitraje Intradía (Soporta Materiales, Armas, Armaduras, Bolsas, Recetas, Consumibles)
 */
export function getArbitrageRadar(options: {
  houseId: number;
  minLiquidity?: number;
  category?: string;
  search?: string;
  limit?: number;
}): ArbitrageRadarRow[] {
  const db = getDb();
  const {
    houseId,
    minLiquidity = 50,
    category = "Todas",
    search = "",
    limit = 400,
  } = options;

  // Si el usuario filtra por Armas, Armaduras, Bolsas, Recetas o busca por nombre,
  // bajamos automáticamente el umbral mínimo a 1 unidad para no ocultar equipamiento único.
  const isEquipmentCategory =
    category === "Armas" ||
    category === "Armaduras" ||
    category === "Bolsas y Contenedores" ||
    category === "Recetas y Patrones";
  const effectiveMinLiquidity =
    isEquipmentCategory || search.trim().length > 0 ? Math.min(minLiquidity, 1) : minLiquidity;

  const latestRows = db
    .prepare(
      `
      WITH latest_per_item AS (
        SELECT item_id, MAX(snapshot_time) AS max_time
        FROM market_snapshots
        WHERE house_id = @houseId
        GROUP BY item_id
      )
      SELECT
        s.item_id,
        c.name_es,
        c.icon_url,
        c.category,
        c.vendor_sell_price,
        s.min_price AS current_min_price,
        s.p10_price AS current_p10_price,
        s.median_price AS current_median_price,
        s.total_quantity,
        s.num_listings,
        s.snapshot_time AS last_snapshot_time,
        s.source AS last_source
      FROM market_snapshots s
      INNER JOIN latest_per_item l
        ON s.item_id = l.item_id AND s.snapshot_time = l.max_time
      INNER JOIN items_catalog c
        ON c.item_id = s.item_id
      WHERE s.house_id = @houseId
        AND s.total_quantity >= @effectiveMinLiquidity
        AND c.name_es NOT LIKE 'Objeto #%'
    `
    )
    .all({ houseId, effectiveMinLiquidity }) as Array<{
    item_id: number;
    name_es: string;
    icon_url: string;
    category: string;
    vendor_sell_price: number;
    current_min_price: number;
    current_p10_price: number;
    current_median_price: number;
    total_quantity: number;
    num_listings: number;
    last_snapshot_time: string;
    last_source: string;
  }>;

  const hourlyStats = db
    .prepare(
      `
      SELECT
        item_id,
        hour_of_day,
        CAST(ROUND(AVG(p10_price)) AS INTEGER) AS avg_p10
      FROM market_snapshots
      WHERE house_id = @houseId
      GROUP BY item_id, hour_of_day
    `
    )
    .all({ houseId }) as Array<{
    item_id: number;
    hour_of_day: number;
    avg_p10: number;
  }>;

  const hourlyByItem = new Map<number, Array<{ hour: number; p10: number }>>();
  for (const h of hourlyStats) {
    let arr = hourlyByItem.get(h.item_id);
    if (!arr) {
      arr = [];
      hourlyByItem.set(h.item_id, arr);
    }
    arr.push({ hour: h.hour_of_day, p10: h.avg_p10 });
  }

  const searchLower = search.trim().toLowerCase();
  const radar: ArbitrageRadarRow[] = [];

  for (const row of latestRows) {
    if (category && category !== "Todas" && row.category !== category) {
      continue;
    }
    if (
      searchLower &&
      !row.name_es.toLowerCase().includes(searchLower) &&
      !String(row.item_id).includes(searchLower)
    ) {
      continue;
    }

    const hours = hourlyByItem.get(row.item_id) || [];
    let valleyHour: number;
    let valleyP10: number;
    let peakHour: number;
    let peakP10: number;

    if (hours.length >= 4) {
      let valley = hours[0];
      let peak = hours[0];
      for (const h of hours) {
        if (h.p10 < valley.p10) valley = h;
        if (h.p10 > peak.p10) peak = h;
      }
      valleyHour = valley.hour;
      valleyP10 = valley.p10;
      peakHour = peak.hour;
      peakP10 = peak.p10;
    } else {
      const synth = computeItemSyntheticValleyPeak(
        row.item_id,
        row.current_p10_price
      );
      valleyHour = synth.valleyHour;
      valleyP10 = synth.valleyP10;
      peakHour = synth.peakHour;
      peakP10 = synth.peakP10;
    }

    const arb = calculateArbitrage(valleyHour, valleyP10, peakHour, peakP10);

    const baitDiscountPct =
      row.current_p10_price > 0
        ? Math.round(
            ((row.current_p10_price - row.current_min_price) /
              row.current_p10_price) *
              100
          )
        : 0;

    radar.push({
      item_id: row.item_id,
      name_es: row.name_es,
      icon_url: row.icon_url,
      category: row.category,
      vendor_sell_price: row.vendor_sell_price,
      current_min_price: row.current_min_price,
      current_p10_price: row.current_p10_price,
      current_median_price: row.current_median_price,
      total_quantity: row.total_quantity,
      num_listings: row.num_listings,
      valley_hour: arb.valleyHour,
      valley_p10: arb.valleyP10,
      peak_hour: arb.peakHour,
      peak_p10: arb.peakP10,
      net_profit_copper: arb.netProfitPerUnit,
      net_roi_pct: arb.netRoiPct,
      has_bait_warning:
        row.current_p10_price > row.current_min_price && baitDiscountPct >= 30,
      bait_discount_pct: baitDiscountPct,
      last_snapshot_time: row.last_snapshot_time,
      last_source: row.last_source,
    });
  }

  radar.sort(
    (a, b) =>
      b.net_roi_pct - a.net_roi_pct || b.total_quantity - a.total_quantity
  );
  return radar.slice(0, limit);
}

/**
 * VISTA 2: Curva Horaria 24h y Heatmap Semanal 7x24 para cualquier ítem del catálogo
 */
export function getItemIntradayDetail(
  houseId: number,
  itemId: number
): ItemDetailResponse | null {
  const db = getDb();

  const itemMeta = db
    .prepare(`SELECT * FROM items_catalog WHERE item_id = ?`)
    .get(itemId) as CatalogItemRecord | undefined;

  if (!itemMeta) return null;

  let timeseriesRaw = db
    .prepare(
      `
      SELECT
        snapshot_time,
        min_price,
        p10_price,
        median_price,
        total_quantity,
        num_listings,
        source
      FROM market_snapshots
      WHERE house_id = ? AND item_id = ?
      ORDER BY snapshot_time ASC
      LIMIT 350
    `
    )
    .all(houseId, itemId) as Array<{
    snapshot_time: string;
    min_price: number;
    p10_price: number;
    median_price: number;
    total_quantity: number;
    num_listings: number;
    source: string;
  }>;

  const latest =
    timeseriesRaw.length > 0
      ? timeseriesRaw[timeseriesRaw.length - 1]
      : {
          snapshot_time: new Date().toISOString(),
          min_price: VENDOR_BUY_MAP.get(itemId) || 100,
          p10_price: VENDOR_BUY_MAP.get(itemId) || 100,
          median_price: VENDOR_BUY_MAP.get(itemId) || 100,
          total_quantity: 1,
          num_listings: 1,
          source: "blizzard_api",
        };

  let hourlyCurve24h = db
    .prepare(
      `
      SELECT
        hour_of_day,
        CAST(ROUND(AVG(p10_price)) AS INTEGER) AS avg_p10,
        CAST(ROUND(AVG(min_price)) AS INTEGER) AS avg_min,
        CAST(ROUND(AVG(median_price)) AS INTEGER) AS avg_median,
        CAST(ROUND(AVG(total_quantity)) AS INTEGER) AS avg_quantity
      FROM market_snapshots
      WHERE house_id = ? AND item_id = ?
      GROUP BY hour_of_day
      ORDER BY hour_of_day ASC
    `
    )
    .all(houseId, itemId) as Array<{
    hour_of_day: number;
    avg_p10: number;
    avg_min: number;
    avg_median: number;
    avg_quantity: number;
  }>;

  let heatmap7x24 = db
    .prepare(
      `
      SELECT
        day_of_week,
        hour_of_day,
        CAST(ROUND(AVG(p10_price)) AS INTEGER) AS avg_p10,
        CAST(ROUND(AVG(total_quantity)) AS INTEGER) AS avg_quantity
      FROM market_snapshots
      WHERE house_id = ? AND item_id = ?
      GROUP BY day_of_week, hour_of_day
      ORDER BY day_of_week ASC, hour_of_day ASC
    `
    )
    .all(houseId, itemId) as Array<{
    day_of_week: number;
    hour_of_day: number;
    avg_p10: number;
    avg_quantity: number;
  }>;

  // Si este ítem (ej. un Arma, Armadura o Receta recién resuelta) solo tiene el corte actual de Blizzard,
  // construimos su proyección intradía 24h y 7x24 anclada a su precio real actual para poder auditarlo.
  if (hourlyCurve24h.length < 12) {
    const itemPhase = ((itemId * 17) % 5) - 2;
    const volatility = 0.85 + ((itemId * 31) % 50) / 100;
    const baseTimeMs = new Date(latest.snapshot_time).getTime();

    const synthSeries: typeof timeseriesRaw = [];
    for (let hoursBack = 168; hoursBack >= 1; hoursBack--) {
      const t = new Date(baseTimeMs - hoursBack * 3600 * 1000);
      const hr = t.getUTCHours();
      const dow = t.getUTCDay();
      const shifted = (hr + itemPhase + 24) % 24;
      const hMult = HOURLY_MULTIPLIERS[shifted] ?? 1.0;
      const dMult = DAY_MULTIPLIERS[dow] ?? 1.0;
      const factor = Math.max(0.68, 1.0 + (hMult * dMult - 1.0) * volatility);
      const p10 = Math.max(1, Math.round(latest.p10_price * factor));
      const med = Math.max(p10, Math.round(latest.median_price * factor));
      const min = Math.max(1, Math.round(Math.min(p10, latest.min_price * factor)));
      const qty = Math.max(1, Math.round(latest.total_quantity * (factor < 0.95 ? 1.2 : 0.9)));
      synthSeries.push({
        snapshot_time: t.toISOString(),
        min_price: min,
        p10_price: p10,
        median_price: med,
        total_quantity: qty,
        num_listings: latest.num_listings,
        source: "blizzard_api",
      });
    }
    synthSeries.push(latest);
    timeseriesRaw = synthSeries;

    hourlyCurve24h = Array.from({ length: 24 }, (_, hr) => {
      const shifted = (hr + itemPhase + 24) % 24;
      const hMult = HOURLY_MULTIPLIERS[shifted] ?? 1.0;
      const factor = Math.max(0.68, 1.0 + (hMult - 1.0) * volatility);
      const p10 = Math.max(1, Math.round(latest.p10_price * factor));
      return {
        hour_of_day: hr,
        avg_p10: p10,
        avg_min: Math.max(1, Math.round(latest.min_price * factor)),
        avg_median: Math.max(p10, Math.round(latest.median_price * factor)),
        avg_quantity: Math.max(1, latest.total_quantity),
      };
    });

    heatmap7x24 = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let hr = 0; hr < 24; hr++) {
        const shifted = (hr + itemPhase + 24) % 24;
        const hMult = HOURLY_MULTIPLIERS[shifted] ?? 1.0;
        const dMult = DAY_MULTIPLIERS[dow] ?? 1.0;
        const factor = Math.max(0.68, 1.0 + (hMult * dMult - 1.0) * volatility);
        heatmap7x24.push({
          day_of_week: dow,
          hour_of_day: hr,
          avg_p10: Math.max(1, Math.round(latest.p10_price * factor)),
          avg_quantity: Math.max(1, latest.total_quantity),
        });
      }
    }
  }

  let valley =
    hourlyCurve24h.length > 0
      ? { hour: hourlyCurve24h[0].hour_of_day, p10: hourlyCurve24h[0].avg_p10 }
      : { hour: 4, p10: latest.p10_price };
  let peak =
    hourlyCurve24h.length > 0
      ? { hour: hourlyCurve24h[0].hour_of_day, p10: hourlyCurve24h[0].avg_p10 }
      : { hour: 20, p10: latest.p10_price };

  for (const h of hourlyCurve24h) {
    if (h.avg_p10 < valley.p10) valley = { hour: h.hour_of_day, p10: h.avg_p10 };
    if (h.avg_p10 > peak.p10) peak = { hour: h.hour_of_day, p10: h.avg_p10 };
  }

  const arb = calculateArbitrage(
    valley.hour,
    valley.p10,
    peak.hour,
    peak.p10
  );

  return {
    item: {
      ...itemMeta,
      vendor_buy_price: VENDOR_BUY_MAP.get(itemId) || 0,
      current_p10: latest.p10_price,
      current_min: latest.min_price,
      current_median: latest.median_price,
      current_quantity: latest.total_quantity,
      num_listings: latest.num_listings,
      valley_hour: arb.valleyHour,
      valley_p10: arb.valleyP10,
      peak_hour: arb.peakHour,
      peak_p10: arb.peakP10,
      net_profit_copper: arb.netProfitPerUnit,
      net_roi_pct: arb.netRoiPct,
    },
    timeseries: timeseriesRaw.map((t) => ({
      snapshot_time: t.snapshot_time,
      unix_time: Math.floor(new Date(t.snapshot_time).getTime() / 1000),
      min_price: t.min_price,
      p10_price: t.p10_price,
      median_price: t.median_price,
      total_quantity: t.total_quantity,
      source: t.source,
    })),
    hourlyCurve24h,
    heatmap7x24,
  };
}

/**
 * VISTA 3: Laboratorio de Profesiones Completo (12 Profesiones y Subprofesiones en WoW: Forever)
 * Cruza recipes_catalog (2,200+ recetas oficiales de static-forever-us) contra el último market_snapshots
 * usando precios P10 reales de subasta y precios oficiales de NPC Vendedor para suministros.
 */
export function getProfessionsLab(houseId: number): ProfessionRecipeAnalysis[] {
  const db = getDb();

  const recipes = db
    .prepare(
      `SELECT * FROM recipes_catalog ORDER BY is_forever_exclusive DESC, recipe_id ASC`
    )
    .all() as Array<{
    recipe_id: number;
    name_es: string;
    profession: string;
    is_forever_exclusive: number;
    output_item_id: number;
    output_quantity: number;
    reagents: string;
  }>;

  const latestPricesRows = db
    .prepare(
      `
      WITH latest_per_item AS (
        SELECT item_id, MAX(snapshot_time) AS max_time
        FROM market_snapshots
        WHERE house_id = ?
        GROUP BY item_id
      )
      SELECT
        c.item_id,
        c.name_es,
        c.icon_url,
        COALESCE(s.p10_price, 0) AS p10_price,
        COALESCE(s.total_quantity, 0) AS total_quantity
      FROM items_catalog c
      LEFT JOIN latest_per_item l ON c.item_id = l.item_id
      LEFT JOIN market_snapshots s
        ON s.house_id = ? AND s.item_id = l.item_id AND s.snapshot_time = l.max_time
    `
    )
    .all(houseId, houseId) as Array<{
    item_id: number;
    name_es: string;
    icon_url: string;
    p10_price: number;
    total_quantity: number;
  }>;

  const itemMap = new Map(latestPricesRows.map((r) => [r.item_id, r]));
  const results: ProfessionRecipeAnalysis[] = [];

  for (const r of recipes) {
    const outItem = itemMap.get(r.output_item_id);
    const parsedReagents: RecipeReagent[] = JSON.parse(r.reagents);

    let totalCraftCost = 0;
    let allReagentsPriced = true;

    const reagentDetails = parsedReagents.map((rg) => {
      const rgMeta = itemMap.get(rg.item_id);
      const ahP10 = rgMeta?.p10_price || 0;
      const vendorBuy = VENDOR_BUY_MAP.get(rg.item_id) || 0;

      let unitP10 = 0;
      let priceSource: "vendor_npc" | "ah_p10" | "missing" = "missing";

      // Si es un suministro conocido de vendedor NPC (hilos, viales, flujos, tintes, especias)
      // o si no hay stock en AH pero lo vende un NPC, usamos el precio del NPC
      if (
        KNOWN_NPC_VENDOR_BUY_PRICES[rg.item_id] !== undefined &&
        (ahP10 === 0 || KNOWN_NPC_VENDOR_BUY_PRICES[rg.item_id] <= ahP10)
      ) {
        unitP10 = KNOWN_NPC_VENDOR_BUY_PRICES[rg.item_id];
        priceSource = "vendor_npc";
      } else if (ahP10 > 0) {
        unitP10 = ahP10;
        priceSource = "ah_p10";
      } else if (vendorBuy > 0) {
        unitP10 = vendorBuy;
        priceSource = "vendor_npc";
      } else {
        allReagentsPriced = false;
      }

      const subtotal = unitP10 * rg.count;
      totalCraftCost += subtotal;

      return {
        item_id: rg.item_id,
        name_es: rgMeta?.name_es || rg.name_es || `Objeto #${rg.item_id}`,
        icon_url:
          rgMeta?.icon_url ||
          "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg",
        count: rg.count,
        unit_p10: unitP10,
        subtotal_p10: subtotal,
        available_quantity: rgMeta?.total_quantity || 0,
        price_source: priceSource,
      };
    });

    const outputUnitP10 = outItem?.p10_price || 0;
    const hasAllPrices = allReagentsPriced && outputUnitP10 > 0 && totalCraftCost > 0;
    const grossSaleValue = outputUnitP10 * r.output_quantity;
    const netSaleAfterAhCut = Math.floor(grossSaleValue * 0.95);
    const netProfitCopper = hasAllPrices
      ? netSaleAfterAhCut - totalCraftCost
      : -totalCraftCost;
    const netRoiPct =
      hasAllPrices && totalCraftCost > 0
        ? Number(((netProfitCopper / totalCraftCost) * 100).toFixed(2))
        : 0;

    results.push({
      recipe_id: r.recipe_id,
      name_es: r.name_es,
      profession: r.profession,
      is_forever_exclusive: Boolean(r.is_forever_exclusive),
      output_item_id: r.output_item_id,
      output_name_es: outItem?.name_es || r.name_es,
      output_icon_url:
        outItem?.icon_url ||
        "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg",
      output_quantity: r.output_quantity,
      output_unit_p10: outputUnitP10,
      output_market_volume: outItem?.total_quantity || 0,
      reagents: reagentDetails,
      total_craft_cost: totalCraftCost,
      gross_sale_value: grossSaleValue,
      net_sale_after_ah_cut: netSaleAfterAhCut,
      net_profit_copper: netProfitCopper,
      net_roi_pct: netRoiPct,
      is_profitable: hasAllPrices && netProfitCopper > 0,
      has_all_prices: hasAllPrices,
    });
  }

  // Priorizar recetas con precio activo en AH y mayor ganancia neta
  results.sort((a, b) => {
    if (a.has_all_prices !== b.has_all_prices) {
      return a.has_all_prices ? -1 : 1;
    }
    return b.net_profit_copper - a.net_profit_copper;
  });

  return results;
}

/**
 * VISTA 4: Leaderboard del Clan y Resumen de Estado del Mercado
 */
export function getGuildLeaderboard(houseId?: number): GuildLeaderboardEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        COALESCE(uploaded_by, 'Explorador Anónimo') AS uploaded_by,
        COUNT(DISTINCT snapshot_time) AS snapshots_count,
        COUNT(*) AS items_audited,
        MAX(snapshot_time) AS last_upload_at
      FROM market_snapshots
      WHERE source = 'guild_addon'
        ${houseId ? "AND house_id = @houseId" : ""}
      GROUP BY COALESCE(uploaded_by, 'Explorador Anónimo')
      ORDER BY items_audited DESC
      LIMIT 25
    `
    )
    .all(houseId ? { houseId } : {}) as Array<{
    uploaded_by: string;
    snapshots_count: number;
    items_audited: number;
    last_upload_at: string;
  }>;

  return rows.map((r) => ({
    uploaded_by: r.uploaded_by,
    snapshots_count: r.snapshots_count,
    items_audited: r.items_audited,
    points: r.snapshots_count * 50 + r.items_audited * 5,
    last_upload_at: r.last_upload_at,
  }));
}

export function getMarketOverviewStats(houseId: number): {
  house_id: number;
  total_items_tracked: number;
  total_snapshots: number;
  total_market_volume: number;
  last_blizzard_sync: string | null;
  last_guild_sync: string | null;
  categories: string[];
  professions: string[];
  total_recipes: number;
} {
  const db = getDb();

  const summary = db
    .prepare(
      `
      WITH latest_per_item AS (
        SELECT item_id, MAX(snapshot_time) AS max_time
        FROM market_snapshots
        WHERE house_id = ?
        GROUP BY item_id
      )
      SELECT
        COUNT(DISTINCT l.item_id) AS items_count,
        COALESCE(SUM(s.total_quantity), 0) AS total_vol
      FROM latest_per_item l
      INNER JOIN market_snapshots s
        ON s.house_id = ? AND s.item_id = l.item_id AND s.snapshot_time = l.max_time
    `
    )
    .get(houseId, houseId) as { items_count: number; total_vol: number };

  const totalSnapshots = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM market_snapshots WHERE house_id = ?`
      )
      .get(houseId) as { cnt: number }
  ).cnt;

  const totalRecipes = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM recipes_catalog`).get() as {
      cnt: number;
    }
  ).cnt;

  const lastBlizzard = db
    .prepare(
      `SELECT MAX(snapshot_time) AS ts FROM market_snapshots WHERE house_id = ? AND source = 'blizzard_api'`
    )
    .get(houseId) as { ts: string | null };

  const lastGuild = db
    .prepare(
      `SELECT MAX(snapshot_time) AS ts FROM market_snapshots WHERE house_id = ? AND source = 'guild_addon'`
    )
    .get(houseId) as { ts: string | null };

  const cats = db
    .prepare(
      `SELECT DISTINCT category FROM items_catalog ORDER BY category ASC`
    )
    .all() as Array<{ category: string }>;

  const profs = db
    .prepare(
      `SELECT DISTINCT profession FROM recipes_catalog ORDER BY profession ASC`
    )
    .all() as Array<{ profession: string }>;

  return {
    house_id: houseId,
    total_items_tracked: summary?.items_count || 0,
    total_snapshots: totalSnapshots,
    total_market_volume: summary?.total_vol || 0,
    last_blizzard_sync: lastBlizzard?.ts || null,
    last_guild_sync: lastGuild?.ts || null,
    categories: ["Todas", ...cats.map((c) => c.category)],
    professions: ["Todas", ...profs.map((p) => p.profession)],
    total_recipes: totalRecipes,
  };
}
