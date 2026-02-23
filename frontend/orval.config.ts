import { defineConfig } from "orval";

export default defineConfig({
  lumoApi: {
    input: {
      target: "./openapi.json",
    },
    output: {
      target: "./src/generated/endpoints.ts",
      client: "react-query",
      mode: "split",
      prettier: true,
    },
  },
});
