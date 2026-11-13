import { NextRequest, NextResponse } from "next/server";
import { generateForeverMarketDataLua } from "@/lib/lua-exporter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const houseId = Number(
    searchParams.get("houseId") || process.env.DEFAULT_HOUSE_ID || 110
  );

  const luaContent = generateForeverMarketDataLua(houseId);

  return new NextResponse(luaContent, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="ForeverMarketData.lua"`,
      "Cache-Control": "no-store",
    },
  });
}
