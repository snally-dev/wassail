import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node18",

  dts: {
    oxc: true,
  },
  sourcemap: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
