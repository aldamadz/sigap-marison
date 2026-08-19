import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  site: {
    title: "SIGAP External API Docs",
    logo: {
      src: { light: "/logo.png", dark: "/logo.png" },
      alt: "SIGAP External API",
      width: "32px",
    },
  },
  basePath: "/docs",
  navigation: [
    {
      type: "link",
      to: "/api",
      label: "API Reference",
    },
  ],
  redirects: [{ from: "/", to: "/api" }],
  apis: [
    {
      type: "file",
      input: "./apis/openapi.json",
      path: "/api",
    },
  ],
  defaults: {
    apis: {
      playgroundConfig: {
        enabled: true,
      },
    },
  },
  theme: {
    customCss: {
      ":root": {
        "--side-nav-width": "300px !important",
        "--padding-content-top": "1.5rem",
      },
      "[data-sidebar-toggle='true']": {
        "--sidebar-toggle-y": "36px !important",
        top: "var(--sidebar-toggle-y)",
        "z-index": "40",
      },
      "[data-radix-select-content]": {
        "max-height": "320px !important",
        "overflow-y": "auto !important",
        "scrollbar-width": "thin !important",
      },
      "[data-radix-menu-content]": {
        "max-height": "320px !important",
        "overflow-y": "auto !important",
      },
      "[role='listbox']": {
        "max-height": "320px !important",
        "overflow-y": "auto !important",
      },
      "[role='combobox']": {
        cursor: "pointer",
      },
      "header img": {
        "display": "inline-block",
        "vertical-align": "middle",
        "margin-right": "8px",
      },
      "@media (max-width: 1024px)": {
        ":root": {
          "--side-nav-width": "260px !important",
        },
        "[data-sidebar-toggle='true']": {
          "--sidebar-toggle-y": "60px",
        },
      },
    },
  },
};

export default config;
