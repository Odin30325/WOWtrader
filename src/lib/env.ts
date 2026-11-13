import fs from "fs";
import path from "path";

let loaded = false;

/**
 * Carga variables desde .env.local o .env cuando se ejecuta desde CLI (worker/scripts)
 * fuera del runtime de Next.js, evitando hardcodear credenciales en el código fuente.
 */
export function ensureEnvLoaded(): void {
  if (loaded) return;
  loaded = true;

  for (const fileName of [".env.local", ".env"]) {
    const fullPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const val = line
        .slice(eqIdx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}
