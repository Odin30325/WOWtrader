import seedItemsRaw from "./static-items-seed.json";

export interface CatalogItemRecord {
  item_id: number;
  name_es: string;
  icon_url: string;
  category: string;
  vendor_sell_price: number;
}

export interface RecipeReagent {
  item_id: number;
  count: number;
}

export interface RecipeCatalogRecord {
  recipe_id: number;
  name_es: string;
  profession: "Ingeniería" | "Minería";
  is_forever_exclusive: boolean;
  output_item_id: number;
  output_quantity: number;
  reagents: RecipeReagent[];
}

export function classifyItemCategory(
  itemId: number,
  nameEs: string,
  subclassEs: string,
  classEs: string
): string {
  const lowerName = (nameEs || "").toLowerCase();
  const lowerSub = (subclassEs || "").toLowerCase();

  if (
    itemId >= 248682 &&
    itemId <= 248715
  ) {
    return "Cajones Forever";
  }

  if (
    lowerSub.includes("metal y piedra") ||
    lowerName.includes("mena ") ||
    lowerName.includes("barra de ") ||
    lowerName.includes("piedra ")
  ) {
    return "Minería";
  }

  if (
    lowerSub.includes("piezas") ||
    lowerSub.includes("explosivos") ||
    lowerSub.includes("dispositivo") ||
    lowerName.includes("c-gur") ||
    lowerName.includes("para tontos") ||
    lowerName.includes("mira ") ||
    lowerName.includes("robot de ") ||
    lowerName.includes("tubo ") ||
    lowerName.includes("granada") ||
    lowerName.includes("dinamita") ||
    lowerName.includes("bomba")
  ) {
    return "Ingeniería";
  }

  if (lowerSub.includes("hierbas") || lowerName.includes("semillas de hierbas")) {
    return "Herboristería";
  }

  if (
    lowerSub.includes("pociones") ||
    lowerSub.includes("elixires") ||
    lowerSub.includes("pergaminos") ||
    lowerSub.includes("comida y bebida") ||
    lowerSub.includes("cocina")
  ) {
    return "Consumibles";
  }

  if (
    lowerSub.includes("tela") ||
    lowerSub.includes("cuero") ||
    lowerName.includes("paño ") ||
    lowerName.includes("cuero ") ||
    lowerName.includes("pellejo ")
  ) {
    return "Sastrería y Peletería";
  }

  if (lowerSub.includes("encantamiento")) {
    return "Encantamiento";
  }

  return classEs && classEs !== "Otros" ? classEs : "Materiales y Otros";
}

export const INITIAL_ITEMS_CATALOG: CatalogItemRecord[] = (
  seedItemsRaw as Array<{
    item_id: number;
    name_es: string;
    icon_url: string;
    subclass: string;
    class: string;
    vendor_sell_price: number;
  }>
).map((row) => ({
  item_id: row.item_id,
  name_es: row.name_es,
  icon_url: row.icon_url,
  category: classifyItemCategory(row.item_id, row.name_es, row.subclass, row.class),
  vendor_sell_price: row.vendor_sell_price || 0,
}));

