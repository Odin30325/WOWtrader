import fs from "fs";
import path from "path";
import { parseForeverMarketAuditLua } from "../src/lib/lua-parser";
import { upsertMarketSnapshots } from "../src/lib/db";

const filePath =
  process.argv[2] ||
  path.join(
    process.cwd(),
    "addon",
    "sample_SavedVariables",
    "ForeverMarketAudit.lua"
  );

if (!fs.existsSync(filePath)) {
  console.error(`Archivo no encontrado: ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf-8");
const parsed = parseForeverMarketAuditLua(content);
const inserted = upsertMarketSnapshots(parsed.snapshots);

console.log(
  `[ClanSyncCLI] Subida completada para jugador '${parsed.uploadedBy}' (House #${parsed.houseId}) en corte ${parsed.snapshotTimeISO}: ${inserted} ítems auditados.`
);
