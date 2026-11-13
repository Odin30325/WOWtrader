import sqlite3
import urllib.request
import json
import time
import os

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

print("1. Subiendo items_catalog...")
items = [dict(r) for r in cur.execute("SELECT * FROM items_catalog").fetchall()]
for i in range(0, len(items), 500):
    post("items_catalog", items[i:i+500])
print(f"-> {len(items)} ítems subidos con éxito a Supabase.")

print("2. Subiendo recipes_catalog...")
recipes = []
for r in cur.execute("SELECT * FROM recipes_catalog").fetchall():
    d = dict(r)
    d["is_forever_exclusive"] = bool(d["is_forever_exclusive"])
    d["reagents"] = json.loads(d["reagents"])
    recipes.append(d)
if recipes:
    post("recipes_catalog", recipes)
print(f"-> {len(recipes)} recetas de Minería e Ingeniería subidas a Supabase.")

print("3. Subiendo market_snapshots recientes...")
snaps = [dict(r) for r in cur.execute("""
    SELECT region, house_id, item_id, snapshot_time, hour_of_day, day_of_week,
           min_price, p10_price, median_price, total_quantity, num_listings, source, uploaded_by
    FROM market_snapshots
    ORDER BY snapshot_time DESC
    LIMIT 15000
""").fetchall()]

for i in range(0, len(snaps), 1000):
    post("market_snapshots", snaps[i:i+1000])
    time.sleep(0.2)
print(f"-> {len(snaps)} snapshots analíticos subidos con éxito a Supabase.")
