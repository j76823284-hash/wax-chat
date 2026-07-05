import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wax: {
          50: "#fff7ed",
          100: "#ffedd5",
          400: "#fb923c",
          500: "#f78e1e", // WAX / Antelope orange
          600: "#ea7a0c",
          700: "#c2620a",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
