import { expect, test } from "@playwright/test";

for (const viewport of [
	{ name: "desktop", width: 1366, height: 768 },
	{ name: "phone", width: 390, height: 844 },
]) {
	test(`diário mostra estado e exporta JSON em ${viewport.name}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page.getByRole("button", { name: "JOGAR" }).click();
		await page.locator(".setup-hero-select-button").first().click();
		await page.getByRole("button", { name: "Iniciar partida" }).click();
		await expect(page.locator(".game-board-root")).toBeVisible();
		await page
			.getByRole("button", { name: /Diário/ })
			.first()
			.click();
		const journal = page.getByRole("dialog", { name: "Diário da partida" });
		await expect(journal).toBeVisible();
		await journal.getByRole("button", { name: "Estado atual" }).click();
		await expect(
			journal.getByRole("heading", { name: "Heróis" }),
		).toBeVisible();
		await expect(
			journal.getByRole("heading", { name: "Baralhos" }),
		).toBeVisible();
		const downloadPromise = page.waitForEvent("download");
		await journal.getByRole("button", { name: "Exportar JSON" }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/^diario-.*\.json$/);
		await journal.getByRole("button", { name: "Fechar diário" }).click();
		await expect(journal).toBeHidden();
		await expect(page.locator(".game-board-root")).toBeVisible();
	});
}
