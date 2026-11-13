/**
 * MÓDULO C: Algoritmo de Procesamiento Estadístico Anti-Manipulación
 * WoW: Forever (Cliente 1.60.1_70399 | Interface TOC 106001)
 */

export interface RawOffer {
  unitPrice: number; // En cobre
  quantity: number;
}

export interface AggregatedItemStats {
  itemId: number;
  minPrice: number;
  p10Price: number;
  medianPrice: number;
  totalQuantity: number;
  numListings: number;
  hasBaitWarning: boolean;
  baitDiscountPct: number;
}

export interface ArbitrageCalculation {
  valleyHour: number;
  valleyP10: number;
  peakHour: number;
  peakP10: number;
  grossSpread: number;
  ahCut5Pct: number;
  netProfitPerUnit: number;
  netRoiPct: number;
  isProfitable: boolean;
}

/**
 * Redondea cualquier fecha o timestamp al bloque de 15 minutos en UTC inmediatamente anterior o igual.
 * Ej: 18:22:38 UTC -> 18:15:00.000Z
 */
export function roundTo15MinUTC(input: Date | number | string): {
  snapshotTimeISO: string;
  hourOfDay: number;
  dayOfWeek: number;
} {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  const validDate = isNaN(date.getTime()) ? new Date() : date;

  const ms15Min = 15 * 60 * 1000;
  const roundedMs = Math.floor(validDate.getTime() / ms15Min) * ms15Min;
  const rounded = new Date(roundedMs);

  return {
    snapshotTimeISO: rounded.toISOString(),
    hourOfDay: rounded.getUTCHours(), // 0..23 UTC
    dayOfWeek: rounded.getUTCDay(),   // 0 (Dom) .. 6 (Sáb) UTC
  };
}

/**
 * Procesa todas las ofertas activas de un item_id (ya sea de /auctions/{houseId},
 * /auctions/{houseId}/commodities o de ForeverMarketAudit.lua) y calcula:
 *  - min_price: precio unitario mínimo absoluto
 *  - p10_price: percentil 10 ponderado por volumen (acumula hasta max(1, floor(0.10 * V)))
 *  - median_price: percentil 50 ponderado por volumen (acumula hasta max(1, floor(0.50 * V)))
 *  - total_quantity: V = sum(quantity)
 *  - num_listings: cantidad de lotes/subastas
 */
export function computeItemMarketStats(
  itemId: number,
  offers: RawOffer[]
): AggregatedItemStats | null {
  // Filtrar ofertas inválidas (ej. pujas sin buyout o precios <= 0)
  const validOffers = offers.filter(
    (o) => Number.isFinite(o.unitPrice) && o.unitPrice > 0 && o.quantity > 0
  );

  if (validOffers.length === 0) {
    return null;
  }

  // 1. Ordenar todas las ofertas de menor a mayor precio unitario
  const sorted = [...validOffers].sort((a, b) => a.unitPrice - b.unitPrice);

  // 2. Calcular el volumen total V = sum(quantity)
  let totalQuantity = 0;
  for (let i = 0; i < sorted.length; i++) {
    totalQuantity += sorted[i].quantity;
  }

  if (totalQuantity <= 0) {
    return null;
  }

  const minPrice = Math.round(sorted[0].unitPrice);

  // 3. Umbrales de volumen acumulado para P10 y Mediana (P50)
  const targetP10Volume = Math.max(1, Math.floor(0.10 * totalQuantity));
  const targetMedianVolume = Math.max(1, Math.floor(0.50 * totalQuantity));

  let accumulated = 0;
  let p10Price = minPrice;
  let p10Found = false;
  let medianPrice = minPrice;

  for (let i = 0; i < sorted.length; i++) {
    accumulated += sorted[i].quantity;

    if (!p10Found && accumulated >= targetP10Volume) {
      p10Price = Math.round(sorted[i].unitPrice);
      p10Found = true;
    }

    if (accumulated >= targetMedianVolume) {
      medianPrice = Math.round(sorted[i].unitPrice);
      break;
    }
  }

  // Detectar si existen "baiters" (ej. 1 mena a 1 cobre o >35% por debajo del suelo P10 real)
  const baitDiscountPct =
    p10Price > 0 ? Math.round(((p10Price - minPrice) / p10Price) * 100) : 0;
  const hasBaitWarning = p10Price > minPrice && baitDiscountPct >= 30;

  return {
    itemId,
    minPrice,
    p10Price,
    medianPrice,
    totalQuantity,
    numListings: validOffers.length,
    hasBaitWarning,
    baitDiscountPct,
  };
}

/**
 * 4. Cálculo de Margen Neto de Arbitraje Intradía:
 *    Ganancia Neta = (Precio Venta Hora Pico * 0.95) - Precio Compra Hora Valle
 *    (Descuenta siempre el 5% de comisión de la Casa de Subastas de la Alianza/Horda)
 */
export function calculateArbitrage(
  valleyHour: number,
  valleyP10: number,
  peakHour: number,
  peakP10: number
): ArbitrageCalculation {
  const safeValley = Math.max(1, Math.round(valleyP10));
  const safePeak = Math.max(1, Math.round(peakP10));

  const netSaleAfterCut = Math.floor(safePeak * 0.95);
  const ahCut5Pct = safePeak - netSaleAfterCut;
  const netProfitPerUnit = netSaleAfterCut - safeValley;
  const grossSpread = safePeak - safeValley;
  const netRoiPct = Number(((netProfitPerUnit / safeValley) * 100).toFixed(2));

  return {
    valleyHour,
    valleyP10: safeValley,
    peakHour,
    peakP10: safePeak,
    grossSpread,
    ahCut5Pct,
    netProfitPerUnit,
    netRoiPct,
    isProfitable: netProfitPerUnit > 0,
  };
}

/**
 * Convierte un valor en cobre a partes de Oro, Plata y Cobre (con signo si es negativo).
 */
export function splitCopperToGSC(copperAmount: number): {
  negative: boolean;
  gold: number;
  silver: number;
  copper: number;
} {
  const rounded = Math.round(copperAmount);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);

  const gold = Math.floor(abs / 10000);
  const silver = Math.floor((abs % 10000) / 100);
  const copper = abs % 100;

  return { negative, gold, silver, copper };
}

/**
 * Formatea cobre en texto legible (ej. "14g 52s 10c")
 */
export function formatCopperText(copperAmount: number): string {
  const { negative, gold, silver, copper } = splitCopperToGSC(copperAmount);
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0 || gold > 0) parts.push(`${silver}s`);
  parts.push(`${copper}c`);
  return (negative ? "-" : "") + parts.join(" ");
}
