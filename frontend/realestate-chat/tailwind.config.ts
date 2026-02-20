import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        brand: {
          50:  "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7cc8fb",
          400: "#36aaf6",
          500: "#0c8ee8",
          600: "#0070c6",
          700: "#0059a1",
          800: "#064c85",
          900: "#0b3f6e",
        },
      },
      animation: {
        "fade-up":    "fadeUp 0.4s ease forwards",
        "fade-in":    "fadeIn 0.3s ease forwards",
        "dot-bounce": "dotBounce 1.2s infinite",
        "cursor-blink": "cursorBlink 0.8s step-end infinite",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        dotBounce: {
          "0%, 80%, 100%": { transform: "translateY(0)" },
          "40%":            { transform: "translateY(-6px)" },
        },
        cursorBlink: {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
