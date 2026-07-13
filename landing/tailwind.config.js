/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        surface: "var(--surface)",
        inset: "var(--inset)",
        hair: "var(--hair)",
        "hair-2": "var(--hair-2)",
        "screen-bg": "var(--screen-bg)",
      },
      boxShadow: {
        device: "var(--shadow)",
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          "system-ui",
          "-apple-system",
          '"Inter"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        display: [
          '"Mackinac"',
          '"Fraunces"',
          "ui-serif",
          "Georgia",
          "Cambria",
          '"Times New Roman"',
          "serif",
        ],
        mono: ["ui-monospace", '"Cascadia Code"', '"SF Mono"', "Menlo", "Consolas", "monospace"],
      },
      maxWidth: {
        page: "1080px",
      },
    },
  },
  plugins: [],
};
