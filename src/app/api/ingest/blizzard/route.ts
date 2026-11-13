import { NextRequest, NextResponse } from "next/server";
import { ingestBlizzardHouseSnapshot } from "@/lib/ingester";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      houseId?: number;
      rulesetId?: number;
      force?: boolean;
    };

    const houseId = Number(body.houseId || process.env.DEFAULT_HOUSE_ID || 110);
    const rulesetId = Number(
      body.rulesetId || process.env.DEFAULT_RULESET_ID || 1
    );
    const force = Boolean(body.force);

    const result = await ingestBlizzardHouseSnapshot({
      houseId,
      rulesetId,
      force,
      enrichUnknownItems: true,
      seedHistoryIfFirstRun: true,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("[POST /api/ingest/blizzard] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al sincronizar con la API de Blizzard.",
      },
      { status: 500 }
    );
  }
}
