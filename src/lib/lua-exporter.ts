import { getArbitrageRadar, getMarketOverviewStats } from "./db";

/**
 * Genera el contenido del archivo ForeverMarketData.lua con todas las estadísticas
 * horarias (P10 suelo real, Mediana, Hora Valle, Hora Pico, ROI Neto tras 5% AH cut)
 * para ser consumido directamente por los tooltips del addon ForeverMarketAudit en WoW: Forever.
 */
export function generateForeverMarketDataLua(houseId = 110): string {
  const overview = getMarketOverviewStats(houseId);
  const rows = getArbitrageRadar({
    houseId,
    minLiquidity: 1,
    category: "Todas",
    limit: 500,
  });

  const nowISO = new Date().toISOString();
  const lines: string[] = [
    "-- =============================================================================",
    "-- ForeverMarketData.lua — Base de Datos de Inteligencia Horaria para WoW: Forever",
    "-- Cliente: 1.60.1_70399 (Interface: 106001) | Generado automáticamente desde la Web",
    `-- House ID: ${houseId} | Última Sincronización: ${nowISO}`,
    "-- =============================================================================",
    "",
    "ForeverMarketData = {",
    `  ["generatedAt"] = "${nowISO}",`,
    `  ["houseId"] = ${houseId},`,
    `  ["totalItems"] = ${rows.length},`,
    `  ["lastBlizzardSync"] = "${overview.last_blizzard_sync || nowISO}",`,
    '  ["items"] = {',
  ];

  for (const r of rows) {
    const safeName = r.name_es.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const safeCat = r.category.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(
      `    [${r.item_id}] = { name = "${safeName}", cat = "${safeCat}", min = ${r.current_min_price}, p10 = ${r.current_p10_price}, median = ${r.current_median_price}, qty = ${r.total_quantity}, valleyH = ${r.valley_hour}, valleyP10 = ${r.valley_p10}, peakH = ${r.peak_hour}, peakP10 = ${r.peak_p10}, netProfit = ${r.net_profit_copper}, roi = ${r.net_roi_pct}, bait = ${r.has_bait_warning ? "true" : "false"} },`
    );
  }

  lines.push("  }");
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}
