import fs from "fs";
import path from "path";
import {
  fetchForeverAuctionHousesIndex,
  ingestBlizzardHouseSnapshot,
} from "../src/lib/ingester";
import { generateForeverMarketDataLua } from "../src/lib/lua-exporter";

async function runPollCycle(force = false) {
  const startTime = Date.now();
  const houseId = Number(process.env.DEFAULT_HOUSE_ID || 110);
  const rulesetId = Number(process.env.DEFAULT_RULESET_ID || 1);
  const region = process.env.BLIZZARD_REGION || "us";

  console.log(
    `\n[ForeverCloudPoller] Iniciando ciclo de auditoría | Región: ${region.toUpperCase()} | Ruleset: ${rulesetId} | House Primaria: ${houseId}`
  );

  try {
    const houses = await fetchForeverAuctionHousesIndex(rulesetId, region);
    console.log(
      `[ForeverCloudPoller] Casas de subasta únicas detectadas en dynamic-forever-${region}: ${houses
        .map((h) => `#${h.id} (${h.name})`)
        .join(", ")}`
    );
  } catch (err) {
    console.warn(
      `[ForeverCloudPoller] Aviso al consultar índice de rulesets:`,
      err
    );
  }

  // Ingestar la Casa de Subastas principal (110 = Alianza Principal)
  const res = await ingestBlizzardHouseSnapshot({
    rulesetId,
    houseId,
    region,
    force,
    enrichUnknownItems: true,
    seedHistoryIfFirstRun: true,
  });

  if (res.notModified) {
    console.log(
      `[ForeverCloudPoller] House #${houseId} sin cambios (HTTP 304 / Last-Modified: ${res.lastModifiedHeader}). Respetando límites de Blizzard.`
    );
  } else {
    console.log(
      `[ForeverCloudPoller] House #${houseId} procesada con éxito (${
        Date.now() - startTime
      }ms):`
    );
    console.log(`  - Corte temporal (UTC 15m): ${res.snapshotTimeISO}`);
    console.log(`  - Last-Modified Blizzard : ${res.lastModifiedHeader}`);
    console.log(
      `  - Subastas Equipo (buyout): ${res.rawEquipmentAuctions.toLocaleString()}`
    );
    console.log(
      `  - Subastas Commodities   : ${res.rawCommodityAuctions.toLocaleString()}`
    );
    console.log(
      `  - Ítems únicos agregados : ${res.aggregatedItemsCount.toLocaleString()}`
    );
    console.log(
      `  - Ítems enriquecidos ES  : ${res.enrichedCatalogCount}`
    );
    if (res.seededHistoryRows > 0) {
      console.log(
        `  - Serie intradía 7x24    : ${res.seededHistoryRows.toLocaleString()} registros inicializados`
      );
    }

    // Actualizar automáticamente ForeverMarketData.lua del Addon
    const addonDir = path.join(process.cwd(), "addon", "ForeverMarketAudit");
    if (fs.existsSync(addonDir)) {
      const luaData = generateForeverMarketDataLua(houseId);
      fs.writeFileSync(
        path.join(addonDir, "ForeverMarketData.lua"),
        luaData,
        "utf-8"
      );
      console.log(
        `  - ForeverMarketData.lua  : Actualizado en addon/ForeverMarketAudit/ForeverMarketData.lua`
      );
    }
  }
}

async function main() {
  const isOnce = process.argv.includes("--once");
  const isForce = process.argv.includes("--force");

  await runPollCycle(isForce);

  if (isOnce) {
    process.exit(0);
  }

  const intervalMs = 60 * 60 * 1000; // Cada 1 hora
  console.log(
    `[ForeverCloudPoller] Worker 24/7 activo. Próxima verificación en 60 minutos...`
  );
  setInterval(() => {
    runPollCycle(false).catch((err) =>
      console.error("[ForeverCloudPoller] Error en ciclo horario:", err)
    );
  }, intervalMs);
}

main().catch((err) => {
  console.error("[ForeverCloudPoller] Error fatal:", err);
  process.exit(1);
});
