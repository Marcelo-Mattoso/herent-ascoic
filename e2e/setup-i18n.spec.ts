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
