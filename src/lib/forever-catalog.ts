import seedItemsRaw from "./static-items-seed.json";
import officialRecipesRaw from "./official-recipes-seed.json";

export type ProfessionName =
  | "Ingeniería"
  | "Minería"
  | "Alquimia"
  | "Herrería"
  | "Cocina"
  | "Encantamiento"
  | "Primeros auxilios"
  | "Pesca"
  | "Herboristería"
  | "Peletería"
  | "Desuello"
  | "Sastrería";

export const ALL_PROFESSIONS: ProfessionName[] = [
  "Ingeniería",
  "Minería",
  "Alquimia",
  "Herrería",
  "Cocina",
  "Sastrería",
  "Peletería",
  "Encantamiento",
  "Primeros auxilios",
  "Pesca",
  "Herboristería",
  "Desuello",
];

export interface CatalogItemRecord {
  item_id: number;
  name_es: string;
  icon_url: string;
  category: string;
  vendor_sell_price: number;
  vendor_buy_price?: number;
}

export interface RecipeReagent {
  item_id: number;
  count: number;
  name_es?: string;
}

export interface RecipeCatalogRecord {
  recipe_id: number;
  name_es: string;
  profession: ProfessionName;
  category_name: string;
  is_forever_exclusive: boolean;
  output_item_id: number;
  output_quantity: number;
  reagents: RecipeReagent[];
}

// Precios unitarios oficiales de compra en NPC Vendedor (en cobre) para suministros de profesión
// Esto garantiza que si un hilo, vial, tinte, flujo o especia no está en la AH (o está inflado por revendedores),
// el Laboratorio de Profesiones use el costo real del vendedor NPC.
export const KNOWN_NPC_VENDOR_BUY_PRICES: Record<number, number> = {
  // Viales (Alquimia / Pesca)
  3371: 4,     // Vial vacío (20c por 5 = 4c c/u)
  3372: 40,    // Vial emplomado (2s por 5 = 40c c/u)
  8925: 500,   // Vial de cristal (25s por 5 = 5s c/u)
  18256: 1500, // Vial imbuido
  // Hilos y Tintes (Sastrería / Peletería / Ingeniería Forever)
  2320: 10,    // Hilo burdo
  2321: 100,   // Hilo fino
  4291: 500,   // Hilo de seda
  8343: 2000,  // Hilo pesado de seda
  14341: 5000, // Hilo rúnico
  2604: 50,    // Tinte rojo
  2605: 50,    // Tinte verde
  4340: 350,   // Tinte gris
  4341: 500,   // Tinte amarillo
  4342: 2500,  // Tinte púrpura
  6260: 50,    // Tinte azul
  6261: 1000,  // Tinte naranja
  10290: 2500, // Tinte rosa
  2324: 25,    // Lejía
  // Nuevos Suministros de Vendedor en WoW: Forever (1.60.1_70399)
  249409: 300,  // Tinte cerúleo (3s)
  249410: 500,  // Ácido sulfúrico (5s)
  249430: 1500, // Tinte magenta (15s)
  249431: 1500, // Tinte verde esmeralda (15s)
  249432: 1000, // Lija (10s)
  // Herrería / Minería / Ingeniería
  2880: 100,   // Flujo débil (1s)
  3466: 2000,  // Flujo fuerte (20s)
  3857: 500,   // Carbón (5s)
  4399: 200,   // Empuñadura de madera (2s)
  4400: 2000,  // Culata pesada (20s)
  4470: 38,    // Madera simple
  11291: 4500, // Madera de estrella
  // Cocina y Peletería
  2678: 10,    // Especias suaves
  3713: 160,   // Especias calmantes
  2692: 400,   // Especias picantes
  4289: 50,    // Sal
  159: 25,     // Agua de manantial refrescante
};

