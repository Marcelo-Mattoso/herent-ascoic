import { expect, test } from "@playwright/test";

test("cartas, versos, tabuleiros e interface são entregues em WebP", async ({ request }) => {
	for (const group of ["cards", "backcards", "boards", "ui"]) {
		const response = await request.get(`/generated/${group}/manifest.json`);
		expect(response.ok()).toBe(true);
		const manifest = await response.json();
		const items = manifest.cards ?? manifest.backCards ?? manifest.boards ?? manifest.assets;
		expect(items.length).toBeGreaterThan(0);
		for (const item of items) {
			expect(item.fileName.endsWith(".webp")).toBe(true);
			expect(item.url.endsWith(".webp")).toBe(true);
		}
		for (const item of [items[0], items.at(-1)]) {
			const result = await request.get(item.url);
			expect(result.ok()).toBe(true);
			const bytes = await result.body();
			expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
			expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
		}
	}
});
