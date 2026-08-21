import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  site: {
    title: "SIGAP External API Docs",
    logo: {
      src: { light: "/favicon.png", dark: "/favicon.png" },
      alt: "SIGAP",
      width: "28px",
      href: "/api",
      reloadDocument: true,
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
      // Layout: hilangkan centering max-w-screen-2xl (1536px) agar sidebar
      // dan logo menempel tepi kiri viewport — tanpa space kosong di kiri
      // saat layar lebih lebar dari 1536px.
      ".max-w-screen-2xl": {
        "max-width": "none !important",
      },
      // Sejajarkan header dengan ruang baca konten tanpa membuatnya mepet viewport.
      "header .max-w-screen-2xl": {
        "padding-left": "1.5rem !important",
        "padding-right": "1.5rem !important",
      },
      // Ruang baca seimbang untuk judul, schema, dan contoh request.
      main: {
        "padding-left": "1.5rem !important",
        "padding-right": "1.5rem !important",
      },
      // Sidebar: hapus fade mask di tepi atas/bawah nav agar item pertama
      // tidak tampak transparan saat sidebar pendek (tidak scroll), dan
      // kurangi padding kiri (default lg:ps-8 = 32px) agar item lebih dekat
      // ke tepi.
      'nav[class*="side-nav-width"]': {
        "mask-image": "none !important",
        "-webkit-mask-image": "none !important",
        "padding-left": "1.25rem !important",
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
        "header .max-w-screen-2xl": {
          "padding-left": "1.25rem !important",
          "padding-right": "1.25rem !important",
        },
        main: {
          "padding-left": "1.25rem !important",
          "padding-right": "1.25rem !important",
        },
        // Hamburger header bawaan membuka global navigation yang kosong.
        // Gunakan tombol API sidebar yang fungsional sebagai hamburger tunggal.
        "header button[aria-label='Open navigation menu']": {
          display: "none !important",
        },
        "#root > .grid > .lg\\:hidden.sticky.border-b": {
          position: "fixed !important",
          inset: "1rem 1.25rem auto auto !important",
          width: "32px !important",
          height: "32px !important",
          padding: "0 !important",
          border: "0 !important",
          background: "transparent !important",
          "backdrop-filter": "none !important",
          "z-index": "60 !important",
        },
        "#root > .grid > .lg\\:hidden.sticky.border-b > button": {
          position: "relative !important",
          width: "32px !important",
          height: "32px !important",
          padding: "0 !important",
          background:
            "linear-gradient(currentColor, currentColor) center / 22px 2px no-repeat !important",
        },
        "#root > .grid > .lg\\:hidden.sticky.border-b > button > svg, #root > .grid > .lg\\:hidden.sticky.border-b > button > span": {
          display: "none !important",
        },
        "#root > .grid > .lg\\:hidden.sticky.border-b > button::before, #root > .grid > .lg\\:hidden.sticky.border-b > button::after": {
          content: '""',
          position: "absolute",
          left: "5px",
          width: "22px",
          height: "2px",
          background: "currentColor",
        },
        "#root > .grid > .lg\\:hidden.sticky.border-b > button::before": {
          top: "8px",
        },
        "#root > .grid > .lg\\:hidden.sticky.border-b > button::after": {
          bottom: "8px",
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
