import { defineConfig, FileTypes, ruleSelector } from "@michaelhelvey/vite-config";
import solidV2 from "eslint-plugin-solid/configs/v2";

const reactOff = Object.fromEntries(
  Object.keys(ruleSelector(["react"], ["correctness", "perf", "suspicious"])).map((rule) => [
    rule,
    "off" as const,
  ]),
);

export default await defineConfig({
  fmt: {
    ignorePatterns: ["mockups/**", "packages/*/fixtures/**", "apps/desktop/src-tauri/**"],
  },
  lint: {
    rules: {
      complexity: ["error", { max: 4 }],
    },
    overrides: [
      {
        files: FileTypes.JS_SOURCE,
        rules: { "no-console": "off" },
      },
      {
        files: ["apps/desktop/**/*.ts", "apps/desktop/**/*.tsx"],
        jsPlugins: ["eslint-plugin-solid"],
        rules: { ...reactOff, ...solidV2.rules },
      },
    ],
  },
});
