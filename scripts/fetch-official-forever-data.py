import os
import json
import sqlite3
import base64
import time
import threading
import requests
from requests.adapters import HTTPAdapter
from concurrent.futures import ThreadPoolExecutor, as_completed

# Cargar variables de .env.local
env_path = os.path.join(os.getcwd(), ".env.local")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

CLIENT_ID = os.environ["BLIZZARD_CLIENT_ID"]
CLIENT_SECRET = os.environ["BLIZZARD_CLIENT_SECRET"]

auth_b64 = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
token_resp = requests.post(
    "https://oauth.battle.net/token",
    data={"grant_type": "client_credentials"},
    headers={"Authorization": f"Basic {auth_b64}"},
    timeout=15,
)
token_resp.raise_for_status()
TOKEN = token_resp.json()["access_token"]

session = requests.Session()
adapter = HTTPAdapter(pool_connections=32, pool_maxsize=32, max_retries=2)
session.mount("https://", adapter)
session.headers.update({"Authorization": f"Bearer {TOKEN}"})

# Controlador de tasa para evitar HTTP 429 (máx ~75 req/s con reintento automático en 429)
rate_lock = threading.Lock()
last_req_time = [0.0]

def blizzard_get(url, max_attempts=6):
    for attempt in range(max_attempts):
        with rate_lock:
            now = time.time()
            wait = 0.013 - (now - last_req_time[0])
            if wait > 0:
                time.sleep(wait)
            last_req_time[0] = time.time()
        try:
            r = session.get(url, timeout=12)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                retry_after = float(r.headers.get("Retry-After", 1.2))
                time.sleep(max(0.8, retry_after) + attempt * 0.4)
                continue
            if r.status_code == 404:
                return None
        except Exception:
            time.sleep(0.5 * (attempt + 1))
    return None

TIERS = [
    (202, 2941, "Ingeniería"),
    (186, 2946, "Minería"),
    (171, 2937, "Alquimia"),
    (164, 2938, "Herrería"),
    (185, 2939, "Cocina"),
    (333, 2940, "Encantamiento"),
    (129, 2942, "Primeros auxilios"),
    (356, 2943, "Pesca"),
    (182, 2944, "Herboristería"),
    (165, 2945, "Peletería"),
    (393, 2947, "Desuello"),
    (197, 2948, "Sastrería"),
]

# Cargar recetas ya descargadas para no repetirlas
recipes_json_path = os.path.join("src", "lib", "official-recipes-seed.json")
existing_recipes_map = {}
if os.path.exists(recipes_json_path):
    for r in json.load(open(recipes_json_path, "r", encoding="utf-8")):
        existing_recipes_map[int(r["recipe_id"])] = r

print("1. Descargando índice oficial de recetas de las 12 profesiones en static-forever-us...")
recipe_tasks = []
for pid, tid, pname in TIERS:
    url = f"https://us.api.blizzard.com/data/wow/profession/{pid}/skill-tier/{tid}?namespace=static-forever-us&locale=es_MX"
    data = blizzard_get(url)
    if data:
        for cat in data.get("categories", []):
            cat_name = cat.get("name") or ""
            for rec in cat.get("recipes", []):
                rid = int(rec["id"])
                if rid not in existing_recipes_map:
                    recipe_tasks.append((rid, rec.get("name"), pname, cat_name))

print(f"-> Recetas ya en caché: {len(existing_recipes_map)} | Recetas faltantes por consultar: {len(recipe_tasks)}")

def fetch_recipe_detail(task):
    rid, fallback_name, prof_name, cat_name = task
    url = f"https://us.api.blizzard.com/data/wow/recipe/{rid}?namespace=static-forever-us&locale=es_MX"
    d = blizzard_get(url)
    if not d:
        return None

    crafted = d.get("crafted_item")
    reagents_raw = d.get("reagents", [])
    if not crafted or not crafted.get("id") or not reagents_raw:
        return None

    out_id = int(crafted["id"])
    out_name = crafted.get("name") or d.get("name") or fallback_name or f"Receta #{rid}"
    rec_name = d.get("name") or fallback_name or out_name

    cq = d.get("crafted_quantity", {})
    if "value" in cq and cq["value"]:
        out_qty = max(1, int(round(float(cq["value"]))))
    elif "minimum" in cq and "maximum" in cq:
        out_qty = max(1, int(round((float(cq["minimum"]) + float(cq["maximum"])) / 2.0)))
    elif "minimum" in cq:
        out_qty = max(1, int(round(float(cq["minimum"]))))
    else:
        out_qty = 1

    reagents = []
    has_forever_reagent = False
    for rg in reagents_raw:
        rg_item = rg.get("reagent", {})
        rg_id = rg_item.get("id")
        rg_qty = rg.get("quantity", 1)
        if rg_id:
            rg_id_int = int(rg_id)
            if rg_id_int > 200000:
                has_forever_reagent = True
            reagents.append({
                "item_id": rg_id_int,
                "count": int(rg_qty),
                "name_es": rg_item.get("name") or f"Objeto #{rg_id_int}",
            })

    if not reagents:
        return None

    is_forever = bool(rid > 45000 or out_id > 200000 or has_forever_reagent)
    return {
        "recipe_id": int(rid),
        "name_es": rec_name,
        "profession": prof_name,
        "category_name": cat_name,
        "is_forever_exclusive": is_forever,
        "output_item_id": out_id,
        "output_item_name": out_name,
        "output_quantity": out_qty,
        "reagents": reagents,
    }

