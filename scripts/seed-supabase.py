import sqlite3
import urllib.request
import json
import time
import os

# Cargar .env.local si existe
if os.path.exists(".env.local"):
    with open(".env.local", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

conn = sqlite3.connect("data/forever_market.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

secret_key = os.environ.get("SUPABASE_SECRET_KEY", "")
supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")

if not secret_key or not supabase_url:
    raise RuntimeError("Faltan las variables de entorno SUPABASE_URL y SUPABASE_SECRET_KEY")

headers = {
    "apikey": secret_key,
    "Authorization": f"Bearer {secret_key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def post(table, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{supabase_url}/rest/v1/{table}", data=body, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return resp.status

def delete_query(table, query):
    req = urllib.request.Request(f"{supabase_url}/rest/v1/{table}?{query}", headers=headers, method="DELETE")
    with urllib.request.urlopen(req) as resp:
        return resp.status

print("1. Subiendo items_catalog...")
allowed_item_cols = {
    "item_id", "name_es", "name_en", "category", "subcategory",
    "icon_url", "vendor_sell_price", "stack_size", "expansion_flag"
}
items = [
    {k: v for k, v in dict(r).items() if k in allowed_item_cols}
    for r in cur.execute("SELECT * FROM items_catalog").fetchall()
]
for i in range(0, len(items), 500):
    post("items_catalog", items[i:i+500])
print(f"-> {len(items)} ítems subidos con éxito a Supabase.")

print("2. Limpiando recetas manuales antiguas y subiendo recipes_catalog oficiales...")
try:
    delete_query("recipes_catalog", "and=(recipe_id.gte.1001,recipe_id.lte.1014)")
    delete_query("recipes_catalog", "and=(recipe_id.gte.2001,recipe_id.lte.2007)")
    delete_query("recipes_catalog", "and=(recipe_id.gte.9001,recipe_id.lte.9015)")
except Exception as e:
    print(f"Aviso limpiando recetas antiguas: {e}")

recipes = []
for r in cur.execute("SELECT * FROM recipes_catalog").fetchall():
    d = dict(r)
    d["is_forever_exclusive"] = bool(d["is_forever_exclusive"])
    d["reagents"] = json.loads(d["reagents"])
    recipes.append(d)
for i in range(0, len(recipes), 500):
    post("recipes_catalog", recipes[i:i+500])
print(f"-> {len(recipes)} recetas oficiales de las 12 profesiones subidas a Supabase.")

print("3. Subiendo market_snapshots recientes...")
snaps = [dict(r) for r in cur.execute("""
    SELECT region, house_id, item_id, snapshot_time, hour_of_day, day_of_week,
           min_price, p10_price, median_price, total_quantity, num_listings, source, uploaded_by
    FROM market_snapshots
    ORDER BY snapshot_time DESC
    LIMIT 15000
""").fetchall()]

for i in range(0, len(snaps), 1000):
    post("market_snapshots?on_conflict=house_id,item_id,snapshot_time", snaps[i:i+1000])
    time.sleep(0.2)
print(f"-> {len(snaps)} snapshots analíticos subidos con éxito a Supabase.")