export function classifyItemCategory(
  itemId: number,
  nameEs: string,
  subclassEs: string,
  classEs: string
): string {
  const lowerName = (nameEs || "").toLowerCase();
  const lowerSub = (subclassEs || "").toLowerCase();
  const lowerCls = (classEs || "").toLowerCase();

  // 1. Cajones arrebatados y Libranzas de WoW: Forever
  if (
    (itemId >= 248682 && itemId <= 248715) ||
    lowerName.includes("cajón arrebatado") ||
    lowerName.includes("libranza de ")
  ) {
    return "Cajones Forever";
  }

  // 2. Armas (Espadas, Hachas, Mazas, Dagas, Bastones, Arcos, Armas de fuego, Varitas, Escudos/Mano izq)
  if (
    lowerCls === "arma" ||
    lowerSub.includes("espada") ||
    lowerSub.includes("hacha") ||
    lowerSub.includes("maza") ||
    lowerSub.includes("daga") ||
    lowerSub.includes("bastón") ||
    lowerSub.includes("arco") ||
    lowerSub.includes("arma de fuego") ||
    lowerSub.includes("varita") ||
    lowerSub.includes("arma de asta") ||
    lowerSub.includes("arma de puño") ||
    lowerSub.includes("ballesta")
  ) {
    return "Armas";
  }

  // 3. Armaduras y Equipo (Tela, Cuero, Malla, Placas, Escudos, Anillos, Amuletos, Abalorios)
  if (
    lowerCls === "armadura" ||
    lowerSub === "malla" ||
    lowerSub === "placas" ||
    lowerSub === "escudo" ||
    (lowerCls === "armadura" && (lowerSub === "tela" || lowerSub === "cuero"))
  ) {
    return "Armaduras";
  }

  // 4. Bolsas, Carcajes y Contenedores
  if (
    lowerCls === "contenedor" ||
    lowerCls === "carcaj" ||
    lowerSub.includes("bolsa") ||
    lowerSub.includes("carcaj") ||
    lowerName.startsWith("bolsa ") ||
    lowerName.startsWith("faltriquera ") ||
    lowerName.startsWith("mochila ")
  ) {
    return "Bolsas y Contenedores";
  }

  // 5. Recetas, Patrones, Diseños, Esquemas y Fórmulas
  if (
    lowerCls === "receta" ||
    lowerName.startsWith("receta:") ||
    lowerName.startsWith("patrón:") ||
    lowerName.startsWith("diseño:") ||
    lowerName.startsWith("esquema:") ||
    lowerName.startsWith("fórmula:") ||
    lowerName.startsWith("manual:")
  ) {
    return "Recetas y Patrones";
  }

  // 6. Proyectiles y Munición
  if (lowerCls === "proyectil" || lowerSub === "bala" || lowerSub === "flecha") {
    return "Proyectiles y Munición";
  }

  // 7. Minería (Menas, Barras, Piedras)
  if (
    lowerSub.includes("metal y piedra") ||
    lowerName.startsWith("mena ") ||
    lowerName.startsWith("barra de ") ||
    lowerName.startsWith("piedra ")
  ) {
    return "Minería";
  }

  // 8. Ingeniería (Piezas, Explosivos, Dispositivos, Miras, C-GUR / SAF-T, EZ-Thro, Robots)
  if (
    lowerSub.includes("piezas") ||
    lowerSub.includes("explosivos") ||
    lowerSub.includes("dispositivo") ||
    lowerName.includes("c-gur") ||
    lowerName.includes("para tontos") ||
    lowerName.startsWith("mira ") ||
    lowerName.startsWith("robot de ") ||
    lowerName.startsWith("tubo ") ||
    lowerName.includes("granada") ||
    lowerName.includes("dinamita") ||
    lowerName.includes("bomba") ||
    lowerName.includes("girocronátomo")
  ) {
    return "Ingeniería";
  }

  // 9. Herboristería
  if (lowerSub.includes("hierbas") || lowerName.includes("semillas de hierbas")) {
    return "Herboristería";
  }

  // 10. Alquimia y Pociones
  if (
    lowerSub.includes("pociones") ||
    lowerSub.includes("elixires") ||
    lowerSub.includes("frascos") ||
    lowerName.startsWith("poción ") ||
    lowerName.startsWith("elixir ") ||
    lowerName.startsWith("frasco ")
  ) {
    return "Alquimia y Pociones";
  }

  // 11. Cocina y Pesca
  if (
    lowerSub.includes("comida y bebida") ||
    lowerSub.includes("cocina") ||
    lowerName.includes("crudo") ||
    lowerName.startsWith("filete ") ||
    lowerName.startsWith("estofado ") ||
    lowerName.startsWith("té ") ||
    lowerName.startsWith("batido ")
  ) {
    return "Cocina y Pesca";
  }

  // 12. Primeros auxilios
  if (
    lowerName.startsWith("venda ") ||
    lowerName.startsWith("cataplasma ") ||
    lowerName.startsWith("torniquete ") ||
    lowerName.startsWith("contraveneno ")
  ) {
    return "Primeros auxilios";
  }

  // 13. Encantamiento y Pergaminos
  if (
    lowerSub.includes("encantamiento") ||
    lowerSub.includes("pergaminos") ||
    lowerName.startsWith("pergamino ") ||
    lowerName.startsWith("mota de ") ||
    lowerName.startsWith("polvo ") ||
    lowerName.startsWith("esencia ")
  ) {
    return "Encantamiento";
  }

  // 14. Sastrería y Peletería (Materiales textiles, cueros, pellejos, refuerzos)
  if (
    lowerSub.includes("tela") ||
    lowerSub.includes("cuero") ||
    lowerName.startsWith("paño ") ||
    lowerName.startsWith("madeja ") ||
    lowerName.startsWith("cuero ") ||
    lowerName.startsWith("pellejo ") ||
    lowerName.startsWith("escama ") ||
    lowerName.startsWith("refuerzo para armadura")
  ) {
    return "Sastrería y Peletería";
  }

  return "Materiales y Otros";
}

