import { defineConfig } from "vitest/config";

// フェーズ 1 は設定のみとし、実機能のテストはフェーズ 2 で追加する。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
