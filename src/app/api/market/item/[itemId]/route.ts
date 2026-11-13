import { NextRequest, NextResponse } from "next/server";
import { getItemIntradayDetail } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const houseId = Number(
      searchParams.get("houseId") || process.env.DEFAULT_HOUSE_ID || 110
    );
    const itemId = Number(params.itemId);

    if (!itemId || itemId <= 0) {
      return NextResponse.json({ error: "item_id inválido" }, { status: 400 });
    }

    const detail = getItemIntradayDetail(houseId, itemId);
    if (!detail) {
      return NextResponse.json(
        { error: "Ítem no encontrado en el catálogo" },
        { status: 404 }
      );
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[GET /api/market/item] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}
