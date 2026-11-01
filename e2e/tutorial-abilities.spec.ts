import { expect, test, type Page } from "@playwright/test";

async function openAbilities(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	await expect(page.locator(".tutorial-hub__module")).toHaveCount(4);
	await page.locator(".tutorial-hub__module").nth(3).getByRole("button", { name: "Iniciar arquivo" }).click();
	await expect(page.locator('[data-tutorial-step="abilities-opening"]')).toBeVisible();
	await page.getByRole("button", { name: "Continuar" }).click();
}

async function openHeroPanel(page: Page) {
	const hero = page.locator('[data-tutorial-anchor="combat.hero"] .game-card');
	await hero.click();
	await hero.click();
}

async function completeAbilities(page: Page, viewportName: string) {
	await openAbilities(page);
	await expect(page.locator('[data-tutorial-step="abilities-inspect"]')).toBeVisible();
	await openHeroPanel(page);
	await page.locator('[data-tutorial-anchor="hero.portrait"]').click();
	await expect(page.locator(".hero-art-viewer")).toBeVisible();
	await expect(page.locator('[data-tutorial-step="prey-mark"]')).toBeVisible();
	await page.getByRole("dialog", { name: "Ravik Dorn" }).getByRole("button", { name: "Fechar arte" }).last().click();
	await page.locator('[data-tutorial-anchor="hero.skill-action"]').click();
	await expect(page.locator(".skill-target-option")).toHaveCount(2);
	await page.locator(".skill-target-option").first().click();
	await expect(page.locator('[data-tutorial-step="hunter-attack"]')).toBeVisible();
	await page.locator('[data-tutorial-anchor="combat.enemy"]').first().click();
	await page.locator(".game-dice-roll-action").click();
	await expect(page.locator('[data-tutorial-step="fury-prepare"]')).toBeVisible();
	await openHeroPanel(page);
	await page.locator('[data-tutorial-anchor="hero.skill-action"]').click();
	await expect(page.locator('[data-tutorial-step="fury-trigger"]')).toBeVisible();
	await page.locator('[data-tutorial-anchor="combat.enemy"]').first().click();
	await expect(page.locator(".flow-modal-overlay")).toHaveCount(0);
	await page.locator(".game-dice-roll-action").click();
	await expect(page.locator('[data-tutorial-step="hero-power"]')).toBeVisible();
	await openHeroPanel(page);
	await page.locator('[data-tutorial-anchor="hero.power-action"]').click();
	await expect(page.locator('[data-tutorial-step="passive-effect"]')).toBeVisible();
	await expect(page.getByRole("status", { name: "Estado real das habilidades" })).toContainText("Encanto da Chama Baixa");
	await page.screenshot({ path: `test-results/tutorial-abilities-passive-${viewportName}.png` });
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(page.locator('[data-tutorial-step="ability-limits"]')).toBeVisible();
	await expect(page.getByRole("status", { name: "Estado real das habilidades" })).toContainText("limite atingido");
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(page.locator('[data-tutorial-step="abilities-completion"]')).toBeVisible();
	await page.screenshot({ path: `test-results/tutorial-abilities-completion-${viewportName}.png` });
	await page.getByRole("button", { name: "Jogar agora" }).click();
	await expect(page.getByRole("heading", { name: "Preparar Expedição" })).toBeVisible();
	await expect(page.locator('[data-tutorial-step]')).toHaveCount(0);
	await page.locator(".setup-hero-select-button").first().click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();
	await expect(page.locator(".story-opening")).toBeVisible();
	await page.getByRole("button", { name: "Pular abertura" }).click();
	await expect(page.locator(".game-board-root")).toBeVisible();
	await expect(page.locator(".game-influence-panel")).not.toContainText("Encanto da Chama Baixa");
}

test("Arquivo IV: Marca, ataque, Fúria, poder, passivo e nova partida", async ({ page }) => {
	test.setTimeout(90_000);
	await completeAbilities(page, "desktop");
});

test("Arquivo IV completo por toque no celular", async ({ page }) => {
	test.setTimeout(90_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await completeAbilities(page, "mobile");
});

test("Arquivo IV: entrada e spotlight nas cinco geometrias", async ({ page }) => {
	for (const viewport of [
		{ width: 360, height: 800 }, { width: 390, height: 844 },
		{ width: 844, height: 390 }, { width: 768, height: 1024 },
		{ width: 1366, height: 768 },
	]) {
		await page.setViewportSize(viewport);
		await openAbilities(page);
		await expect(page.locator(".tutorial-spotlight").first()).toBeVisible();
		await page.screenshot({ path: `test-results/tutorial-abilities-${viewport.width}x${viewport.height}.png` });
		await page.getByRole("button", { name: "Sair do tutorial" }).click();
	}
});
