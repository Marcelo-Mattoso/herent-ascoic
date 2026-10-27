import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://127.0.0.1:4174",
		locale: "pt-BR",
		trace: "on-first-retry",
	},
	webServer: {
		// CI must test the built app: dev-mode generated files may be missing in a fresh runner.
		command: process.env.CI
			? "npx vite preview --host 127.0.0.1 --port 4174 --strictPort"
			: "npx vite --host 127.0.0.1 --port 4174 --strictPort",
		url: "http://127.0.0.1:4174",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
