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
      // Kurangi padding default header (lg:px-8 = 32px) jadi 16px agar logo
      // tidak tampak "maju ke kanan".
      "header .max-w-screen-2xl": {
        "padding-left": "1rem !important",
        "padding-right": "1rem !important",
      },
      // Konten utama: kurangi padding kiri (default lg:px-8 = 32px -> 16px)
      // agar blok konten (judul halaman, deskripsi, kartu endpoint, contoh
      // request) menempel lebih dekat ke tepi kanan sidebar.
      main: {
        "padding-left": "1rem !important",
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
