import { expect, test } from "@playwright/test";

test("uma nova partida exige a escolha de herói antes de iniciar", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "JOGAR" }).click();

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
	await page.getByRole("button", { name: "JOGAR" }).click();
	await page.locator(".setup-hero-select-button").first().click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();

	await expect(page.locator(".game-board-root")).toBeVisible({
		timeout: 10_000,
	});
});

test("menu inicial oferece jogar e o PDF de regras em tela pequena", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Ascensão Heróica" })).toBeVisible();
	await expect(page.getByText("A Fornalha Sombria")).toBeVisible();
	await expect(page.getByRole("button", { name: "JOGAR" })).toBeVisible();
	await expect(page.getByRole("link", { name: /Regras/ })).toBeVisible();
	const manual = await page.request.get("/rules/ascensao-heroica-manual.pdf");
	expect(manual.ok()).toBe(true);
	expect((await manual.body()).subarray(0, 4).toString()).toBe("%PDF");
});
