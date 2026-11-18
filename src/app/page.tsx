"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Flame,
  Hammer,
  Layers,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Store,
  TrendingUp,
  UploadCloud,
  Users,
} from "lucide-react";
import { WowMoney } from "@/components/WowMoney";
import { IntradayChart } from "@/components/IntradayChart";
import { formatCopperText } from "@/lib/stats";

interface ArbitrageRow {
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

interface ProfessionRecipe {
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
  output_num_listings: number;
  est_sold_per_hour: number;
  est_sold_per_day: number;
  sales_velocity_tier: "fast" | "medium" | "slow";
  est_hourly_profit_copper: number;
  opportunity_score: number;
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

interface LeaderboardEntry {
  uploaded_by: string;
  snapshots_count: number;
  items_audited: number;
  points: number;
  last_upload_at: string;
}

interface MarketOverview {
  house_id: number;
  total_items_tracked: number;
  total_snapshots: number;
  total_market_volume: number;
  last_blizzard_sync: string | null;
  last_guild_sync: string | null;
  categories: string[];
  professions?: string[];
  total_recipes?: number;
}

interface ItemDetailData {
  item: {
    item_id: number;
    name_es: string;
    icon_url: string;
    category: string;
    vendor_sell_price: number;
    vendor_buy_price?: number;
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

const DAY_LABELS = [
  "Dom (Raid)",
  "Lun (Valle)",
  "Mar (Reset)",
  "Mié (Raid)",
  "Jue (Raid)",
  "Vie",
  "Sáb",
];

const PROFESSIONS_LIST = [
  "Todas",
  "Ingeniería",
  "Minería",
  "Alquimia",
  "Herrería",
  "Cocina",
  "Sastrería",
  "Peletería",
  "Encantamiento",
  "Primeros auxilios",
  "Pesca",
  "Herboristería",
  "Desuello",
];

const FALLBACK_WOW_ICON =
  "https://render.worldofwarcraft.com/forever-us/icons/56/134400.jpg";

function resolveSafeIconUrl(url?: string): string {
  if (!url || url.includes("inv_misc_questionmark")) {
    return FALLBACK_WOW_ICON;
  }
  return url;
}

function SafeItemIcon({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={resolveSafeIconUrl(src)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        const target = e.currentTarget;
        if (target.src !== FALLBACK_WOW_ICON) {
          target.src = FALLBACK_WOW_ICON;
        }
      }}
      className={className}
    />
  );
}

function PaginationBar({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = "objetos",
  accentColor = "sky",
}: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemLabel?: string;
  accentColor?: "sky" | "amber";
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  const visiblePages: number[] = [];
  const startPage = Math.max(1, safePage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  const adjustedStart = Math.max(1, endPage - 4);
  for (let p = adjustedStart; p <= endPage; p++) {
    visiblePages.push(p);
  }

  const activeBtnClass =
    accentColor === "amber"
      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
      : "bg-sky-500 text-slate-950 border-sky-400 font-bold";

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b1120] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>
          Hoja{" "}
          <span className="text-white font-semibold">{safePage}</span> de{" "}
          <span className="text-white font-semibold">{totalPages}</span>
        </span>
        <span>·</span>
        <span>
          Mostrando{" "}
          <span className="text-white font-semibold">
            {startIdx}–{endIdx}
          </span>{" "}
          de{" "}
          <span className="text-white font-semibold">
            {totalItems.toLocaleString()}
          </span>{" "}
          {itemLabel}
        </span>

        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-slate-500">Ver:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 font-semibold focus:outline-none focus:border-sky-500"
          >
            <option value={10}>10 por hoja</option>
            <option value={20}>20 por hoja</option>
            <option value={50}>50 por hoja</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600 disabled:opacity-40 disabled:pointer-events-none transition"
          title="Primera hoja"
        >
          « Primera
        </button>
        <button
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600 disabled:opacity-40 disabled:pointer-events-none transition"
        >
          ‹ Anterior
        </button>

        {visiblePages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[32px] px-2.5 py-1.5 rounded-lg text-xs border transition ${
              p === safePage
                ? activeBtnClass
                : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
            }`}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600 disabled:opacity-40 disabled:pointer-events-none transition"
        >
          Siguiente ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-600 disabled:opacity-40 disabled:pointer-events-none transition"
          title="Última hoja"
        >
          Última »
        </button>
      </div>
    </div>
  );
}

const SAMPLE_CLAN_LUA = `-- Escaneo rápido de ForeverMarketAudit (Clan Edition - TOC 106001)
ForeverMarketAuditDB = {
  ["meta"] = {
    ["player"] = "Odin",
    ["faction"] = "Alliance",
    ["houseId"] = 110,
    ["region"] = "us",
    ["version"] = "1.0.0",
    ["lastScanTime"] = ${Math.floor(Date.now() / 1000)},
  },
  ["latestItems"] = {
    [2770] = {
      ["name"] = "Mena de cobre",
      ["offers"] = {
        { ["unitPrice"] = 1, ["quantity"] = 1 },
        { ["unitPrice"] = 47, ["quantity"] = 240 },
        { ["unitPrice"] = 53, ["quantity"] = 580 },
      },
    },
    [260784] = {
      ["name"] = "Tiras C-GUR",
      ["offers"] = {
        { ["unitPrice"] = 5, ["quantity"] = 1 },
        { ["unitPrice"] = 195, ["quantity"] = 120 },
        { ["unitPrice"] = 230, ["quantity"] = 310 },
      },
    },
    [260792] = {
      ["name"] = "Dinamita C-GUR",
      ["offers"] = {
        { ["unitPrice"] = 460, ["quantity"] = 95 },
        { ["unitPrice"] = 520, ["quantity"] = 210 },
      },
    },
    [260803] = {
      ["name"] = "Granada para tontos",
      ["offers"] = {
        { ["unitPrice"] = 1890, ["quantity"] = 70 },
        { ["unitPrice"] = 2150, ["quantity"] = 140 },
      },
    },
    [279950] = {
      ["name"] = "Robot de componentes",
      ["offers"] = {
        { ["unitPrice"] = 23900, ["quantity"] = 22 },
        { ["unitPrice"] = 26400, ["quantity"] = 55 },
      },
    },
    [4371] = {
      ["name"] = "Tubo de bronce",
      ["offers"] = {
        { ["unitPrice"] = 1320, ["quantity"] = 45 },
        { ["unitPrice"] = 1480, ["quantity"] = 110 },
      },
    },
  },
}`;

export default function ForeverMarketDashboard() {
  const [activeTab, setActiveTab] = useState<
    "radar" | "detail" | "professions" | "clan"
  >("radar");

  const [houseId, setHouseId] = useState<number>(110);
  const [minLiquidity, setMinLiquidity] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [radar, setRadar] = useState<ArbitrageRow[]>([]);
  const [professions, setProfessions] = useState<ProfessionRecipe[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(true);
  const [syncingBlizzard, setSyncingBlizzard] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Vista 2: Detalle de Ítem (Curva 24h y Heatmap 7x24)
  const [selectedItemId, setSelectedItemId] = useState<number>(2770);
  const [itemDetail, setItemDetail] = useState<ItemDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Paginación por hojas de 10 en 10 (Radar y Laboratorio)
  const [radarPage, setRadarPage] = useState<number>(1);
  const [radarPageSize, setRadarPageSize] = useState<number>(10);
  const [labPage, setLabPage] = useState<number>(1);
  const [labPageSize, setLabPageSize] = useState<number>(10);

  // Vista 3: Filtros y Ordenamiento del Laboratorio de Profesiones (12 Profesiones y Subprofesiones)
  const [profFilter, setProfFilter] = useState<string>("Todas");
  const [recipeSearchQuery, setRecipeSearchQuery] = useState<string>("");
  const [onlyForeverRecipes, setOnlyForeverRecipes] = useState<boolean>(false);
  const [onlyProfitableRecipes, setOnlyProfitableRecipes] =
    useState<boolean>(false);
  const [onlyActiveAhRecipes, setOnlyActiveAhRecipes] = useState<boolean>(true);
  const [labSortBy, setLabSortBy] = useState<
    "opportunity" | "sales_flow" | "roi" | "hourly_profit" | "net_profit"
  >("opportunity");
  const [labVelocityFilter, setLabVelocityFilter] = useState<
    "all" | "fast" | "medium_or_fast"
  >("all");

  // Vista 4: Zona del Clan (Uploader Drag & Drop)
  const [clanPlayerName, setClanPlayerName] = useState<string>("Odin");
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadingLua, setUploadingLua] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoadingDashboard(true);
    try {
      const params = new URLSearchParams({
        houseId: String(houseId),
        minLiquidity: String(minLiquidity),
        category: selectedCategory,
        search: searchQuery,
      });
      const res = await fetch(`/api/market/dashboard?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setOverview(data.overview);
        setRadar(data.radar || []);
        setProfessions(data.professions || []);
        setLeaderboard(data.leaderboard || []);
      }
    } catch (err) {
      console.error("Error cargando dashboard:", err);
    } finally {
      setLoadingDashboard(false);
    }
  }, [houseId, minLiquidity, selectedCategory, searchQuery]);