t0 = time.time()
with ThreadPoolExecutor(max_workers=16) as ex:
    futures = [ex.submit(fetch_recipe_detail, t) for t in recipe_tasks]
    for idx, fut in enumerate(as_completed(futures), 1):
        res = fut.result()
        if res:
            existing_recipes_map[res["recipe_id"]] = res
        if idx % 300 == 0:
            print(f"   Procesadas {idx}/{len(recipe_tasks)} recetas ({len(existing_recipes_map)} válidas acumuladas)...")

official_recipes = sorted(
    existing_recipes_map.values(),
    key=lambda x: (not x["is_forever_exclusive"], x["profession"], x["recipe_id"]),
)
with open(recipes_json_path, "w", encoding="utf-8") as f:
    json.dump(official_recipes, f, ensure_ascii=False, indent=2)

from collections import Counter
print("-> Resumen de recetas por profesión:", dict(Counter(r["profession"] for r in official_recipes)))
print(f"-> Total de recetas oficiales guardadas: {len(official_recipes)} en {time.time() - t0:.1f}s")

# 2. Enriquecer catálogo de ítems (todos los productos/materiales de recetas + top armas/armaduras/bolsas/recetas en AH)
conn = sqlite3.connect("data/forever_market.db")
cur = conn.cursor()

existing_seed_path = os.path.join("src", "lib", "static-items-seed.json")
existing_items = {}
if os.path.exists(existing_seed_path):
    for item in json.load(open(existing_seed_path, "r", encoding="utf-8")):
        existing_items[int(item["item_id"])] = item

recipe_item_names = {}
for rec in official_recipes:
    recipe_item_names[rec["output_item_id"]] = rec["output_item_name"]
    for rg in rec["reagents"]:
        recipe_item_names[rg["item_id"]] = rg["name_es"]

# Top ítems en la subasta (incluyendo equipo, armas, armaduras, bolsas, recetas y materiales)
ah_rows = cur.execute("""
    SELECT item_id, MAX(total_quantity) as max_qty, MAX(num_listings) as max_list, MAX(p10_price) as max_p10
    FROM market_snapshots
    GROUP BY item_id
    ORDER BY (CASE WHEN item_id > 200000 THEN 1 ELSE 0 END) DESC, max_list DESC, max_qty DESC
    LIMIT 2400
""").fetchall()

candidate_ids = set(recipe_item_names.keys()) | {int(r[0]) for r in ah_rows}
missing_ids = sorted(iid for iid in candidate_ids if iid not in existing_items)
print(f"2. Resolviendo metadatos desde static-forever-us para {len(missing_ids)} ítems adicionales...")

def fetch_item_meta(iid):
    d = blizzard_get(f"https://us.api.blizzard.com/data/wow/item/{iid}?namespace=static-forever-us&locale=es_MX")
    if not d:
        if iid in recipe_item_names:
            return {
                "item_id": iid,
                "name_es": recipe_item_names[iid],
                "icon_url": "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg",
                "subclass": "Otros",
                "class": "Objeto comerciable",
                "vendor_sell_price": 0,
                "vendor_buy_price": 0,
            }
        return None

    name_es = d.get("name") or recipe_item_names.get(iid) or f"Objeto #{iid}"
    sell_price = int(d.get("sell_price") or 0)
    purchase_price = int(d.get("purchase_price") or 0)
    purchase_qty = max(1, int(d.get("purchase_quantity") or 1))
    vendor_unit_buy = int(round(purchase_price / purchase_qty)) if purchase_price > 0 else 0

    cls_es = (d.get("item_class") or {}).get("name") or "Otros"
    sub_es = (d.get("item_subclass") or {}).get("name") or "Otros"

    icon_url = "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg"
    m = blizzard_get(f"https://us.api.blizzard.com/data/wow/media/item/{iid}?namespace=static-forever-us")
    if m and m.get("assets"):
        icon_url = m["assets"][0].get("value") or icon_url

    return {
        "item_id": iid,
        "name_es": name_es,
        "icon_url": icon_url,
        "subclass": sub_es,
        "class": cls_es,
        "vendor_sell_price": sell_price,
        "vendor_buy_price": vendor_unit_buy,
    }

t1 = time.time()
with ThreadPoolExecutor(max_workers=16) as ex:
    futures = [ex.submit(fetch_item_meta, iid) for iid in missing_ids]
    for idx, fut in enumerate(as_completed(futures), 1):
        res = fut.result()
        if res:
            existing_items[res["item_id"]] = res
        if idx % 300 == 0:
            print(f"   Resueltos {idx}/{len(missing_ids)} ítems ({len(existing_items)} total en catálogo)...")

all_catalog_list = sorted(existing_items.values(), key=lambda x: x["item_id"])
with open(existing_seed_path, "w", encoding="utf-8") as f:
    json.dump(all_catalog_list, f, ensure_ascii=False, indent=2)

print(f"-> Catálogo oficial completado con {len(all_catalog_list)} ítems en {time.time() - t1:.1f}s.")
