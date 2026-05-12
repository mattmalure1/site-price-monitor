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
        green: {
          signal: "#16a34a",
        },
        yellow: {
          signal: "#ca8a04",
        },
        red: {
          signal: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