// Construir catálogo unificado combinando static-items-seed.json + ítems referenciados en official-recipes-seed.json
function buildInitialCatalog(): CatalogItemRecord[] {
  const map = new Map<number, CatalogItemRecord>();

  const rawItems = seedItemsRaw as Array<{
    item_id: number;
    name_es: string;
    icon_url: string;
    subclass?: string;
    class?: string;
    vendor_sell_price?: number;
    vendor_buy_price?: number;
  }>;

  for (const row of rawItems) {
    const id = Number(row.item_id);
    const vendorBuy =
      KNOWN_NPC_VENDOR_BUY_PRICES[id] ?? row.vendor_buy_price ?? 0;
    map.set(id, {
      item_id: id,
      name_es: row.name_es,
      icon_url:
        row.icon_url ||
        "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg",
      category: classifyItemCategory(
        id,
        row.name_es,
        row.subclass || "",
        row.class || ""
      ),
      vendor_sell_price: row.vendor_sell_price || 0,
      vendor_buy_price: vendorBuy,
    });
  }

  const rawRecipes = officialRecipesRaw as Array<{
    recipe_id: number;
    name_es: string;
    profession: string;
    category_name?: string;
    is_forever_exclusive: boolean;
    output_item_id: number;
    output_item_name?: string;
    output_quantity: number;
    reagents: Array<{ item_id: number; count: number; name_es?: string }>;
  }>;

  for (const rec of rawRecipes) {
    const outId = Number(rec.output_item_id);
    if (outId && !map.has(outId)) {
      const nameEs = rec.output_item_name || rec.name_es;
      map.set(outId, {
        item_id: outId,
        name_es: nameEs,
        icon_url:
          "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg",
        category: classifyItemCategory(
          outId,
          nameEs,
          rec.category_name || "",
          rec.profession
        ),
        vendor_sell_price: 0,
        vendor_buy_price: KNOWN_NPC_VENDOR_BUY_PRICES[outId] ?? 0,
      });
    }

    for (const rg of rec.reagents || []) {
      const rgId = Number(rg.item_id);
      if (rgId && !map.has(rgId)) {
        const rgName = rg.name_es || `Objeto #${rgId}`;
        map.set(rgId, {
          item_id: rgId,
          name_es: rgName,
          icon_url:
            "https://render.worldofwarcraft.com/forever-us/icons/56/inv_misc_questionmark.jpg",
          category: classifyItemCategory(rgId, rgName, "", ""),
          vendor_sell_price: 0,
          vendor_buy_price: KNOWN_NPC_VENDOR_BUY_PRICES[rgId] ?? 0,
        });
      }
    }
  }

  return Array.from(map.values());
}

export const INITIAL_ITEMS_CATALOG: CatalogItemRecord[] = buildInitialCatalog();

export const FOREVER_RECIPES_CATALOG: RecipeCatalogRecord[] = (
  officialRecipesRaw as Array<{
    recipe_id: number;
    name_es: string;
    profession: ProfessionName;
    category_name?: string;
    is_forever_exclusive: boolean;
    output_item_id: number;
    output_quantity: number;
    reagents: Array<{ item_id: number; count: number; name_es?: string }>;
  }>
).map((r) => ({
  recipe_id: Number(r.recipe_id),
  name_es: r.name_es,
  profession: r.profession,
  category_name: r.category_name || r.profession,
  is_forever_exclusive: Boolean(r.is_forever_exclusive),
  output_item_id: Number(r.output_item_id),
  output_quantity: Math.max(1, Number(r.output_quantity || 1)),
  reagents: (r.reagents || []).map((rg) => ({
    item_id: Number(rg.item_id),
    count: Math.max(1, Number(rg.count || 1)),
    name_es: rg.name_es,
  })),
}));
