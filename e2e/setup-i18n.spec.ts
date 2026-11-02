import { expect, test } from "@playwright/test";

test("preparação oculta modos e exibe a ficha do herói traduzida", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await page.getByLabel("Idioma da interface").selectOption("en-US");
	await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
	await page.getByRole("button", { name: "Close menu", exact: true }).click();
	await page.getByRole("button", { name: "PLAY", exact: true }).click();

	await expect(page.locator(".setup-segmented-control")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Co-op" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Competitive" })).toHaveCount(0);

	await page.locator(".setup-hero-info-button").first().click();
	const sheet = page.getByRole("dialog");
	await expect(sheet).toContainText("Hero Sheet");
	await expect(sheet.locator(".setup-hero-modal__stat-row")).toContainText([
		"Health", "Hit", "Dice",
	]);
});

test("seleção e ficha exibem nome próprio maior e classe separada", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "JOGAR", exact: true }).click();
	const cleric = page.locator(".setup-hero-select-button").first();
	await expect(cleric.locator(".setup-hero-identity__name")).toHaveText("Letícia Morane");
	await expect(cleric.locator(".setup-hero-identity__class")).toHaveText("Clérigo do Descanso Eterno");
	await page.locator(".setup-hero-info-button").first().click();
	const sheet = page.getByRole("dialog");
	await expect(sheet.getByRole("heading", { name: "Letícia Morane" })).toBeVisible();
	await expect(sheet).toContainText("Clérigo do Descanso Eterno");
});
