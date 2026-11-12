import { expect, test } from "@playwright/test";

test("cartas de expansão em PNG/WebP e demais recursos em WebP têm formatos válidos", async ({ request }) => {
	const bossManifestResponse = await request.get("/generated/cards/manifest.json");
	expect(bossManifestResponse.ok()).toBe(true);
	const bossManifest = await bossManifestResponse.json();
	expect(bossManifest.cards.some((entry: { id: string }) => entry.id === "boss_azhakar")).toBe(true);
	for (const group of ["cards", "backcards", "boards", "ui"]) {
		const response = await request.get(`/generated/${group}/manifest.json`);
		expect(response.ok()).toBe(true);
		const manifest = await response.json();
		const items = manifest.cards ?? manifest.backCards ?? manifest.boards ?? manifest.assets;
		expect(items.length).toBeGreaterThan(0);
		for (const item of items) {
			const ext = item.fileName.endsWith(".png") ? ".png" : ".webp";
			expect(group === "cards" || ext === ".webp", item.fileName).toBe(true);
			expect(item.fileName.endsWith(ext), item.fileName).toBe(true);
			expect(item.url.endsWith(ext), item.url).toBe(true);
		}
		// Validate every expansion PNG, plus first and last entries of each group.
		const inspected = new Map(
			[items[0], items.at(-1), ...items.filter((item: { fileName: string }) => item.fileName.endsWith(".png"))]
				.filter(Boolean)
				.map((item: { url: string; fileName: string }) => [item.url, item]),
		);
		for (const item of inspected.values()) {
			const result = await request.get(item.url);
			expect(result.ok(), item.url).toBe(true);
			const bytes = await result.body();
			if (item.fileName.endsWith(".png")) {
				expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
			} else {
				expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
				expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
			}
		}
	}
});
