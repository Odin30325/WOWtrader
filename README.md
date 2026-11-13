# Forever Market Audit — Sistema Híbrido de Auditoría de Mercado y Arbitraje Intradía (`WoW: Forever`)

Plataforma de inteligencia de mercado en tiempo real diseñada específicamente para **World of Warcraft: Forever** (`1.60.1_70399` · Interface TOC `106001`).

## 1. Arquitectura Específica de `WoW: Forever`

1. **API Oficial "Realmless" basada en Rulesets (`dynamic-forever-us` / `static-forever-us`):**
   - Índices de casas de subasta por `ruleset` (`1` = PvP, `2` = Normal, `3` = RP, `15` = RP-PvP):
     `GET https://us.api.blizzard.com/data/wow/ruleset/{rulesetId}/auctions/index?namespace=dynamic-forever-us`
   - Subastas de equipo y objetos no apilables (`buyout`):
     `GET https://us.api.blizzard.com/data/wow/ruleset/{rulesetId}/auctions/{houseId}?namespace=dynamic-forever-us`
   - Subastas de Materias Primas / Commodities (`unit_price`):
     `GET https://us.api.blizzard.com/data/wow/ruleset/{rulesetId}/auctions/{houseId}/commodities?namespace=dynamic-forever-us`
   - **Deduplicación por `house_id + region`**: Todos los `rulesets` que comparten la misma casa de subastas (ej. `houseId = 110` o `houseId = 113`) se consolidan bajo `UNIQUE (house_id, item_id, snapshot_time)`.

2. **Algoritmo Anti-Manipulación (`p10_price`):**
   - Ordena las ofertas de menor a mayor precio unitario (`unit_price` o $\lfloor \text{buyout} / \text{quantity} \rfloor$).
   - Acumula las cantidades desde la más barata hasta alcanzar el $10\%$ del volumen total $\max(1, \lfloor 0.10 \times V \rfloor)$ para descartar subastas trampa (*baiters*) de 1 cobre.
   - Calcula el margen neto de arbitraje descontando siempre el $5\%$ de comisión de la Casa de Subastas:
     $$\text{Ganancia Neta} = \lfloor \text{Precio Venta Hora Pico} \times 0.95 \rfloor - \text{Precio Compra Hora Valle}$$

## 2. Estructura del Proyecto

- `supabase/migrations/001_forever_market_schema.sql`: Esquema DDL completo para PostgreSQL / Supabase (`items_catalog`, `market_snapshots`, `recipes_catalog`, `ingest_watermarks`).
- `src/lib/stats.ts`: Motor estadístico anti-manipulación (`computeItemMarketStats`, `calculateArbitrage`, `roundTo15MinUTC`).
- `src/lib/ingester.ts` y `worker/poller.ts`: Cloud Poller 24/7 con OAuth2 Client Credentials, compresión `gzip`, cabeceras `If-Modified-Since` / `Last-Modified` y resolución automática de nombres e iconos en español desde `static-forever-us`.
- `src/lib/lua-parser.ts` y `src/app/api/ingest/addon/route.ts`: Parser de `ForeverMarketAudit.lua` (`SavedVariables`) para ingestas colaborativas del clan cada 15 minutos.
- `src/lib/lua-exporter.ts` y `src/app/api/addon/export/route.ts`: Generador de `ForeverMarketData.lua` con datos horarios para los *tooltips* dentro del juego.
- `addon/ForeverMarketAudit/`: Addon 100% legal (`Interface: 106001`) usando `C_AuctionHouse` y `TooltipDataProcessor`.

## 3. Comandos Rápidos

```bash
# 1. Ejecutar ingesta inmediata desde la API oficial de Blizzard (dynamic-forever-us)
npm run ingest

# 2. Iniciar el Worker 24/7 (consulta horaria respetando Last-Modified / If-Modified-Since)
npm run worker

# 3. Subir un archivo ForeverMarketAudit.lua desde terminal
npm run sync-addon -- addon/sample_SavedVariables/ForeverMarketAudit.lua

# 4. Iniciar el Dashboard Web en http://localhost:3000
npm run dev
```
