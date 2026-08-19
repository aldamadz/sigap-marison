import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  site: {
    title: "SIGAP External API Docs",
  },
  base: "/docs",
  navigation: [
    {
      type: "link",
      to: "/api",
      label: "API Reference",
    },
  ],
  redirects: [{ from: "/", to: "/docs/api" }],
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
};

export default config;
