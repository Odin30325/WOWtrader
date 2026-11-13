"use client";

import React, { useEffect, useRef } from "react";
import { createChart, ColorType, UTCTimestamp } from "lightweight-charts";
import { formatCopperText } from "@/lib/stats";

interface TimeseriesPoint {
  snapshot_time: string;
  unix_time: number;
  min_price: number;
  p10_price: number;
  median_price: number;
  total_quantity: number;
  source: string;
}

interface IntradayChartProps {
  data: TimeseriesPoint[];
  itemName: string;
}

export function IntradayChart({ data, itemName }: IntradayChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: "#0b1120" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.6)" },
        horzLines: { color: "rgba(30, 41, 59, 0.6)" },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
        scaleMargins: {
          top: 0.08,
          bottom: 0.28,
        },
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (price: number) => formatCopperText(Math.round(price)),
      },
      crosshair: {
        mode: 1,
      },
    });

    // Serie Principal: Precio Suelo Real (P10)
    const p10Series = chart.addAreaSeries({
      title: "P10 Real (Anti-Bait)",
      lineColor: "#10b981",
      topColor: "rgba(16, 185, 129, 0.32)",
      bottomColor: "rgba(16, 185, 129, 0.02)",
      lineWidth: 2,
    });

    // Serie Secundaria: Mediana Ponderada
    const medianSeries = chart.addLineSeries({
      title: "Mediana Mercado",
      color: "#38bdf8",
      lineWidth: 1,
      lineStyle: 2,
    });

    // Serie de Alerta: Precio Mínimo Crudo (Baiters de 1c)
    const minSeries = chart.addLineSeries({
      title: "Mínimo Crudo (Baits)",
      color: "#f43f5e",
      lineWidth: 1,
      lineStyle: 3,
    });

    // Histograma Inferior: Volumen Disponible (total_quantity)
    const volumeSeries = chart.addHistogramSeries({
      title: "Volumen (uds)",
      color: "rgba(99, 102, 241, 0.45)",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.76,
        bottom: 0,
      },
    });

    // Deduplicar y ordenar por timestamp ascendente
    const uniqueByTime = new Map<number, TimeseriesPoint>();
    for (const pt of data) {
      uniqueByTime.set(pt.unix_time, pt);
    }
    const sorted = Array.from(uniqueByTime.values()).sort(
      (a, b) => a.unix_time - b.unix_time
    );

    p10Series.setData(
      sorted.map((d) => ({
        time: d.unix_time as UTCTimestamp,
        value: d.p10_price,
      }))
    );

    medianSeries.setData(
      sorted.map((d) => ({
        time: d.unix_time as UTCTimestamp,
        value: d.median_price,
      }))
    );

    minSeries.setData(
      sorted.map((d) => ({
        time: d.unix_time as UTCTimestamp,
        value: d.min_price,
      }))
    );

    volumeSeries.setData(
      sorted.map((d) => ({
        time: d.unix_time as UTCTimestamp,
        value: d.total_quantity,
        color:
          d.source === "guild_addon"
            ? "rgba(56, 189, 248, 0.65)"
            : "rgba(99, 102, 241, 0.40)",
      }))
    );

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, itemName]);

  return (
    <div className="relative w-full rounded-xl border border-slate-800 bg-[#0b1120] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
        <div className="text-xs text-slate-400">
          Serie Temporal TradingView:{" "}
          <span className="text-slate-200 font-semibold">{itemName}</span> (Bloques
          15 min UTC)
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            P10 Suelo Real
          </span>
          <span className="inline-flex items-center gap-1.5 text-sky-400">
            <span className="w-2.5 h-0.5 bg-sky-400" />
            Mediana Ponderada
          </span>
          <span className="inline-flex items-center gap-1.5 text-rose-400">
            <span className="w-2.5 h-0.5 bg-rose-400" />
            Mínimo Crudo (Detector Bait)
          </span>
          <span className="inline-flex items-center gap-1.5 text-indigo-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/60" />
            Volumen Disponible
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full h-[360px]" />
    </div>
  );
}
