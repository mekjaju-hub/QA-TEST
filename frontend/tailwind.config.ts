import type { Config } from "tailwindcss";

// Colors map to the design tokens of the prototype (03_web_app) defined in app/globals.css
const v = (n: string) => `var(--${n})`;
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: v("bg"), panel: v("panel"), ink: v("ink"), "ink-2": v("ink-2"), "ink-3": v("ink-3"), line: v("line"), "line-2": v("line-2"),
        blue: v("blue"), green: v("green"), orange: v("orange"), red: v("red"), purple: v("purple"), gray: v("gray"),
      },
      fontFamily: { sans: ["var(--font)"], mono: ["var(--mono)"] },
    },
  },
  plugins: [],
} satisfies Config;
