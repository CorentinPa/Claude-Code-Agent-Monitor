/**
 * @file tailwind.config.js
 * @description Tailwind CSS configuration — content globs and the dashboard's dark-theme design tokens.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

// Colors backed by CSS variables need this factory (not a plain `var(--x)`
// string) so Tailwind's opacity modifiers (e.g. bg-accent/15) can generate
// rgb(var(--x) / <alpha>) — the underlying variable stores an "R G B" channel
// triple, not a hex string, to make that possible.
function withOpacityValue(variable) {
  return ({ opacityValue }) =>
    opacityValue === undefined
      ? `rgb(var(${variable}))`
      : `rgb(var(${variable}) / ${opacityValue})`;
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gray: {
          50: withOpacityValue("--gray-50"),
          100: withOpacityValue("--gray-100"),
          200: withOpacityValue("--gray-200"),
          300: withOpacityValue("--gray-300"),
          400: withOpacityValue("--gray-400"),
          500: withOpacityValue("--gray-500"),
          600: withOpacityValue("--gray-600"),
          700: withOpacityValue("--gray-700"),
          800: withOpacityValue("--gray-800"),
          900: withOpacityValue("--gray-900"),
          950: withOpacityValue("--gray-950"),
        },
        surface: {
          0: withOpacityValue("--surface-0"),
          1: withOpacityValue("--surface-1"),
          2: withOpacityValue("--surface-2"),
          3: withOpacityValue("--surface-3"),
          4: withOpacityValue("--surface-4"),
          5: withOpacityValue("--surface-5"),
        },
        border: {
          DEFAULT: withOpacityValue("--border"),
          light: withOpacityValue("--border-light"),
        },
        accent: {
          DEFAULT: withOpacityValue("--accent"),
          hover: withOpacityValue("--accent-hover"),
          muted: "var(--accent-muted)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
