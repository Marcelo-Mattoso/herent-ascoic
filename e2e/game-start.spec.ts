import { expect, test } from "@playwright/test";

test("uma nova partida exige a escolha de herói antes de iniciar", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Nova partida" }).click();

	await expect(
		page.getByRole("heading", { name: "Preparar Expedição" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Iniciar partida" }),
	).toBeDisabled();

	await page.locator(".setup-hero-select-button").first().click();
	await expect(
		page.getByRole("button", { name: "Iniciar partida" }),
	).toBeEnabled();
});

test("uma partida iniciada chega ao tabuleiro de exploração", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Nova partida" }).click();
	await page.locator(".setup-hero-select-button").first().click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();

	await expect(page.locator(".game-board-root")).toBeVisible({
		timeout: 10_000,
	});
});