  const fetchItemDetail = useCallback(
    async (itemId: number) => {
      setLoadingDetail(true);
      try {
        const res = await fetch(
          `/api/market/item/${itemId}?houseId=${houseId}`
        );
        if (res.ok) {
          const data = (await res.json()) as ItemDetailData;
          setItemDetail(data);
        }
      } catch (err) {
        console.error("Error cargando detalle de ítem:", err);
      } finally {
        setLoadingDetail(false);
      }
    },
    [houseId]
  );

  useEffect(() => {
    setRadarPage(1);
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    setLabPage(1);
  }, [
    profFilter,
    recipeSearchQuery,
    onlyForeverRecipes,
    onlyProfitableRecipes,
    onlyActiveAhRecipes,
    labSortBy,
    labVelocityFilter,
  ]);

  useEffect(() => {
    fetchItemDetail(selectedItemId);
  }, [selectedItemId, fetchItemDetail]);

  const handleOpenItemDetail = (itemId: number) => {
    setSelectedItemId(itemId);
    setActiveTab("detail");
  };

  const handleSyncBlizzardNow = async () => {
    setSyncingBlizzard(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/ingest/blizzard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ houseId, rulesetId: 1, force: false }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.notModified) {
          setSyncMessage(
            `Sin cambios desde el último corte horario de Blizzard (${data.lastModifiedHeader}). Límite de API respetado (HTTP 304).`
          );
        } else {
          setSyncMessage(
            `¡Sincronizado! ${Number(
              data.rawEquipmentAuctions + data.rawCommodityAuctions
            ).toLocaleString()} subastas procesadas (${data.aggregatedItemsCount} ítems únicos).`
          );
        }
        await fetchDashboardData();
        await fetchItemDetail(selectedItemId);
      } else {
        setSyncMessage(`Error: ${data.error || "Fallo al sincronizar"}`);
      }
    } catch {
      setSyncMessage("Error de red al conectar con el poller.");
    } finally {
      setSyncingBlizzard(false);
    }
  };

  const handleUploadSavedVariablesContent = async (luaText: string) => {
    setUploadingLua(true);
    setUploadStatus(null);
    try {
      const res = await fetch("/api/ingest/addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: luaText,
          player: clanPlayerName || "Odin",
          houseId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus({
          ok: true,
          message: `¡Auditoría recibida! Jugador '${data.uploadedBy}' aportó ${data.itemsProcessed} ítems al corte ${new Date(
            data.snapshotTimeISO
          ).toLocaleTimeString()} UTC (+${data.itemsProcessed * 5 + 50} pts en el Leaderboard).`,
        });
        if (data.leaderboard) {
          setLeaderboard(data.leaderboard);
        }
        await fetchDashboardData();
        await fetchItemDetail(selectedItemId);
      } else {
        setUploadStatus({
          ok: false,
          message: data.error || "Error al procesar el archivo Lua.",
        });
      }
    } catch {
      setUploadStatus({
        ok: false,
        message: "Error de conexión al enviar ForeverMarketAudit.lua.",
      });
    } finally {
      setUploadingLua(false);
    }
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    await handleUploadSavedVariablesContent(text);
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await handleUploadSavedVariablesContent(text);
  };

  const professionCounts = useMemo(() => {
    const counts: Record<string, number> = { Todas: professions.length };
    for (const p of professions) {
      counts[p.profession] = (counts[p.profession] || 0) + 1;
    }
    return counts;
  }, [professions]);

  const filteredProfessions = useMemo(() => {
    const q = recipeSearchQuery.trim().toLowerCase();
    const list = professions.filter((p) => {
      if (profFilter !== "Todas" && p.profession !== profFilter) return false;
      if (onlyForeverRecipes && !p.is_forever_exclusive) return false;
      if (onlyProfitableRecipes && !p.is_profitable) return false;
      if (onlyActiveAhRecipes && !p.has_all_prices && !q) return false;
      if (labVelocityFilter === "fast" && p.sales_velocity_tier !== "fast") {
        return false;
      }
      if (
        labVelocityFilter === "medium_or_fast" &&
        p.sales_velocity_tier === "slow"
      ) {
        return false;
      }
      if (q) {
        const matchRecipe =
          p.name_es.toLowerCase().includes(q) ||
          p.output_name_es.toLowerCase().includes(q) ||
          String(p.output_item_id).includes(q) ||
          p.reagents.some((rg) => rg.name_es.toLowerCase().includes(q));
        if (!matchRecipe) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (a.has_all_prices !== b.has_all_prices) {
        return a.has_all_prices ? -1 : 1;
      }
      if (labSortBy === "opportunity") {
        if ((b.opportunity_score || 0) !== (a.opportunity_score || 0)) {
          return (b.opportunity_score || 0) - (a.opportunity_score || 0);
        }
        return b.net_profit_copper - a.net_profit_copper;
      }
      if (labSortBy === "sales_flow") {
        if ((b.est_sold_per_day || 0) !== (a.est_sold_per_day || 0)) {
          return (b.est_sold_per_day || 0) - (a.est_sold_per_day || 0);
        }
        return b.net_roi_pct - a.net_roi_pct;
      }
      if (labSortBy === "roi") {
        if (b.net_roi_pct !== a.net_roi_pct) {
          return b.net_roi_pct - a.net_roi_pct;
        }
        return (b.est_sold_per_day || 0) - (a.est_sold_per_day || 0);
      }
      if (labSortBy === "hourly_profit") {
        if (
          (b.est_hourly_profit_copper || 0) !==
          (a.est_hourly_profit_copper || 0)
        ) {
          return (
            (b.est_hourly_profit_copper || 0) -
            (a.est_hourly_profit_copper || 0)
          );
        }
        return b.net_profit_copper - a.net_profit_copper;
      }
      // net_profit
      return b.net_profit_copper - a.net_profit_copper;
    });

    return list;
  }, [
    professions,
    profFilter,
    onlyForeverRecipes,
    onlyProfitableRecipes,
    onlyActiveAhRecipes,
    recipeSearchQuery,
    labSortBy,
    labVelocityFilter,
  ]);

  const paginatedRadar = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(radar.length / radarPageSize));
    const safePage = Math.min(Math.max(1, radarPage), totalPages);
    const start = (safePage - 1) * radarPageSize;
    return radar.slice(start, start + radarPageSize);
  }, [radar, radarPage, radarPageSize]);

  const paginatedProfessions = useMemo(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredProfessions.length / labPageSize)
    );
    const safePage = Math.min(Math.max(1, labPage), totalPages);
    const start = (safePage - 1) * labPageSize;
    return filteredProfessions.slice(start, start + labPageSize);
  }, [filteredProfessions, labPage, labPageSize]);

  // Calcular rango para colorear el Heatmap 7x24 en la Vista 2
  const heatmapValues =
    itemDetail?.heatmap7x24.map((h) => h.avg_p10).filter((v) => v > 0) || [];
  const minHeatP10 =
    heatmapValues.length > 0 ? Math.min(...heatmapValues) : 1;
  const maxHeatP10 =
    heatmapValues.length > 0 ? Math.max(...heatmapValues) : 100;

  const getHeatmapCellColor = (val: number) => {
    if (!val || maxHeatP10 <= minHeatP10) {
      return "bg-slate-800/70 text-slate-300 border-slate-700/50";
    }
    const ratio = (val - minHeatP10) / (maxHeatP10 - minHeatP10);
    if (ratio <= 0.22) {
      return "bg-emerald-500/30 text-emerald-200 border-emerald-500/50 font-semibold";
    }
    if (ratio <= 0.42) {
      return "bg-teal-500/20 text-teal-200 border-teal-500/30";
    }
    if (ratio <= 0.68) {
      return "bg-slate-800/80 text-slate-300 border-slate-700/60";
    }
    if (ratio <= 0.85) {
      return "bg-amber-500/25 text-amber-200 border-amber-500/40";
    }
    return "bg-rose-500/35 text-rose-100 border-rose-500/60 font-semibold";
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#060a12] text-slate-100">
      {/* BARRA SUPERIOR / HEADER */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#080d1a]/95 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-sky-500/20 border border-sky-400/30">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  Forever Market Audit
                </h1>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  v1.60.1_70399 · TOC 106001
                </span>
                <span className="hidden md:inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  dynamic-forever-us + static-forever-us
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Auditoría de Armas, Armaduras, Materiales y las 12 Profesiones
                Oficiales · Algoritmo P10 Anti-Manipulación
              </p>
            </div>
          </div>

          {/* Controles Globales: Selector de House ID y Sincronización Blizzard */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5">
              <Layers className="w-4 h-4 text-sky-400" />
              <span className="text-xs text-slate-400">Mercado (House):</span>
              <select
                value={houseId}
                onChange={(e) => setHouseId(Number(e.target.value))}
                className="bg-transparent text-xs sm:text-sm font-semibold text-white focus:outline-none cursor-pointer"
              >
                <option value={110} className="bg-slate-900 text-white">
                  #110 — Alianza Principal (US Rulesets 1/2/3/15)
                </option>
                <option value={113} className="bg-slate-900 text-white">
                  #113 — Casa de Subastas #113 (US Mega-House)
                </option>
              </select>
            </div>

            <button
              onClick={handleSyncBlizzardNow}
              disabled={syncingBlizzard}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition shadow-sm shadow-sky-500/20"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${syncingBlizzard ? "animate-spin" : ""}`}
              />
              {syncingBlizzard
                ? "Consultando Blizzard..."
                : "Sincronizar API Blizzard"}
            </button>

            <a
              href={`/api/addon/export?houseId=${houseId}`}
              download="ForeverMarketData.lua"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition"
            >
              <Download className="w-3.5 h-3.5" />
              ForeverMarketData.lua
            </a>
          </div>
        </div>

        {/* Notificación de sincronización */}
        {syncMessage && (
          <div className="bg-sky-950/80 border-t border-sky-800/50 px-6 py-2 text-xs text-sky-200 flex items-center justify-between max-w-[1600px] mx-auto">
            <span>{syncMessage}</span>
            <button
              onClick={() => setSyncMessage(null)}
              className="text-sky-400 hover:text-white ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* NAVEGACIÓN DE LAS 4 VISTAS PRINCIPALES */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto border-t border-slate-800/60 pt-1">
          <button
            onClick={() => setActiveTab("radar")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === "radar"
                ? "border-sky-400 text-sky-300 bg-sky-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            1. Radar de Arbitraje (Equipo, Armas y Materiales)
          </button>

          <button
            onClick={() => setActiveTab("detail")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === "detail"
                ? "border-emerald-400 text-emerald-300 bg-emerald-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            2. Curva Horaria 24h & Heatmap Semanal
          </button>

          <button
            onClick={() => setActiveTab("professions")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === "professions"
                ? "border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Hammer className="w-4 h-4" />
            3. Laboratorio de 12 Profesiones (
            {overview?.total_recipes?.toLocaleString() || "2,310"} Recetas)
          </button>

          <button
            onClick={() => setActiveTab("clan")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === "clan"
                ? "border-purple-400 text-purple-300 bg-purple-500/10 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            4. Zona del Clan & Addon In-Game
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* TARJETAS KPI DE ESTADO DEL MERCADO */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Ítems Activos en Subasta (House #{houseId})</span>
              <Sparkles className="w-4 h-4 text-sky-400" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-white">
              {overview
                ? overview.total_items_tracked.toLocaleString()
                : "..."}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Armas, Armaduras, Bolsas, Recetas, Consumibles y Materias Primas
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Volumen Total Activo (Unidades)</span>
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-emerald-300">
              {overview
                ? overview.total_market_volume.toLocaleString()
                : "..."}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Suma de <code className="text-emerald-300">/auctions/{houseId}</code>{" "}
              + <code className="text-emerald-300">/commodities</code>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Recetas Oficiales Forever Auditadas</span>
              <Hammer className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-1.5 text-2xl font-bold text-amber-300">
              {overview?.total_recipes
                ? overview.total_recipes.toLocaleString()
                : professions.length.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              12 Profesiones y Subprofesiones desde{" "}
              <code className="text-amber-300">static-forever-us</code>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Filtro Anti-Manipulación Activo</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-1.5 text-lg font-bold text-white flex items-center gap-2">
              Percentil 10 Ponderado (P10)
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Descarta automáticamente subastas trampa de 1c y descuenta 5% AH cut
            </div>
          </div>
        </section>

        {/* =====================================================================
            VISTA 1: RADAR DE ARBITRAJE INTRADÍA (VISTA PRINCIPAL)
        ===================================================================== */}
        {activeTab === "radar" && (
          <section className="space-y-4">
            {/* Barra de Filtros Rápidos por Categoría */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                "Todas",
                "Armas",
                "Armaduras",
                "Bolsas y Contenedores",
                "Alquimia y Pociones",
                "Cocina y Pesca",
                "Ingeniería",
                "Minería",
                "Herboristería",
                "Sastrería y Peletería",
                "Encantamiento",
                "Primeros auxilios",
                "Recetas y Patrones",
                "Cajones Forever",
                "Proyectiles y Munición",
              ].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition ${
                    selectedCategory === cat
                      ? "bg-sky-500 text-slate-950 border-sky-400 shadow-sm"
                      : "bg-[#0b1120] text-slate-300 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Barra de Búsqueda y Filtro de Liquidez */}
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Buscador */}
                <div className="relative min-w-[260px] flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar espada, armadura, bolsa, poción, mena, C-GUR o ID..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Filtro de Liquidez */}
                <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2">
                  <Filter className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-slate-300 font-medium">
                    Liquidez Mínima:
                  </span>
                  <select
                    value={minLiquidity}
                    onChange={(e) => setMinLiquidity(Number(e.target.value))}
                    className="bg-slate-800 text-xs font-semibold text-emerald-300 rounded px-2 py-0.5 focus:outline-none border border-emerald-500/30"
                  >
                    <option value={1}>
                      ≥ 1 ud (Incluir Armas, Armaduras, Bolsas y Materiales)
                    </option>
                    <option value={5}>
                      ≥ 5 uds (Equipamiento Frecuente y Consumibles)
                    </option>
                    <option value={50}>
                      ≥ 50 uds (Alta Liquidez: Materias Primas y Consumibles)
                    </option>
                    <option value={250}>
                      ≥ 250 uds (Commodities de Gran Volumen)
                    </option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-400">
                Total:{" "}
                <span className="text-white font-semibold">{radar.length}</span>{" "}
                objetos · Haz clic en cualquiera para ver su{" "}
                <span className="text-emerald-400 font-medium">
                  Curva 24h y Heatmap
                </span>
              </div>
            </div>

            {/* Paginación Superior del Radar (10 en 10) */}
            {!loadingDashboard && radar.length > 0 && (
              <PaginationBar
                currentPage={radarPage}
                totalItems={radar.length}
                pageSize={radarPageSize}
                onPageChange={setRadarPage}
                onPageSizeChange={(size) => {
                  setRadarPageSize(size);
                  setRadarPage(1);
                }}
                itemLabel="objetos"
                accentColor="sky"
              />
            )}

            {/* Tabla del Radar Intradía */}
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3.5 px-4">Objeto (WoW: Forever)</th>
                      <th className="py-3.5 px-3">Hora Ideal Compra (Valle)</th>
                      <th className="py-3.5 px-3">Precio P10 Valle</th>
                      <th className="py-3.5 px-3">Hora Ideal Venta (Pico)</th>
                      <th className="py-3.5 px-3">Precio P10 Pico</th>
                      <th className="py-3.5 px-3 text-right">
                        Volumen / Lotes
                      </th>
                      <th className="py-3.5 px-3 text-right">
                        Ganancia Neta / Ud
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        ROI Neto (tras 5% AH cut)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                    {loadingDashboard ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-12 text-center text-slate-400"
                        >
                          Calculando oportunidades de arbitraje intradía...
                        </td>
                      </tr>
                    ) : paginatedRadar.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-12 text-center text-slate-400"
                        >
                          No se encontraron objetos con los filtros actuales.
                        </td>
                      </tr>
                    ) : (
                      paginatedRadar.map((item) => (
                        <tr
                          key={item.item_id}
                          onClick={() => handleOpenItemDetail(item.item_id)}
                          className="hover:bg-slate-800/50 transition cursor-pointer group"
                        >
                          {/* Objeto */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <SafeItemIcon
                                src={item.icon_url}
                                alt={item.name_es}
                                className="w-9 h-9 rounded-lg border border-slate-700 group-hover:border-sky-400 transition object-cover bg-slate-950 shrink-0"
                              />
                              <div>
                                <div className="font-semibold text-white group-hover:text-sky-300 transition flex items-center gap-2 flex-wrap">
                                  <span>{item.name_es}</span>
                                  {item.item_id > 200000 && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                      FOREVER
                                    </span>
                                  )}
                                  {item.has_bait_warning && (
                                    <span
                                      title={`Bait detectado: mínimo en ${formatCopperText(
                                        item.current_min_price
                                      )} (-${
                                        item.bait_discount_pct
                                      }% bajo el P10 real)`}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      Bait Filtrado
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                  <span>ID #{item.item_id}</span>
                                  <span>·</span>
                                  <span className="text-sky-300/90 font-medium">
                                    {item.category}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    P10 Actual:{" "}
                                    <WowMoney
                                      copper={item.current_p10_price}
                                      compact
                                    />
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Hora Ideal Compra (Valle) */}
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-xs font-semibold">
                              <ArrowDownRight className="w-3.5 h-3.5" />
                              {String(item.valley_hour).padStart(2, "0")}:00 UTC
                            </span>
                          </td>

                          {/* Precio P10 Valle */}
                          <td className="py-3 px-3">
                            <WowMoney copper={item.valley_p10} />
                          </td>

                          {/* Hora Ideal Venta (Pico) */}
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-xs font-semibold">
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              {String(item.peak_hour).padStart(2, "0")}:00 UTC
                            </span>
                          </td>

                          {/* Precio P10 Pico */}
                          <td className="py-3 px-3">
                            <WowMoney copper={item.peak_p10} />
                          </td>

                          {/* Volumen Diario */}
                          <td className="py-3 px-3 text-right font-mono">
                            <div className="text-slate-100 font-semibold">
                              {item.total_quantity.toLocaleString()} uds
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.num_listings} lotes
                            </div>
                          </td>

                          {/* Ganancia Neta / Ud */}
                          <td className="py-3 px-3 text-right">
                            <WowMoney
                              copper={item.net_profit_copper}
                              showSign
                            />
                          </td>

                          {/* ROI Neto (tras 5% AH cut) */}
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-xs font-bold ${
                                item.net_roi_pct >= 25
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : item.net_roi_pct > 0
                                  ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                                  : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              }`}
                            >
                              {item.net_roi_pct > 0 ? "+" : ""}
                              {item.net_roi_pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Paginación Inferior del Radar (10 en 10) */}
            {!loadingDashboard && radar.length > 0 && (
              <PaginationBar
                currentPage={radarPage}
                totalItems={radar.length}
                pageSize={radarPageSize}
                onPageChange={setRadarPage}
                onPageSizeChange={(size) => {
                  setRadarPageSize(size);
                  setRadarPage(1);
                }}
                itemLabel="objetos"
                accentColor="sky"
              />
            )}
          </section>
        )}

        {/* =====================================================================
            VISTA 2: CURVA HORARIA 24H Y HEATMAP SEMANAL (DETALLE DE ÍTEM)
        ===================================================================== */}
        {activeTab === "detail" && (
          <section className="space-y-5">
            {/* Barra de selección rápida de ítem */}
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {itemDetail?.item && (
                  <SafeItemIcon
                    src={itemDetail.item.icon_url}
                    alt={itemDetail.item.name_es}
                    className="w-12 h-12 rounded-xl border border-sky-500/40 object-cover bg-slate-950 shrink-0"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">
                      {itemDetail?.item.name_es || "Cargando objeto..."}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      ID #{selectedItemId}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      {itemDetail?.item.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Análisis de profundidad horaria (P10 ponderado por volumen) y
                    ciclo semanal de bandas en House #{houseId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Cambiar objeto:</span>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white font-medium focus:outline-none focus:border-sky-500 max-w-xs"
                >
                  {radar.map((r) => (
                    <option
                      key={r.item_id}
                      value={r.item_id}
                      className="bg-slate-900 text-white"
                    >
                      {r.name_es} (#{r.item_id}) — ROI +{r.net_roi_pct.toFixed(1)}%
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingDetail || !itemDetail ? (
              <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-12 text-center text-slate-400">
                Cargando curva horaria 24h y mapa de calor 7x24...
              </div>
            ) : (
              <>
                {/* Tarjetas de Resumen del Ítem */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-3.5">
                    <div className="text-[11px] text-slate-400">
                      Suelo Real Actual (P10)
                    </div>
                    <div className="mt-1 text-base font-bold">
                      <WowMoney copper={itemDetail.item.current_p10} />
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Mínimo crudo:{" "}
                      {formatCopperText(itemDetail.item.current_min)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3.5">
                    <div className="text-[11px] text-emerald-300 font-medium">
                      Hora Valle Compra (
                      {String(itemDetail.item.valley_hour).padStart(2, "0")}:00
                      UTC)
                    </div>
                    <div className="mt-1 text-base font-bold">
                      <WowMoney copper={itemDetail.item.valley_p10} />
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-400/80">
                      Acumular stock en madrugada
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-3.5">
                    <div className="text-[11px] text-amber-300 font-medium">
                      Hora Pico Venta (
                      {String(itemDetail.item.peak_hour).padStart(2, "0")}:00
                      UTC)
                    </div>
                    <div className="mt-1 text-base font-bold">
                      <WowMoney copper={itemDetail.item.peak_p10} />
                    </div>
                    <div className="mt-1 text-[11px] text-amber-400/80">
                      Demanda máxima pre-raid
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-3.5">
                    <div className="text-[11px] text-slate-400">
                      Ganancia Neta / Ud (tras 5% AH)
                    </div>
                    <div className="mt-1 text-base font-bold">
                      <WowMoney
                        copper={itemDetail.item.net_profit_copper}
                        showSign
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-400 font-semibold">
                      ROI Neto: +{itemDetail.item.net_roi_pct.toFixed(1)}%
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-3.5">
                    <div className="text-[11px] text-slate-400">
                      Liquidez Actual Disponible
                    </div>
                    <div className="mt-1 text-lg font-bold text-white font-mono">
                      {itemDetail.item.current_quantity.toLocaleString()} uds
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      en {itemDetail.item.num_listings} lotes activos
                    </div>
                  </div>
                </div>

                {/* Gráfico TradingView Lightweight Charts */}
                <IntradayChart
                  data={itemDetail.timeseries}
                  itemName={itemDetail.item.name_es}
                />

                {/* Perfil Horario 24h + Heatmap Semanal 7 Días x 24 Horas */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                  {/* Perfil Horario 24h */}
                  <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                    <h3 className="text-sm font-bold text-white mb-1">
                      Curva Horaria Promedio 24h (UTC)
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      Comparativa de precio suelo{" "}
                      <code className="text-emerald-300">p10_price</code> por
                      hora del día (00h a 23h)
                    </p>
                    <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                      {itemDetail.hourlyCurve24h.map((h) => {
                        const pctWidth =
                          maxHeatP10 > 0
                            ? Math.max(
                                15,
                                Math.round((h.avg_p10 / maxHeatP10) * 100)
                              )
                            : 50;
                        const isValley =
                          h.hour_of_day === itemDetail.item.valley_hour;
                        const isPeak =
                          h.hour_of_day === itemDetail.item.peak_hour;

                        return (
                          <div
                            key={h.hour_of_day}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="w-12 font-mono text-slate-400">
                              {String(h.hour_of_day).padStart(2, "0")}:00
                            </span>
                            <div className="flex-1 h-5 bg-slate-900 rounded overflow-hidden relative flex items-center">
                              <div
                                style={{ width: `${pctWidth}%` }}
                                className={`h-full transition-all ${
                                  isValley
                                    ? "bg-emerald-500/60"
                                    : isPeak
                                    ? "bg-amber-500/65"
                                    : "bg-sky-500/30"
                                }`}
                              />
                              <span className="absolute left-2 text-[11px] font-mono text-white">
                                {formatCopperText(h.avg_p10)}
                              </span>
                            </div>
                            <span className="w-16 text-right font-mono text-[11px] text-slate-400">
                              {h.avg_quantity.toLocaleString()}u
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mapa de Calor 7 Días x 24 Horas */}
                  <div className="xl:col-span-2 rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Mapa de Calor Semanal (7 Días × 24 Horas UTC)
                        </h3>
                        <p className="text-xs text-slate-400">
                          Verde = Horas Valle (Acumular Stock barato) ·
                          Ámbar/Rojo = Horas Pico de Raid (Vender con máximo
                          margen)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/50">
                          Compra Valle
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          Neutral
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-500/40">
                          Demanda Alta
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-500/35 text-rose-100 border border-rose-500/60">
                          Pico Raid
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-separate border-spacing-1 text-center">
                        <thead>
                          <tr>
                            <th className="text-left text-[11px] text-slate-400 font-medium px-2 py-1">
                              Día \ Hora
                            </th>
                            {Array.from({ length: 24 }, (_, hr) => (
                              <th
                                key={hr}
                                className="text-[10px] font-mono text-slate-400 px-1 py-1"
                              >
                                {String(hr).padStart(2, "0")}h
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {DAY_LABELS.map((dayLabel, dow) => (
                            <tr key={dow}>
                              <td className="text-left text-xs font-medium text-slate-300 px-2 py-1.5 whitespace-nowrap">
                                {dayLabel}
                              </td>
                              {Array.from({ length: 24 }, (_, hr) => {
                                const cell = itemDetail.heatmap7x24.find(
                                  (c) =>
                                    c.day_of_week === dow &&
                                    c.hour_of_day === hr
                                );
                                const val = cell?.avg_p10 || 0;
                                return (
                                  <td
                                    key={hr}
                                    title={`${dayLabel} ${String(hr).padStart(
                                      2,
                                      "0"
                                    )}:00 UTC — P10: ${formatCopperText(
                                      val
                                    )} (Vol: ${
                                      cell?.avg_quantity?.toLocaleString() || 0
                                    } uds)`}
                                    className={`text-[10px] font-mono rounded border px-1 py-2 transition hover:scale-105 cursor-default ${getHeatmapCellColor(
                                      val
                                    )}`}
                                  >
                                    {val > 0 ? formatCopperText(val) : "-"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* =====================================================================
            VISTA 3: LABORATORIO DE LAS 12 PROFESIONES Y SUBPROFESIONES EN FOREVER
        ===================================================================== */}
        {activeTab === "professions" && (
          <section className="space-y-4">
            {/* Selector de las 12 Profesiones y Subprofesiones */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {PROFESSIONS_LIST.map((prof) => (
                <button
                  key={prof}
                  onClick={() => setProfFilter(prof)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition flex items-center gap-1.5 ${
                    profFilter === prof
                      ? "bg-amber-500 text-slate-950 border-amber-400 shadow-sm"
                      : "bg-[#0b1120] text-slate-300 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  <span>{prof}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      profFilter === prof
                        ? "bg-slate-950/20 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {professionCounts[prof] || 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Barra de Filtros, Ordenamiento por Flujo/ROI y Buscador de Recetas */}
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Buscador */}
                <div className="relative min-w-[260px] flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={recipeSearchQuery}
                    onChange={(e) => setRecipeSearchQuery(e.target.value)}
                    placeholder="Buscar receta o material (ej. tornillos de cobre, C-GUR, poción, bolsa, espada)..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Selector de Ordenamiento: Mejor Oportunidad (ROI + Flujo), Mayor Flujo, Mayor ROI, etc. */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 bg-slate-900 border border-amber-500/35 rounded-lg px-3 py-2">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                      Ordenar por:
                    </span>
                    <select
                      value={labSortBy}
                      onChange={(e) =>
                        setLabSortBy(
                          e.target.value as
                            | "opportunity"
                            | "sales_flow"
                            | "roi"
                            | "hourly_profit"
                            | "net_profit"
                        )
                      }
                      className="bg-slate-800 text-xs font-semibold text-amber-300 rounded px-2 py-1 focus:outline-none border border-amber-500/30"
                    >
                      <option value="opportunity">
                        🔥 Mejor Oportunidad (Alto ROI + Alto Flujo de Venta)
                      </option>
                      <option value="sales_flow">
                        ⚡ Mayor Flujo de Ventas (Más uds/hora y uds/día)
                      </option>
                      <option value="roi">
                        📈 Mayor ROI % (Mayor porcentaje de retorno)
                      </option>
                      <option value="hourly_profit">
                        ⏱️ Mayor Ganancia / Hora (Flujo × Ganancia Neta)
                      </option>
                      <option value="net_profit">
                        💰 Mayor Ganancia Neta por Crafteo Individual
                      </option>
                    </select>
                  </div>

                  {/* Filtro de Velocidad de Venta */}
                  <div className="flex items-center gap-2 bg-slate-900 border border-emerald-500/30 rounded-lg px-3 py-2">
                    <Flame className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                      Flujo de Venta:
                    </span>
                    <select
                      value={labVelocityFilter}
                      onChange={(e) =>
                        setLabVelocityFilter(
                          e.target.value as "all" | "fast" | "medium_or_fast"
                        )
                      }
                      className="bg-slate-800 text-xs font-semibold text-emerald-300 rounded px-2 py-1 focus:outline-none border border-emerald-500/30"
                    >
                      <option value="all">Todos los flujos</option>
                      <option value="fast">
                        ⚡ Solo Venta Rápida (≥ 20 uds/día)
                      </option>
                      <option value="medium_or_fast">
                        ⏱️ Flujo Medio o Rápido (≥ 4 uds/día)
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/70">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex items-center gap-2 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyForeverRecipes}
                      onChange={(e) => setOnlyForeverRecipes(e.target.checked)}
                      className="rounded accent-purple-500"
                    />
                    <span>Solo Recetas Nuevas de Forever</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyProfitableRecipes}
                      onChange={(e) =>
                        setOnlyProfitableRecipes(e.target.checked)
                      }
                      className="rounded accent-emerald-500"
                    />
                    <span>Solo Ganancia Positiva Hoy</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyActiveAhRecipes}
                      onChange={(e) => setOnlyActiveAhRecipes(e.target.checked)}
                      className="rounded accent-sky-500"
                    />
                    <span>Solo con Stock en Subasta</span>
                  </label>
                </div>

                <div className="text-xs text-slate-400">
                  Total filtrado:{" "}
                  <span className="text-white font-semibold">
                    {filteredProfessions.length.toLocaleString()}
                  </span>{" "}
                  recetas oficiales (<code className="text-amber-300">static-forever-us</code>)
                </div>
              </div>
            </div>

            {/* Paginación Superior del Laboratorio (10 en 10) */}
            {filteredProfessions.length > 0 && (
              <PaginationBar
                currentPage={labPage}
                totalItems={filteredProfessions.length}
                pageSize={labPageSize}
                onPageChange={setLabPage}
                onPageSizeChange={(size) => {
                  setLabPageSize(size);
                  setLabPage(1);
                }}
                itemLabel="recetas"
                accentColor="amber"
              />
            )}

            {/* Grid de Recetas (Paginado 10 por hoja) */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedProfessions.map((rec) => {
                const velocityTier = rec.sales_velocity_tier || "slow";
                const estHour = rec.est_sold_per_hour ?? 0;
                const estDay = rec.est_sold_per_day ?? 0;
                const listingsCount = rec.output_num_listings ?? 0;

                return (
                  <div
                    key={rec.recipe_id}
                    className={`rounded-xl border p-4 flex flex-col justify-between transition ${
                      rec.is_profitable
                        ? "border-emerald-500/30 bg-gradient-to-b from-[#0b1324] to-[#09101d]"
                        : "border-slate-800 bg-[#0b1120]"
                    }`}
                  >
                    <div>
                      {/* Cabecera de la Receta */}
                      <div className="flex items-start justify-between gap-3">
                        <div
                          onClick={() =>
                            handleOpenItemDetail(rec.output_item_id)
                          }
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <SafeItemIcon
                            src={rec.output_icon_url}
                            alt={rec.output_name_es}
                            className="w-11 h-11 rounded-lg border border-slate-700 group-hover:border-amber-400 transition object-cover bg-slate-950 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-bold text-sm text-white group-hover:text-amber-300 transition">
                                {rec.name_es}
                              </h3>
                              {rec.is_forever_exclusive && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                  FOREVER
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              <span className="text-amber-300/90 font-medium">
                                {rec.profession}
                              </span>{" "}
                              · Produce{" "}
                              <span className="text-white font-semibold">
                                {rec.output_quantity}x
                              </span>{" "}
                              ({rec.output_market_volume.toLocaleString()} uds en{" "}
                              {listingsCount} lotes AH)
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold whitespace-nowrap ${
                            !rec.has_all_prices
                              ? "bg-slate-800 text-slate-400 border border-slate-700"
                              : rec.is_profitable
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                          }`}
                        >
                          {!rec.has_all_prices
                            ? "Sin Stock AH"
                            : `${
                                rec.net_roi_pct > 0 ? "+" : ""
                              }${rec.net_roi_pct.toFixed(1)}% ROI`}
                        </span>
                      </div>

                      {/* Bloque de Flujo de Venta Estimado (Uds/Hora y Uds/Día) */}
                      <div className="mt-3 rounded-lg border border-slate-800/90 bg-slate-950/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[11px] border ${
                              velocityTier === "fast"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : velocityTier === "medium"
                                ? "bg-sky-500/20 text-sky-300 border-sky-500/35"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {velocityTier === "fast"
                              ? "⚡ Venta Rápida"
                              : velocityTier === "medium"
                              ? "⏱️ Flujo Medio"
                              : "🐢 Venta Lenta"}
                          </span>
                          <span className="text-slate-300 font-mono">
                            ~<strong className="text-white">{estHour}</strong>{" "}
                            uds/h
                          </span>
                        </div>

                        <div className="text-slate-400 font-mono text-[11px]">
                          Flujo 24h:{" "}
                          <span className="text-amber-300 font-semibold">
                            ~{estDay.toLocaleString()} uds/día
                          </span>
                        </div>
                      </div>

                      {/* Lista de Materiales (Reagents) */}
                      <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
                        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                          Materiales Requeridos (Suelo P10 / NPC Vendedor):
                        </div>
                        {rec.reagents.map((rg) => (
                          <div
                            key={rg.item_id}
                            onClick={() => handleOpenItemDetail(rg.item_id)}
                            className="flex items-center justify-between text-xs bg-slate-900/70 hover:bg-slate-800/80 px-2.5 py-1.5 rounded-lg cursor-pointer transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <SafeItemIcon
                                src={rg.icon_url}
                                alt={rg.name_es}
                                className="w-5 h-5 rounded shrink-0 object-cover bg-slate-950"
                              />
                              <span className="text-slate-200 font-medium truncate">
                                {rg.count}x {rg.name_es}
                              </span>
                              {rg.price_source === "vendor_npc" && (
                                <span
                                  title="Se compra directamente a vendedor NPC"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0"
                                >
                                  <Store className="w-2.5 h-2.5" />
                                  NPC
                                </span>
                              )}
                            </div>
                            {rg.subtotal_p10 > 0 ? (
                              <WowMoney copper={rg.subtotal_p10} />
                            ) : (
                              <span className="text-slate-500 text-[11px]">
                                Sin stock
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resumen Financiero de la Receta */}
                    <div className="mt-4 pt-3 border-t border-slate-800/90 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Costo Total Materiales:</span>
                        <WowMoney copper={rec.total_craft_cost} />
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>
                          Venta Neta ({rec.output_quantity}x tras 5% AH):
                        </span>
                        {rec.net_sale_after_ah_cut > 0 ? (
                          <WowMoney copper={rec.net_sale_after_ah_cut} />
                        ) : (
                          <span className="text-slate-500">Sin ofertas AH</span>
                        )}
                      </div>
                      {rec.is_profitable && rec.est_hourly_profit_copper > 0 && (
                        <div className="flex items-center justify-between text-emerald-300/90 text-[11px] bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
                          <span>Flujo Ganancia Est. / Hora:</span>
                          <WowMoney
                            copper={rec.est_hourly_profit_copper}
                            showSign
                            compact
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60 font-semibold">
                        <button
                          onClick={() =>
                            handleOpenItemDetail(rec.output_item_id)
                          }
                          className="text-sky-400 hover:text-sky-300 text-[11px] flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          Ver Curva 24h del Producto
                        </button>
                        <WowMoney
                          copper={rec.net_profit_copper}
                          showSign
                          className="text-sm font-bold"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Paginación Inferior del Laboratorio (10 en 10) */}
            {filteredProfessions.length > 0 && (
              <PaginationBar
                currentPage={labPage}
                totalItems={filteredProfessions.length}
                pageSize={labPageSize}
                onPageChange={setLabPage}
                onPageSizeChange={(size) => {
                  setLabPageSize(size);
                  setLabPage(1);
                }}
                itemLabel="recetas"
                accentColor="amber"
              />
            )}
          </section>
        )}

        {/* =====================================================================
            VISTA 4: ZONA DEL CLAN (DRAG & DROP UPLOADER + LEADERBOARD + ADDON)
        ===================================================================== */}
        {activeTab === "clan" && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Columna Izquierda y Central: Uploader Drag & Drop + Exportación de ForeverMarketData.lua */}
            <div className="lg:col-span-2 space-y-5">
              {/* Tarjeta 1: Subida Colaborativa de ForeverMarketAudit.lua */}
              <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      <UploadCloud className="w-5 h-5 text-sky-400" />
                      Ingesta Colaborativa del Clan (Subida de SavedVariables
                      entre horas)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sube tu archivo{" "}
                      <code className="text-sky-300">
                        _forever_/WTF/Account/&lt;CUENTA&gt;/SavedVariables/ForeverMarketAudit.lua
                      </code>{" "}
                      para capturar fluctuaciones cada 15 minutos cuando el API
                      oficial de Blizzard aún no ha rotado su corte horario.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-400">
                      Jugador del Clan:
                    </span>
                    <input
                      type="text"
                      value={clanPlayerName}
                      onChange={(e) => setClanPlayerName(e.target.value)}
                      placeholder="Nombre de tu PJ (ej. Odin)"
                      className="bg-transparent text-xs sm:text-sm font-semibold text-white focus:outline-none w-36"
                    />
                  </div>

                  <button
                    onClick={() =>
                      handleUploadSavedVariablesContent(SAMPLE_CLAN_LUA)
                    }
                    disabled={uploadingLua}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-purple-600/25 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 transition"
                  >
                    <Flame className="w-3.5 h-3.5 text-purple-300" />
                    Simular Subida Inmediata de ForeverMarketAudit.lua
                  </button>
                </div>

                {/* Zona Drag & Drop */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleFileDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
                    dragActive
                      ? "border-sky-400 bg-sky-500/10"
                      : "border-slate-700 hover:border-slate-500 bg-slate-900/40"
                  }`}
                >
                  <UploadCloud className="w-10 h-10 text-sky-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-white">
                    Arrastra y suelta aquí tu{" "}
                    <span className="text-sky-300">ForeverMarketAudit.lua</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    El motor aplicará automáticamente el algoritmo P10
                    anti-manipulación y redondeará el bloque a 15 minutos UTC
                  </p>
                  <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white cursor-pointer transition">
                    <span>Seleccionar archivo ForeverMarketAudit.lua</span>
                    <input
                      type="file"
                      accept=".lua"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {uploadStatus && (
                  <div
                    className={`rounded-lg p-3.5 text-xs flex items-center gap-2 border ${
                      uploadStatus.ok
                        ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-200"
                        : "bg-rose-950/60 border-rose-500/40 text-rose-200"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{uploadStatus.message}</span>
                  </div>
                )}
              </div>

              {/* Tarjeta 2: Descarga de ForeverMarketData.lua e Instrucciones del Addon */}
              <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Download className="w-5 h-5 text-amber-400" />
                      Generador de Base de Datos para el Addon (
                      <code>ForeverMarketData.lua</code>)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Descarga la tabla Lua actualizada con las medias horarias
                      (Valle, Pico, P10, Mediana y Alertas de Bait) para ver
                      toda la inteligencia directamente en los tooltips dentro
                      de <strong>WoW: Forever</strong>.
                    </p>
                  </div>

                  <a
                    href={`/api/addon/export?houseId=${houseId}`}
                    download="ForeverMarketData.lua"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition"
                  >
                    <Download className="w-4 h-4" />
                    Descargar Base de Datos para el Addon
                  </a>
                </div>

                <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 text-xs space-y-2">
                  <div className="font-semibold text-sky-300">
                    Ubicación del Addon en tu cliente de WoW: Forever (
                    <code>1.60.1_70399</code>):
                  </div>
                  <code className="block text-slate-300 bg-slate-900 px-3 py-2 rounded border border-slate-800 font-mono">
                    World of
                    Warcraft/_forever_/Interface/AddOns/ForeverMarketAudit/
                  </code>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-400">
                    <div className="bg-slate-900/70 p-2.5 rounded border border-slate-800">
                      <strong className="text-white block">
                        1. ForeverMarketAudit.toc
                      </strong>
                      Interface: <code>106001</code> · Define{" "}
                      <code>SavedVariables: ForeverMarketAuditDB</code>
                    </div>
                    <div className="bg-slate-900/70 p-2.5 rounded border border-slate-800">
                      <strong className="text-white block">
                        2. ForeverMarketData.lua
                      </strong>
                      Datos horarios generados por esta web para tus Tooltips
                    </div>
                    <div className="bg-slate-900/70 p-2.5 rounded border border-slate-800">
                      <strong className="text-white block">
                        3. ForeverMarketAudit.lua
                      </strong>
                      Escáner legal <code>C_AuctionHouse</code> y hook de
                      Tooltips
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna Derecha: Leaderboard del Clan */}
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Award className="w-5 h-5 text-amber-400" />
                      Leaderboard del Clan
                    </h3>
                    <p className="text-xs text-slate-400">
                      Ranking de auditores que aportan escaneos intermedios de{" "}
                      <code>C_AuctionHouse</code>
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 mt-4">
                  {leaderboard.map((entry, idx) => (
                    <div
                      key={entry.uploaded_by}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                            idx === 0
                              ? "bg-amber-500 text-slate-950"
                              : idx === 1
                              ? "bg-slate-300 text-slate-950"
                              : idx === 2
                              ? "bg-amber-700 text-white"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">
                            {entry.uploaded_by}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {entry.snapshots_count} cortes ·{" "}
                            {entry.items_audited.toLocaleString()} ítems
                            auditados
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-amber-300">
                          {entry.points.toLocaleString()} pts
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(entry.last_upload_at).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "UTC",
                            }
                          )}{" "}
                          UTC
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">
                  Sincronización por CLI (Linux / Windows):
                </div>
                <code className="block bg-slate-950 p-2 rounded border border-slate-800 text-sky-300 font-mono">
                  npm run sync-addon -- /ruta/a/ForeverMarketAudit.lua
                </code>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
