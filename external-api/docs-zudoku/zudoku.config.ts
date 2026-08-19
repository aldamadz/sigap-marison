import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  site: {
    title: "SIGAP External API Docs",
    logo: {
      src: { light: "/logo.png", dark: "/logo.png" },
      alt: "SIGAP",
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
        "--side-nav-width": "300px",
      },
      '[data-sidebar-toggle="true"]': {
        "--sidebar-toggle-y": "32px !important",
        top: "var(--sidebar-toggle-y)",
        "z-index": "30",
      },
      "[role='listbox']": {
        "max-height": "320px",
        "overflow-y": "auto",
      },
      "[data-radix-select-content]": {
        "max-height": "320px",
        "overflow-y": "auto",
      },
      "[role='dialog'] [role='combobox']": {
        cursor: "pointer",
      },
    },
  },
};

export default config;
