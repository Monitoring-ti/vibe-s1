import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // ── Material 3 — Primary (deep orange) ──
        primary: {
          DEFAULT: "#b02f00",
          container: "#ff5722",
          on: "#ffffff",
          "on-container": "#541200",
        },
        // ── Material 3 — Secondary (amber) ──
        secondary: {
          DEFAULT: "#875200",
          container: "#f89c00",
          on: "#ffffff",
          "on-container": "#623a00",
        },
        // ── Material 3 — Tertiary (green) ──
        tertiary: {
          DEFAULT: "#006c49",
          container: "#00a572",
          on: "#ffffff",
          "on-container": "#00311f",
        },
        // ── Material 3 — Surfaces ──
        "surface": "#faf8ff",
        "surface-dim": "#d2d9f4",
        "surface-bright": "#faf8ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f2f3ff",
        "surface-container": "#eaedff",
        "surface-container-high": "#e2e7ff",
        "surface-container-highest": "#dae2fd",
        // ── On-surface ──
        "on-surface": "#131b2e",
        "on-surface-variant": "#5b4039",
        "on-background": "#131b2e",
        // ── Outline ──
        "outline": "#907067",
        "outline-variant": "#e4beb4",
        // ── Error ──
        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error": "#ffffff",
        "on-error-container": "#93000a",
        // ── Background ──
        "background": "#faf8ff",
        // ── Semantic aliases for shadcn ──
        "border": "#e4beb4",
        "input": "#907067",
        "ring": "#ff5722",
        "foreground": "#131b2e",
        "destructive": {
          DEFAULT: "#ba1a1a",
          foreground: "#ffffff",
        },
        "muted": {
          DEFAULT: "#eaedff",
          foreground: "#5b4039",
        },
        "accent": {
          DEFAULT: "#f89c00",
          foreground: "#131b2e",
        },
        "popover": {
          DEFAULT: "#ffffff",
          foreground: "#131b2e",
        },
        "card": {
          DEFAULT: "#ffffff",
          foreground: "#131b2e",
        },
      },
      borderRadius: {
        lg: "1rem",
        md: "0.75rem",
        sm: "0.5rem",
        xl: "1.5rem",
        "2xl": "2rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        heading: ['"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"],
        mono: ["monospace"],
      },
      fontSize: {
        "display-lg": ["3.5rem", { lineHeight: "1.1", fontWeight: "700" }],
        "display-md": ["2.75rem", { lineHeight: "1.15", fontWeight: "700" }],
        "display-sm": ["2.25rem", { lineHeight: "1.2", fontWeight: "700" }],
        "headline-lg": ["2rem", { lineHeight: "1.25", fontWeight: "700" }],
        "headline-md": ["1.75rem", { lineHeight: "1.3", fontWeight: "600" }],
        "headline-sm": ["1.5rem", { lineHeight: "1.35", fontWeight: "600" }],
        "title-lg": ["1.25rem", { lineHeight: "1.4", fontWeight: "600" }],
        "title-md": ["1.125rem", { lineHeight: "1.45", fontWeight: "600" }],
        "title-sm": ["1rem", { lineHeight: "1.5", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        "body-md": ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.55" }],
        "label-lg": ["0.875rem", { lineHeight: "1.4", fontWeight: "500" }],
        "label-md": ["0.75rem", { lineHeight: "1.4", fontWeight: "500" }],
        "label-sm": ["0.6875rem", { lineHeight: "1.2", fontWeight: "600" }],
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(135deg, #FF5722 0%, #FFA000 100%)",
        "vibe-gradient": "linear-gradient(135deg, #FF5722 0%, #FFA000 100%)",
      },
      boxShadow: {
        "elevation-1": "0 1px 2px 0 rgba(19,27,46,0.06), 0 1px 3px 1px rgba(19,27,46,0.04)",
        "elevation-2": "0 1px 2px 0 rgba(19,27,46,0.08), 0 2px 6px 2px rgba(19,27,46,0.06)",
        "elevation-3": "0 4px 8px 3px rgba(19,27,46,0.08), 0 1px 3px 0 rgba(19,27,46,0.06)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { transform: "translateY(10px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        "pulse-glow": {
          "0%": { boxShadow: "0 0 0 0 rgba(255, 87, 34, 0.4)" },
          "70%": { boxShadow: "0 0 0 8px rgba(255, 87, 34, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255, 87, 34, 0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "pulse-glow": "pulse-glow 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
