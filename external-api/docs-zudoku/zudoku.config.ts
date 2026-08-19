import type { ZudokuConfig } from "zudoku";

const config: ZudokuConfig = {
  site: {
    title: "SIGAP External API Docs",
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
};

export default config;
