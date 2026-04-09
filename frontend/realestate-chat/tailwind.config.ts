import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas:  "#0B0F1A",
        surface: "#0D1117",
        panel:   "#111827",
        accent:  "#3B82F6",
        "accent-dim": "#2563EB",
        "accent-glow": "rgba(59,130,246,0.25)",
        border:  "rgba(255,255,255,0.08)",
        "border-bright": "rgba(255,255,255,0.15)",
        "text-1": "#F1F5F9",
        "text-2": "#94A3B8",
        "text-3": "#475569",
      },
      animation: {
        "slide-up":    "slideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "fade-in":     "fadeIn 0.35s ease forwards",
        "fade-in-card":"fadeInCard 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "dot-bounce":  "dotBounce 1.4s ease-in-out infinite",
        "glow-pulse":  "glowPulse 2s ease-in-out infinite",
        "shimmer":     "shimmer 1.6s linear infinite",
        "spin-slow":   "spin 1s linear infinite",
      },
      keyframes: {
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInCard: {
          "0%":   { opacity: "0", transform: "translateY(10px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        dotBounce: {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "40%":           { transform: "translateY(-6px)", opacity: "1" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 12px rgba(59,130,246,0.15)" },
          "50%":      { boxShadow: "0 0 24px rgba(59,130,246,0.35)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      backdropBlur: {
        xs: "4px",
      },
      boxShadow: {
        "glow-sm":  "0 0 12px rgba(59,130,246,0.20)",
        "glow-md":  "0 0 24px rgba(59,130,246,0.30)",
        "glow-lg":  "0 0 40px rgba(59,130,246,0.40)",
        "card":     "0 4px 24px rgba(0,0,0,0.40), 0 1px 0 rgba(255,255,255,0.05) inset",
      },
    },
  },
  plugins: [],
};

export default config;
