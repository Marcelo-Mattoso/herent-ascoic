import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openCombat(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	await page
		.locator(".tutorial-hub__module")
		.nth(1)
		.getByRole("button")
		.click();
	await expect(
		page.locator('[data-tutorial-step="combat-opening"]'),
	).toBeVisible();
	await expect(page.locator(".game-board-root")).toBeVisible();
}

async function reachFirstAttack(page: Page) {
	await openCombat(page);
	await page.getByRole("button", { name: "Continuar" }).click();
	for (let index = 0; index < 4; index++) {
		await expect(page.locator(".tutorial-spotlight")).toBeVisible();
		await page
			.getByRole("button", { name: index < 3 ? "Próximo ponto" : "Continuar" })
			.click();
	}
	await expect(
		page.locator('[data-tutorial-step="combat-select-hero"]'),
	).toBeVisible();
	await page.locator('[data-tutorial-anchor="combat.hero"] .game-card').click();
	await expect(
		page.locator('[data-tutorial-step="combat-select-target"]'),
	).toBeVisible();
	await page.locator('[data-tutorial-anchor="combat.enemy"]').click();
	await expect(page.locator(".game-dice-roll-modal")).toBeVisible();
	await page.locator(".game-dice-roll-action").click({ timeout: 20_000 });
	await expect(page.locator('[data-tutorial-step="combat-drag"]')).toBeVisible({
		timeout: 10_000,
	});
	// O checkpoint final usa a contingência determinística para manter este teste de tutorial reproduzível.
	await page.emulateMedia({ reducedMotion: "reduce" });
}

test("Arquivo II: seleção, drag real, dados do Diário e conclusão", async ({
	page,
}) => {
	await reachFirstAttack(page);
	await expect(page.locator(".tutorial-spotlight")).toHaveCount(2);
	await page
		.locator('[data-tutorial-anchor="combat.hero"] .game-card')
		.dragTo(page.locator('[data-tutorial-anchor="combat.enemy"]'));
	await expect(
		page.locator('[data-tutorial-step="combat-dice"]'),
	).toBeVisible();
	await expect(page.locator(".game-dice-roll-modal")).toBeVisible();
	await expect(
		page.getByRole("region", { name: "Resultado real da rolagem" }),
	).toBeVisible();
	await page.screenshot({
		path: "test-results/tutorial-combat-dice-desktop.png",
	});
	await page.locator(".game-dice-roll-action").click({ timeout: 10_000 });
	await expect(
		page.locator('[data-tutorial-step="combat-result"]'),
	).toBeVisible({ timeout: 10_000 });
	await expect(
		page.getByRole("region", { name: "Resultado registrado do ataque" }),
	).toContainText("Perda de vida observada:");
	const resultText = await page
		.getByRole("region", { name: "Resultado registrado do ataque" })
		.innerText();
	await page.screenshot({
		path: "test-results/tutorial-combat-result-desktop.png",
	});
	await page.getByRole("button", { name: "Próximo ponto" }).click();
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(
		page.locator('[data-tutorial-step="combat-action"]'),
	).toBeVisible();
	await page.getByRole("button", { name: "Concluir combate" }).click();
	await expect(
		page.locator('[data-tutorial-step="combat-completion"]'),
	).toBeVisible();
	const download = page.waitForEvent("download");
	await page.getByText("Registro do treinamento").click();
	await page.getByRole("button", { name: "Baixar registro e diário" }).click();
	const audit = JSON.parse(
		await readFile(await (await download).path(), "utf8"),
	);
	expect(audit.tutorial.firstAttack.actionId).toBeTruthy();
	expect(audit.tutorial.finalAttack.actionId).toBeTruthy();
	const finalEntry = audit.gameJournal.entries.find(
		(entry: { actionId: string }) =>
			entry.actionId === audit.tutorial.finalAttack.actionId,
	);
	expect(finalEntry.roll).toEqual(audit.tutorial.finalAttack.roll);
	expect(resultText).toContain(`total ${finalEntry.roll.heroTotal}`);
	expect(resultText).toContain(`total ${finalEntry.roll.enemyTotal}`);
	expect(resultText).toContain(
		`${audit.tutorial.finalAttack.enemyLifeBefore} → ${audit.tutorial.finalAttack.enemyLifeAfter}`,
	);
	expect(
		audit.gameJournal.entries.some(
			(entry: { actionType: string }) =>
				entry.actionType === "CHECK_COMBAT_END",
		),
	).toBe(true);
	await page.getByRole("button", { name: "Repetir arquivo" }).click();
	await expect(
		page.locator('[data-tutorial-step="combat-opening"]'),
	).toBeVisible();
});

