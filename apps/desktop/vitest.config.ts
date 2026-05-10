import baseConfig from "../../vitest.config.ts";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ["./src/test/setupElectron.ts"],
    },
  }),
);
