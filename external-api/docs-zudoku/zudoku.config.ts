import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  site: {
    title: "SIGAP External API Docs",
    logo: {
      src: { light: "/favicon.png", dark: "/favicon.png" },
      alt: "SIGAP",
      width: "28px",
    },
    showPoweredBy: false,
    sidebar: {
      collapsible: true,
      toggleVisibility: "always",
      togglePosition: "top",
    },
  },
  metadata: {
    title: "%s",
    defaultTitle: "SIGAP External API Docs",
    favicon: "/favicon.png",
  },
  basePath: "/docs",
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
      },
      // Sidebar: hapus fade mask di tepi atas/bawah nav agar item pertama
      // tidak tampak transparan saat sidebar pendek (tidak scroll).
      'nav[class*="side-nav-width"]': {
        "mask-image": "none !important",
        "-webkit-mask-image": "none !important",
      },
      // Tombol minimize sidebar tetap di posisi atas (native togglePosition: top).
      "[data-sidebar-toggle='true']": {
        "--sidebar-toggle-y": "36px !important",
        top: "var(--sidebar-toggle-y)",
        "z-index": "40",
      },
      // Header: logo + judul "SIGAP External API Docs" di sebelahnya.
      "header a.shrink-0": {
        display: "flex",
        "align-items": "center",
      },
      "header a.shrink-0::after": {
        content: '"SIGAP External API Docs"',
        "margin-left": "0.6rem",
        "font-size": "0.95rem",
        "font-weight": "600",
        "white-space": "nowrap",
        color: "var(--color-foreground)",
      },
      // Fix scroll dropdown pada modal test (playground):
      // - Radix Select / Menu
      // - cmdk (Command) list pada kolom Name/Value header request
      "[data-radix-select-content]": {
        "max-height": "320px !important",
        "overflow-y": "auto !important",
        "scrollbar-width": "thin !important",
      },
      "[data-radix-menu-content]": {
        "max-height": "320px !important",
        "overflow-y": "auto !important",
      },
      "[cmdk-list]": {
        "max-height": "320px !important",
        "overflow-y": "auto !important",
        "scrollbar-width": "thin !important",
      },
      "[role='listbox']": {
        "max-height": "320px !important",
        "overflow-y": "auto !important",
      },
      "[role='combobox']": {
        cursor: "pointer",
      },
      "@media (max-width: 1024px)": {
        ":root": {
          "--side-nav-width": "260px !important",
        },
        // Judul di header disembunyikan di layar kecil agar tidak penuh.
        "header a.shrink-0::after": {
          display: "none",
        },
        "[data-sidebar-toggle='true']": {
          "--sidebar-toggle-y": "60px",
        },
      },
    },
  },
};

export default config;
