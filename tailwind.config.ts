import type { Config } from "tailwindcss";

// Color values bound to CSS custom properties defined in src/app/globals.css.
// Light + dark mode are handled there via prefers-color-scheme.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--bg)",
          soft: "var(--bg-soft)",
        },
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        rule: {
          DEFAULT: "var(--rule)",
          soft: "var(--rule-soft)",
        },
        warm: {
          DEFAULT: "var(--warm)",
          soft: "var(--warm-soft)",
        },
        cool: {
          DEFAULT: "var(--cool)",
          soft: "var(--cool-soft)",
        },
        gold: "var(--gold)",
        success: "var(--success)",
        error: "var(--error)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "SF Mono", "Menlo", "monospace"],
      },
      spacing: {
        "2xs": "2px",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
      },
      transitionDuration: {
        micro: "100ms",
        short: "240ms",
        medium: "400ms",
      },
      transitionTimingFunction: {
        settle: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
