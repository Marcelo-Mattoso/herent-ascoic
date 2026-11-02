import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	root: path.resolve(__dirname, "../.."),
	test: {
		environment: "node",
		include: ["tools/engine-test/**/*.test.ts"],
		exclude: ["**/node_modules/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			reportsDirectory: "coverage/engine-test",
			include: ["src/engine/**/*.ts"],
			exclude: ["src/engine/**/*.test.ts", "src/engine/index.ts"],
			thresholds: { lines: 85 },
		},
	},
});