export const FOREVER_RECIPES_CATALOG: RecipeCatalogRecord[] = [
  // =========================================================================
  // RECETAS EXCLUSIVAS DE WOW: FOREVER (1.60.1_70399) — INGENIERÍA & MINERÍA
  // =========================================================================
  {
    recipe_id: 9001,
    name_es: "Tiras C-GUR (SAF-T Tabs)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260784,
    output_quantity: 2,
    reagents: [
      { item_id: 2840, count: 1 }, // Barra de cobre
      { item_id: 2589, count: 1 }, // Paño de lino
    ],
  },
  {
    recipe_id: 9002,
    name_es: "Dinamita C-GUR (SAF-T Dynamite)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260792,
    output_quantity: 2,
    reagents: [
      { item_id: 260784, count: 1 }, // Tiras C-GUR
      { item_id: 4359, count: 1 },   // Puñado de tornillos de cobre
      { item_id: 2589, count: 1 },   // Paño de lino
    ],
  },
  {
    recipe_id: 9003,
    name_es: "Bomba de cobre C-GUR (SAF-T Copper Bomb)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260793,
    output_quantity: 2,
    reagents: [
      { item_id: 2840, count: 2 },   // Barra de cobre
      { item_id: 260784, count: 1 }, // Tiras C-GUR
      { item_id: 4359, count: 1 },   // Puñado de tornillos de cobre
    ],
  },
  {
    recipe_id: 9004,
    name_es: "Sobreveste para tontos (EZ-Thro Wrap)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260794,
    output_quantity: 2,
    reagents: [
      { item_id: 2592, count: 2 }, // Paño de lana
      { item_id: 2318, count: 1 }, // Cuero ligero
    ],
  },
  {
    recipe_id: 9005,
    name_es: "Bomba de cobre XL para tontos (EZ-Thro Copper Bomb XL)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260795,
    output_quantity: 2,
    reagents: [
      { item_id: 260793, count: 2 }, // Bomba de cobre C-GUR
      { item_id: 260794, count: 1 }, // Sobreveste para tontos
    ],
  },
  {
    recipe_id: 9006,
    name_es: "Bomba de bronce C-GUR (SAF-T Bronze Bomb)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260797,
    output_quantity: 2,
    reagents: [
      { item_id: 2841, count: 2 },   // Barra de bronce
      { item_id: 4364, count: 1 },   // Pólvora gruesa
      { item_id: 260784, count: 1 }, // Tiras C-GUR
    ],
  },
  {
    recipe_id: 9007,
    name_es: "Mecha ignífuga para tontos (EZ-Thro Fireproof Fuse)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260801,
    output_quantity: 2,
    reagents: [
      { item_id: 4306, count: 2 }, // Paño de seda
      { item_id: 4377, count: 1 }, // Pólvora pesada
    ],
  },
  {
    recipe_id: 9008,
    name_es: "Granada para tontos (EZ-Thro Grenade)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260803,
    output_quantity: 2,
    reagents: [
      { item_id: 3575, count: 2 },   // Barra de hierro
      { item_id: 4377, count: 2 },   // Pólvora pesada
      { item_id: 260801, count: 1 }, // Mecha ignífuga para tontos
    ],
  },
  {
    recipe_id: 9009,
    name_es: "Bomba C-GUR (SAF-T Bomb)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260805,
    output_quantity: 2,
    reagents: [
      { item_id: 3575, count: 2 }, // Barra de hierro
      { item_id: 4377, count: 1 }, // Pólvora pesada
      { item_id: 4306, count: 1 }, // Paño de seda
    ],
  },
  {
    recipe_id: 9010,
    name_es: "Tubo C-GUR (SAF-T Tube)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260813,
    output_quantity: 1,
    reagents: [
      { item_id: 3860, count: 2 }, // Barra de mitril
      { item_id: 4371, count: 1 }, // Tubo de bronce
    ],
  },
  {
    recipe_id: 9011,
    name_es: "Granada de torio para tontos (EZ-Thro Thorium Grenade)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 260816,
    output_quantity: 3,
    reagents: [
      { item_id: 12359, count: 3 },  // Barra de torio
      { item_id: 15992, count: 3 },  // Pólvora densa
      { item_id: 260801, count: 1 }, // Mecha ignífuga para tontos
    ],
  },
  {
    recipe_id: 9012,
    name_es: "Robot de componentes (Reagent Bot — Forever)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 279950,
    output_quantity: 1,
    reagents: [
      { item_id: 3860, count: 4 }, // Barra de mitril
      { item_id: 4382, count: 1 }, // Marco de bronce
      { item_id: 4389, count: 1 }, // Girocronátomo
    ],
  },
  {
    recipe_id: 9013,
    name_es: "Robot de reparación (Repair Bot — Forever)",
    profession: "Ingeniería",
    is_forever_exclusive: true,
    output_item_id: 279949,
    output_quantity: 1,
    reagents: [
      { item_id: 12359, count: 6 }, // Barra de torio
      { item_id: 16000, count: 1 }, // Tubo de torio
      { item_id: 4389, count: 1 },  // Girocronátomo
    ],
  },
  {
    recipe_id: 9014,
    name_es: "Fundir barra de torio pesada (Forever Mining)",
    profession: "Minería",
    is_forever_exclusive: true,
    output_item_id: 251291,
    output_quantity: 1,
    reagents: [
      { item_id: 248815, count: 1 }, // Mena de torio pesada
    ],
  },
  {
    recipe_id: 9015,
    name_es: "Fundir barra de azerotio (Forever Mining)",
    profession: "Minería",
    is_forever_exclusive: true,
    output_item_id: 249726,
    output_quantity: 1,
    reagents: [
      { item_id: 12359, count: 2 }, // Barra de torio
      { item_id: 3577, count: 1 },  // Barra de oro
    ],
  },

  // =========================================================================
  // RECETAS CLÁSICAS DE INGENIERÍA & MINERÍA EN WOW: FOREVER
  // =========================================================================
  {
    recipe_id: 1001,
    name_es: "Tubo de bronce",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 4371,
    output_quantity: 1,
    reagents: [
      { item_id: 2841, count: 2 }, // Barra de bronce
    ],
  },
  {
    recipe_id: 1002,
    name_es: "Puñado de tornillos de cobre",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 4359,
    output_quantity: 2,
    reagents: [
      { item_id: 2840, count: 1 }, // Barra de cobre
    ],
  },
  {
    recipe_id: 1003,
    name_es: "Tubo de cobre",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 4361,
    output_quantity: 1,
    reagents: [
      { item_id: 2840, count: 2 }, // Barra de cobre
    ],
  },
  {
    recipe_id: 1004,
    name_es: "Modulador de cobre",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 4363,
    output_quantity: 1,
    reagents: [
      { item_id: 4359, count: 2 }, // Puñado de tornillos de cobre
      { item_id: 2840, count: 1 }, // Barra de cobre
      { item_id: 2589, count: 2 }, // Paño de lino
    ],
  },
  {
    recipe_id: 1005,
    name_es: "Marco de bronce",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 4382,
    output_quantity: 1,
    reagents: [
      { item_id: 2841, count: 2 }, // Barra de bronce
      { item_id: 2319, count: 1 }, // Cuero medio
      { item_id: 2592, count: 1 }, // Paño de lana
    ],
  },
  {
    recipe_id: 1006,
    name_es: "Granada de hierro",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 4390,
    output_quantity: 2,
    reagents: [
      { item_id: 3575, count: 1 }, // Barra de hierro
      { item_id: 4377, count: 1 }, // Pólvora pesada
      { item_id: 4306, count: 1 }, // Paño de seda
    ],
  },
  {
    recipe_id: 1007,
    name_es: "Mira estándar",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 4406,
    output_quantity: 1,
    reagents: [
      { item_id: 4361, count: 1 }, // Tubo de cobre
      { item_id: 4359, count: 1 }, // Puñado de tornillos de cobre
    ],
  },
  {
    recipe_id: 1008,
    name_es: "Mira mortal",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 10546,
    output_quantity: 1,
    reagents: [
      { item_id: 10559, count: 1 }, // Tubo de mitril
      { item_id: 3860, count: 2 },  // Barra de mitril
    ],
  },
  {
    recipe_id: 1009,
    name_es: "Tubo de torio",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 16000,
    output_quantity: 1,
    reagents: [
      { item_id: 12359, count: 6 }, // Barra de torio
    ],
  },
  {
    recipe_id: 1010,
    name_es: "Granada de torio",
    profession: "Ingeniería",
    is_forever_exclusive: false,
    output_item_id: 15993,
    output_quantity: 3,
    reagents: [
      { item_id: 16000, count: 1 }, // Tubo de torio
      { item_id: 12359, count: 3 }, // Barra de torio
      { item_id: 15992, count: 3 }, // Pólvora densa
      { item_id: 14047, count: 3 }, // Paño rúnico
    ],
  },
  {
    recipe_id: 2001,
    name_es: "Fundir cobre",
    profession: "Minería",
    is_forever_exclusive: false,
    output_item_id: 2840,
    output_quantity: 1,
    reagents: [
      { item_id: 2770, count: 1 }, // Mena de cobre
    ],
  },
  {
    recipe_id: 2002,
    name_es: "Fundir estaño",
    profession: "Minería",
    is_forever_exclusive: false,
    output_item_id: 3576,
    output_quantity: 1,
    reagents: [
      { item_id: 2771, count: 1 }, // Mena de estaño
    ],
  },
  {
    recipe_id: 2003,
    name_es: "Fundir bronce",
    profession: "Minería",
    is_forever_exclusive: false,
    output_item_id: 2841,
    output_quantity: 2,
    reagents: [
      { item_id: 2840, count: 1 }, // Barra de cobre
      { item_id: 3576, count: 1 }, // Barra de estaño
    ],
  },
  {
    recipe_id: 2004,
    name_es: "Fundir hierro",
    profession: "Minería",
    is_forever_exclusive: false,
    output_item_id: 3575,
    output_quantity: 1,
    reagents: [
      { item_id: 2772, count: 1 }, // Mena de hierro
    ],
  },
  {
    recipe_id: 2005,
    name_es: "Fundir acero",
    profession: "Minería",
    is_forever_exclusive: false,
    output_item_id: 3859,
    output_quantity: 1,
    reagents: [
      { item_id: 3575, count: 1 }, // Barra de hierro
    ],
  },
  {
    recipe_id: 2006,
    name_es: "Fundir mitril",
    profession: "Minería",
    is_forever_exclusive: false,
    output_item_id: 3860,
    output_quantity: 1,
    reagents: [
      { item_id: 3858, count: 1 }, // Mena de mitril
    ],
  },
  {
    recipe_id: 2007,
    name_es: "Fundir torio",
    profession: "Minería",
    is_forever_exclusive: false,
    output_item_id: 12359,
    output_quantity: 1,
    reagents: [
      { item_id: 10620, count: 1 }, // Mena de torio
    ],
  },
];
