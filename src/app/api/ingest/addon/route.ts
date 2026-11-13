import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseForeverMarketAuditLua } from "@/lib/lua-parser";
import { getGuildLeaderboard, upsertMarketSnapshots } from "@/lib/db";
import { generateForeverMarketDataLua } from "@/lib/lua-exporter";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let luaContent = "";
    let overridePlayer: string | undefined;
    let overrideHouseId: number | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const playerField = formData.get("player");
      const houseField = formData.get("houseId");

      if (typeof playerField === "string" && playerField.trim()) {
        overridePlayer = playerField.trim();
      }
      if (typeof houseField === "string" && Number(houseField) > 0) {
        overrideHouseId = Number(houseField);
      }

      if (file && typeof (file as Blob).text === "function") {
        luaContent = await (file as Blob).text();
      } else if (typeof file === "string") {
        luaContent = file;
      }
    } else {
      const body = (await req.json()) as {
        content?: string;
        player?: string;
        houseId?: number;
      };
      luaContent = body.content || "";
      overridePlayer = body.player;
      overrideHouseId = body.houseId;
    }

    if (!luaContent.trim()) {
      return NextResponse.json(
        { error: "El archivo ForeverMarketAudit.lua está vacío o no fue enviado." },
        { status: 400 }
      );
    }

    const parsed = parseForeverMarketAuditLua(luaContent, {
      overridePlayer,
      overrideHouseId,
    });

    if (parsed.snapshots.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se encontraron cotizaciones válidas dentro de ForeverMarketAuditDB. Asegúrate de escanear ítems en la Casa de Subastas y ejecutar /reload.",
        },
        { status: 422 }
      );
    }

    const insertedCount = upsertMarketSnapshots(parsed.snapshots);
    const { syncSnapshotsToSupabase } = await import("@/lib/supabase-sync");
    await syncSnapshotsToSupabase(parsed.snapshots).catch(() => {});

    // Actualizar el archivo ForeverMarketData.lua en disco (si el filesystem es escribible)
    try {
      const addonDir = path.join(process.cwd(), "addon", "ForeverMarketAudit");
      if (fs.existsSync(addonDir)) {
        const luaExport = generateForeverMarketDataLua(parsed.houseId);
        fs.writeFileSync(
          path.join(addonDir, "ForeverMarketData.lua"),
          luaExport,
          "utf-8"
        );
      }
    } catch {
      // Ignorado en entornos serverless de solo lectura (Netlify sirve ForeverMarketData.lua vía /api/addon/export)
    }

    const leaderboard = getGuildLeaderboard(parsed.houseId);

    return NextResponse.json({
      ok: true,
      uploadedBy: parsed.uploadedBy,
      houseId: parsed.houseId,
      snapshotTimeISO: parsed.snapshotTimeISO,
      itemsProcessed: insertedCount,
      sampleItems: parsed.snapshots.slice(0, 8),
      leaderboard,
    });
  } catch (err) {
    console.error("[POST /api/ingest/addon] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error procesando archivo SavedVariables.",
      },
      { status: 500 }
    );
  }
}
