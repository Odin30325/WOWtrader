import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  INITIAL_ITEMS_CATALOG,
  FOREVER_RECIPES_CATALOG,
} from "./forever-catalog";
import { MarketSnapshotRow } from "./db";
import { ensureEnvLoaded } from "./env";

ensureEnvLoaded();

let clientInstance: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient | null {
  ensureEnvLoaded();
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!supabaseUrl || !supabaseKey) return null;
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return clientInstance;
}

/**
 * Inicializa catálogo de recetas y catálogo base de items en Supabase si están vacíos.
 */
export async function seedSupabaseCatalogIfNeeded(): Promise<void> {
  const sb = getSupabaseAdminClient();
  if (!sb) return;

  try {
    const { count } = await sb
      .from("recipes_catalog")
      .select("*", { count: "exact", head: true });

    if (count === 0) {
      const formattedRecipes = FOREVER_RECIPES_CATALOG.map((r) => ({
        recipe_id: r.recipe_id,
        name_es: r.name_es,
        profession: r.profession,
        is_forever_exclusive: r.is_forever_exclusive,
        output_item_id: r.output_item_id,
        output_quantity: r.output_quantity,
        reagents: r.reagents,
      }));

      const formattedItems = INITIAL_ITEMS_CATALOG.map((i) => ({
        item_id: i.item_id,
        name_es: i.name_es,
        icon_url: i.icon_url,
        category: i.category,
        vendor_sell_price: i.vendor_sell_price,
      }));

      await sb
        .from("items_catalog")
        .upsert(formattedItems, { onConflict: "item_id" });
      await sb
        .from("recipes_catalog")
        .upsert(formattedRecipes, { onConflict: "recipe_id" });
    }
  } catch (err) {
    console.warn("[SupabaseSync] Error seeding catalog:", err);
  }
}

/**
 * Sincroniza snapshots a Supabase en lotes
 */
export async function syncSnapshotsToSupabase(
  snapshots: MarketSnapshotRow[]
): Promise<number> {
  const sb = getSupabaseAdminClient();
  if (!sb || snapshots.length === 0) return 0;

  try {
    const uniqueItemIds = Array.from(new Set(snapshots.map((s) => s.item_id)));
    const stubs = uniqueItemIds.map((id) => ({
      item_id: id,
      name_es: `Objeto #${id}`,
      icon_url:
        "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg",
      category: "Materiales y Otros",
      vendor_sell_price: 0,
    }));

    for (let i = 0; i < stubs.length; i += 1000) {
      await sb.from("items_catalog").upsert(stubs.slice(i, i + 1000), {
        onConflict: "item_id",
        ignoreDuplicates: true,
      });
    }

    let inserted = 0;
    for (let i = 0; i < snapshots.length; i += 1000) {
      const batch = snapshots.slice(i, i + 1000);
      const { error } = await sb.from("market_snapshots").upsert(batch, {
        onConflict: "house_id,item_id,snapshot_time",
      });
      if (!error) {
        inserted += batch.length;
      }
    }
    return inserted;
  } catch (err) {
    console.warn("[SupabaseSync] Error syncSnapshotsToSupabase:", err);
    return 0;
  }
}
