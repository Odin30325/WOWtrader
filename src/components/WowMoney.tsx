"use client";

import React from "react";
import { splitCopperToGSC } from "@/lib/stats";

interface WowMoneyProps {
  copper: number;
  className?: string;
  showSign?: boolean;
  compact?: boolean;
}

export function WowMoney({
  copper,
  className = "",
  showSign = false,
  compact = false,
}: WowMoneyProps) {
  const { negative, gold, silver, copper: cop } = splitCopperToGSC(copper);

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-xs sm:text-sm whitespace-nowrap ${
        negative ? "text-rose-400" : "text-slate-100"
      } ${className}`}
    >
      {negative && <span>-</span>}
      {!negative && showSign && copper > 0 && (
        <span className="text-emerald-400">+</span>
      )}
      {gold > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <span className="font-semibold text-amber-300">
            {gold.toLocaleString()}
          </span>
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 border border-yellow-200/60"
            title="Oro"
          />
        </span>
      )}
      {(silver > 0 || gold > 0) && (
        <span className="inline-flex items-center gap-0.5">
          <span className="font-medium text-slate-200">
            {gold > 0 ? String(silver).padStart(2, "0") : silver}
          </span>
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-slate-100 to-slate-400 border border-white/60"
            title="Plata"
          />
        </span>
      )}
      {(!compact || gold === 0) && (
        <span className="inline-flex items-center gap-0.5">
          <span className="text-orange-300">
            {silver > 0 || gold > 0 ? String(cop).padStart(2, "0") : cop}
          </span>
          <span
            className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br from-orange-300 to-amber-800 border border-orange-200/50"
            title="Cobre"
          />
        </span>
      )}
    </span>
  );
}
