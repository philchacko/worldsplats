/** @type {import('tailwindcss').Config} */

import colors from "tailwindcss/colors";
import defaultTheme from "tailwindcss/defaultTheme";
import plugin from "tailwindcss/plugin";

module.exports = {
  content: [
    "./primitives/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./layouts/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./icons/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        "sans-medium": ["Avenir-Medium", ...defaultTheme.fontFamily.sans],
        "sans-heavy": ["Avenir-Heavy", ...defaultTheme.fontFamily.sans],
        "sans-black": ["Avenir-Black", ...defaultTheme.fontFamily.sans],
      },
      fontSize: {
        heading: ["24px", "36px"],
      },
      colors: {
        gray: colors.neutral,
      },
      transitionProperty: {
        "max-height": "max-height",
        "padding": "padding"
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      const actions = {
        ".action-normal": {
          "background-color": "var(--action-normal)",
        },
      };

      const backgrounds = {
        ".bg-root": {
          "background-color": "var(--background-root)",
        },
        ".bg-root-inverted": {
          "background-color": "var(--background-root-inverted)",
        },
        ".bg-elevated": {
          "background-color": "var(--background-elevated)",
        },
        ".bg-action-primary": {
          "background-color": "var(--background-action-primary)",
        },
        ".bg-action-primary-hover": {
          "background-color": "var(--background-action-primary-hover)",
        },
        ".bg-action-primary-active": {
          "background-color": "var(--background-action-primary-active)",
        },
        ".bg-action-transparent": {
          "background-color": "var(--background-action-transparent)",
        },
        ".bg-action-primary-disabled": {
          "background-color": "var(--background-action-primary-disabled)",
        },
        ".bg-action-hover": {
          "background-color": "var(--background-action-hover)",
        },
        ".bg-action-active": {
          "background-color": "var(--background-action-active)",
        },
        ".bg-transparent": {
          "background-color": "transparent",
        },
      };

      const text = {
        ".text-primary": {
          color: "var(--text-primary)",
        },
        ".text-secondary": {
          color: "var(--text-secondary)",
        },
        ".text-tertiary": {
          color: "var(--text-tertiary)",
        },
        ".text-inverted-primary": {
          color: "var(--text-inverted-primary)",
        },
        ".text-inverted-secondary": {
          color: "var(--text-inverted-secondary)",
        },
        ".text-sm": {
          "font-size": "var(--size-sm)",
        },
        ".text-md": {
          "font-size": "var(--size-md)",
        },
      };

      const strokesAndFills = {
        ".stroke-primary": {
          stroke: "var(--stroke-primary)",
        },
        ".stroke-secondary": {
          stroke: "var(--stroke-secondary)",
        },
        ".stroke-tertiary": {
          stroke: "var(--stroke-tertiary)",
        },
        ".stroke-suggestion": {
          stroke: "var(--stroke-suggestion)",
        },
        ".stroke-inverted-primary": {
          stroke: "var(--stroke-inverted-primary)",
        },
        ".stroke-error-primary": {
          stroke: "var(--stroke-error-primary)",
        },
        ".stroke-success-primary": {
          stroke: "var(--stroke-success-primary)",
        },
        ".fill-root": {
          fill: "var(--fill-root)",
        },
        ".fill-primary": {
          fill: "var(--fill-primary)",
        },
        ".fill-secondary": {
          fill: "var(--fill-secondary)",
        },
        ".fill-tertiary": {
          fill: "var(--fill-tertiary)",
        },
        ".fill-switch-off": {
          fill: "var(--fill-switch-off)",
        },
        ".fill-switch-on": {
          fill: "var(--fill-switch-on)",
        },
        ".fill-inverted-primary": {
          fill: "var(--fill-inverted-primary)",
        },
        ".fill-inverted-secondary": {
          fill: "var(--fill-inverted-secondary)",
        },
        ".fill-error-primary": {
          fill: "var(--fill-error-primary)",
        },
        ".fill-success-primary": {
          fill: "var(--fill-success-primary)",
        },
      };

      const bordersAndOutlines = {
        ".border-normal": {
          "border-color": "var(--border-normal)",
        },
        ".border-highlighted": {
          "border-color": "var(--border-highlighted)",
        },
        ".border-action": {
          "border-color": "var(--text-secondary)", 
        },
        ".border-error": {
          "border-color": "var(--border-error)",
        },
        ".border-elevated": {
          "border-color": "var(--border-elevated)",
        }
      };

      addUtilities({
        ...actions,
        ...backgrounds,
        ...text,
        ...strokesAndFills,
        ...bordersAndOutlines,
      });
    }),
  ],
}