test("Arquivo II: toque no celular e cinco tamanhos de tela", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await context.newPage();
	await reachFirstAttack(page);
	await expect(
		page.locator('[data-tutorial-step="combat-drag"]'),
	).toContainText("Toque no herói");
	await page.locator('[data-tutorial-anchor="combat.hero"] .game-card').tap();
	await expect(
		page.locator('[data-tutorial-anchor="combat.enemy"]'),
	).toHaveClass(/click-attention/);
	await page.locator('[data-tutorial-anchor="combat.enemy"]').tap();
	await expect(
		page.locator('[data-tutorial-step="combat-dice"]'),
	).toBeVisible();
	await expect(page.locator(".game-dice-roll-modal")).toBeVisible();
	await expect(
		page.getByRole("region", { name: "Resultado real da rolagem" }),
	).toBeVisible();
	for (const viewport of [
		{ width: 360, height: 800 },
		{ width: 390, height: 844 },
		{ width: 844, height: 390 },
		{ width: 768, height: 1024 },
		{ width: 1366, height: 768 },
	]) {
		await page.setViewportSize(viewport);
		await expect(page.locator(".tutorial-panel")).toBeVisible();
		const panel = await page.locator(".tutorial-panel").boundingBox();
		expect(panel).not.toBeNull();
		expect(panel!.x).toBeGreaterThanOrEqual(0);
		expect(panel!.y).toBeGreaterThanOrEqual(0);
		expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width + 1);
		expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height + 1);
		await page.screenshot({
			path: `test-results/tutorial-combat-${viewport.width}x${viewport.height}.png`,
		});
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await page.locator(".game-dice-roll-action").tap({ timeout: 10_000 });
	await expect(
		page.locator('[data-tutorial-step="combat-result"]'),
	).toBeVisible();
	await page.getByRole("button", { name: "Próximo ponto" }).tap();
	await page.getByRole("button", { name: "Continuar" }).tap();
	await page.getByRole("button", { name: "Concluir combate" }).tap();
	await expect(
		page.locator('[data-tutorial-step="combat-completion"]'),
	).toBeVisible();
	await context.close();
});

test("Arquivo I continua no Arquivo II sem recarregar a página", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	await page
		.locator(".tutorial-hub__module")
		.first()
		.getByRole("button")
		.click();
	await page.getByRole("button", { name: "Continuar" }).click();
	await page.locator(".setup-hero-select-button").first().click();
	await page.getByRole("button", { name: "Continuar" }).click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();
	await page.getByRole("button", { name: "Pular observação" }).click();
	await page.getByRole("button", { name: "Revelar sala" }).click();
	await expect(page.locator('[data-tutorial-step="encounter"]')).toBeVisible();
	await page.getByRole("button", { name: "Pular observação" }).click();
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(page.locator('[data-tutorial-step="completion"]')).toBeVisible();
	await page.evaluate(
		() =>
			((
				window as Window & { tutorialNavigationMarker?: boolean }
			).tutorialNavigationMarker = true),
	);
	await page
		.getByRole("button", { name: /Próximo arquivo — Arquivo II/ })
		.click();
	await expect(
		page.locator('[data-tutorial-step="combat-opening"]'),
	).toBeVisible();
	await expect(page.locator(".game-board-root")).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as Window & { tutorialNavigationMarker?: boolean })
						.tutorialNavigationMarker,
			),
		)
		.toBe(true);
});
