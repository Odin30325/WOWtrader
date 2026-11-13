-- =============================================================================
-- ESQUEMA DE BASE DE DATOS ANALÍTICA (Supabase / PostgreSQL)
-- Plataforma de Inteligencia de Mercado y Arbitraje Intradía — WoW: Forever
-- Versión Cliente: 1.60.1_70399 | Interface TOC: 106001
-- =============================================================================

-- 1. Catálogo Estático de Ítems (alimentado desde namespace static-forever-us)
CREATE TABLE IF NOT EXISTS items_catalog (
    item_id INT PRIMARY KEY,
    name_es TEXT NOT NULL,
    icon_url TEXT NOT NULL DEFAULT 'https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg',
    category TEXT NOT NULL DEFAULT 'Otros', -- Ej. Minería, Ingeniería, Consumibles, Hierbas
    vendor_sell_price INT NOT NULL DEFAULT 0 -- En cobre, desde static-forever-us
);

-- 2. Series Temporales Agregadas del Mercado (Snapshots en bloques de 15 min UTC)
-- NOTA: La clave de mercado es house_id + region (nunca ruleset_id) para evitar duplicar volúmenes.
CREATE TABLE IF NOT EXISTS market_snapshots (
    id BIGSERIAL PRIMARY KEY,
    region TEXT NOT NULL DEFAULT 'us',
    house_id INT NOT NULL,
    item_id INT NOT NULL REFERENCES items_catalog(item_id) ON DELETE CASCADE,
    snapshot_time TIMESTAMPTZ NOT NULL, -- Redondeado a bloques de 15 min en UTC
    hour_of_day SMALLINT NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23), -- 0 a 23 (perfil horario)
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0 a 6 (picos de días de banda)
    min_price BIGINT NOT NULL,       -- Precio unitario más bajo en cobre (incluye posibles baits)
    p10_price BIGINT NOT NULL,       -- Percentil 10 ponderado por cantidad (filtra subastas trampa de 1c)
    median_price BIGINT NOT NULL,    -- Mediana ponderada del mercado
    total_quantity INT NOT NULL,     -- Volumen total disponible
    num_listings INT NOT NULL,       -- Número de lotes/subastas activas
    source TEXT NOT NULL CHECK (source IN ('blizzard_api', 'guild_addon')),
    uploaded_by TEXT NULL,           -- Nombre del jugador del clan (para ranking Leaderboard)
    CONSTRAINT uq_market_snapshot_house_item_time UNIQUE (house_id, item_id, snapshot_time)
);

-- Índices para acelerar el Radar Intradía, Curva 24h y Heatmap 7x24
CREATE INDEX IF NOT EXISTS idx_snapshots_house_time ON market_snapshots (house_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_house_item_hour ON market_snapshots (house_id, item_id, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_snapshots_house_item_dow_hour ON market_snapshots (house_id, item_id, day_of_week, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_snapshots_guild_leaderboard ON market_snapshots (source, uploaded_by) WHERE source = 'guild_addon';

-- 3. Catálogo de Recetas de Profesiones (Ingeniería y Minería en WoW: Forever)
CREATE TABLE IF NOT EXISTS recipes_catalog (
    recipe_id INT PRIMARY KEY,
    name_es TEXT NOT NULL,
    profession TEXT NOT NULL DEFAULT 'Ingeniería', -- 'Ingeniería' | 'Minería'
    is_forever_exclusive BOOLEAN NOT NULL DEFAULT FALSE,
    output_item_id INT NOT NULL REFERENCES items_catalog(item_id),
    output_quantity INT NOT NULL DEFAULT 1,
    reagents JSONB NOT NULL -- Array de { "item_id": 2840, "count": 2 }
);

-- 4. Control de Cabeceras HTTP (Last-Modified / If-Modified-Since) del Cloud Poller
CREATE TABLE IF NOT EXISTS ingest_watermarks (
    endpoint_key TEXT PRIMARY KEY, -- Ej. 'us:house:110:auctions' o 'us:house:110:commodities'
    house_id INT NOT NULL,
    region TEXT NOT NULL DEFAULT 'us',
    last_modified_header TEXT NOT NULL,
    last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_row_count INT NOT NULL DEFAULT 0
);
