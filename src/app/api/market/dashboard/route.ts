import { NextRequest, NextResponse } from "next/server";
import {
  getArbitrageRadar,
  getGuildLeaderboard,
  getMarketOverviewStats,
  getProfessionsLab,
} from "@/lib/db";
import { ingestBlizzardHouseSnapshot } from "@/lib/ingester";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const houseId = Number(
      searchParams.get("houseId") || process.env.DEFAULT_HOUSE_ID || 110
    );
    const minLiquidity = Number(searchParams.get("minLiquidity") ?? 50);
    const category = searchParams.get("category") || "Todas";
    const search = searchParams.get("search") || "";

    let overview = getMarketOverviewStats(houseId);

    // En despliegues serverless (ej. Netlify cold start), hidratar automáticamente desde la API de Blizzard
    if (overview.total_snapshots === 0 && process.env.BLIZZARD_CLIENT_ID) {
      await ingestBlizzardHouseSnapshot({
        houseId,
        rulesetId: Number(process.env.DEFAULT_RULESET_ID || 1),
        force: true,
        enrichUnknownItems: false,
        seedHistoryIfFirstRun: true,
      }).catch((e) =>
        console.warn("[Dashboard Auto-Hydrate] Aviso:", e)
      );
      overview = getMarketOverviewStats(houseId);
    }

    const radar = getArbitrageRadar({
      houseId,
      minLiquidity,
      category,
      search,
      limit: 150,
    });
    const professions = getProfessionsLab(houseId);
    const leaderboard = getGuildLeaderboard(houseId);

    return NextResponse.json({
      overview,
      radar,
      professions,
      leaderboard,
    });
  } catch (err) {
    console.error("[GET /api/market/dashboard] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}
