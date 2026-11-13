import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        wow: {
          gold: "#ffd100",
          silver: "#e6e6e6",
          copper: "#eda55f",
          alliance: "#0070dd",
          epic: "#a335ee",
          rare: "#0070dd",
          uncommon: "#1eff00",
          legendary: "#ff8000",
        },
      },
    },
  },
  plugins: [],
};
export default config;
