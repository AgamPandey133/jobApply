import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/worker/index.ts"],
  format: ["cjs"],
  outDir: "dist/worker",
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
  tsconfig: "./tsconfig.json",
  esbuildOptions(options) {
    // External packages that should not be bundled
    options.external = [
      "@prisma/client",
      "prisma",
      "playwright",
      "@playwright/test",
      "pdf-parse",
    ];
  },
});
