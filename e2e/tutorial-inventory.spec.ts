import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openInventoryArchive(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	await page
		.locator(".tutorial-hub__module")
		.nth(2)
		.getByRole("button")
		.click();
	await expect(
		page.locator('[data-tutorial-step="items-opening"]'),
	).toBeVisible();
	await expect(page.locator(".game-board-root")).toBeVisible();
	await page.getByRole("button", { name: "Continuar" }).click();
	await page
		.locator('[data-tutorial-anchor="board.heroes"] .game-card')
		.first()
		.click();
	await page.getByRole("button", { name: "Abrir inventário" }).click();
	await expect(
		page.locator('[data-tutorial-step="inventory-slots"]'),
	).toBeVisible();
	await expect(
		page.getByRole("dialog", { name: "Inventário do grupo" }),
	).toBeVisible();
}

async function showBackpack(page: Page) {
	const button = page
		.locator('[data-tutorial-anchor="hero.backpack"] button')
		.first();
	if ((await button.getAttribute("aria-expanded")) !== "true")
		await button.click();
}

async function completeInventoryArchive(page: Page) {
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: i < 3 ? "Próximo ponto" : "Continuar" })
			.click();
	await expect(
		page.locator('[data-tutorial-step="item-inspect"]'),
	).toBeVisible();
	await showBackpack(page);
	await page
		.getByRole("button", { name: /Detalhes de Adaga Enferrujada/ })
		.click();
	await expect(
		page.getByRole("dialog", { name: /Adaga Enferrujada/ }),
	).toBeVisible();
	await page.locator(".modal-close").click();
	await expect(
		page.locator('[data-tutorial-step="equip-dagger"]'),
	).toBeVisible();
	await showBackpack(page);
	await page
		.locator(".inventory-backpack-item")
		.filter({ hasText: "Adaga Enferrujada" })
		.getByRole("button", { name: "Equipar" })
		.click();
	await expect(page.locator('[data-tutorial-step="equip-axe"]')).toBeVisible();
	await showBackpack(page);
	await page
		.locator(".inventory-backpack-item")
		.filter({ hasText: "Machado do Salão Arruinado" })
		.getByRole("button", { name: "Trocar" })
		.click();
	await page.locator('[data-tutorial-anchor="hero.hands"]').click();
	await expect(
		page.locator('[data-tutorial-step="equip-armor"]'),
	).toBeVisible();
	await showBackpack(page);
	await page
		.locator(".inventory-backpack-item")
		.filter({ hasText: "Armadura de Couro Reforçado" })
		.getByRole("button", { name: "Equipar" })
		.click();
	await expect(page.locator('[data-tutorial-step="use-item"]')).toBeVisible();
	await showBackpack(page);
	await page
		.locator(".inventory-backpack-item")
		.filter({ hasText: "Poção de Precisão" })
		.getByRole("button", { name: "Trocar" })
		.click();
	await page.locator('[data-tutorial-anchor="hero.hands"]').click();
	await page.locator('[data-tutorial-anchor="item.use-action"]').click();
	await page.getByRole("button", { name: /Usar Poção de Precisão/ }).click();
	await expect(
		page.locator('[data-tutorial-step="item-states"]'),
	).toBeVisible();
	await expect(
		page.getByRole("region", { name: "Estados reais dos itens" }),
	).toContainText("Encanto do Sangue Quente");
	await expect(
		page.getByRole("region", { name: "Estados reais dos itens" }),
	).toContainText("disponível nesta rodada");
	await page.screenshot({
		path: `test-results/tutorial-inventory-states-${page.viewportSize()?.width}.png`,
	});
	await page.locator('[data-tutorial-anchor="journal.open"]').click();
	const diary = page.getByRole("dialog", { name: "Diário da partida" });
	await diary.getByRole("button", { name: "Estado atual" }).click();
	await expect(diary).toContainText("Encanto do Sangue Quente");
	await expect(diary).toContainText("exaurido");
	await diary.getByRole("button", { name: "Fechar diário" }).click();
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(
		page.locator('[data-tutorial-step="items-completion"]'),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Próximo arquivo/ }),
	).toBeEnabled();
}

test("Arquivo III continua no IV sem recarregar a página", async ({ page }) => {
	await openInventoryArchive(page);
	await completeInventoryArchive(page);
	await page.evaluate(() => { (window as Window & { tutorialMarker?: number }).tutorialMarker = 41; });
	await page.getByRole("button", { name: /Próximo arquivo — Arquivo IV/ }).click();
	await expect(page.locator('[data-tutorial-step="abilities-opening"]')).toBeVisible();
	expect(await page.evaluate(() => (window as Window & { tutorialMarker?: number }).tutorialMarker)).toBe(41);
	await expect(page.locator(".game-board-root")).toBeVisible();
});

test("Arquivo III: equipamento, duas mãos, vestimenta e consumível", async ({
	page,
}) => {
	await openInventoryArchive(page);
	await completeInventoryArchive(page);
	await page.screenshot({
		path: "test-results/tutorial-inventory-desktop.png",
	});
	await page.getByText("Registro do treinamento").click();
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Baixar registro e diário" }).click();
	const audit = JSON.parse(
		await readFile(await (await downloadPromise).path(), "utf8"),
	);
	const earlier = audit.previousGameJournal;
	expect(
		earlier.entries.some(
			(entry: { actionType: string }) => entry.actionType === "USE_ITEM",
		),
	).toBe(true);
	expect(
		audit.gameJournal.finalState.heroes[0].equipment.find(
			(slot: { slot: string }) => slot.slot === "amulet",
		).card.state,
	).toBe("exhausted");
	await page.getByRole("button", { name: "Repetir arquivo" }).click();
	await expect(
		page.locator('[data-tutorial-step="items-opening"]'),
	).toBeVisible();
	await page.getByRole("button", { name: "Sair do tutorial" }).click();
	await expect(page.locator(".tutorial-layer")).toHaveCount(0);
	await page.getByRole("button", { name: "JOGAR" }).click();
	await expect(
		page.getByRole("heading", { name: "Preparar Expedição" }),
	).toBeVisible();
});

test("Arquivo III abre no celular e mantém controles acessíveis", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
	});
	const page = await context.newPage();
	await openInventoryArchive(page);
	await expect(
		page.locator('[data-tutorial-anchor="hero.backpack"]'),
	).toBeVisible();
	for (const viewport of [
		{ width: 360, height: 800 },
		{ width: 390, height: 844 },
		{ width: 844, height: 390 },
		{ width: 768, height: 1024 },
		{ width: 1366, height: 768 },
	]) {
		await page.setViewportSize(viewport);
		const panel = await page.locator(".tutorial-panel").boundingBox();
		expect(panel).not.toBeNull();
		expect(panel!.x).toBeGreaterThanOrEqual(0);
		expect(panel!.y).toBeGreaterThanOrEqual(0);
		expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width + 1);
		expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height + 1);
		await page.screenshot({
			path: `test-results/tutorial-inventory-${viewport.width}x${viewport.height}.png`,
		});
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await completeInventoryArchive(page);
	await page.screenshot({ path: "test-results/tutorial-inventory-mobile.png" });
	await context.close();
});

test("Arquivo II continua no III no mesmo documento", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	await page
		.locator(".tutorial-hub__module")
		.nth(1)
		.getByRole("button")
		.click();
	await page.getByRole("button", { name: "Continuar" }).click();
	for (let i = 0; i < 4; i++)
		await page
			.getByRole("button", { name: i < 3 ? "Próximo ponto" : "Continuar" })
			.click();
	await page.locator('[data-tutorial-anchor="combat.hero"] .game-card').click();
	await page.locator('[data-tutorial-anchor="combat.enemy"]').click();
	await page.locator(".game-dice-roll-action").click();
	await expect(
		page.locator('[data-tutorial-step="combat-drag"]'),
	).toBeVisible();
	await page
		.locator('[data-tutorial-anchor="combat.hero"] .game-card')
		.dragTo(page.locator('[data-tutorial-anchor="combat.enemy"]'));
	await page.locator(".game-dice-roll-action").click();
	await page.getByRole("button", { name: "Próximo ponto" }).click();
	await page.getByRole("button", { name: "Continuar" }).click();
	await page.getByRole("button", { name: "Concluir combate" }).click();
	await expect(
		page.locator('[data-tutorial-step="combat-completion"]'),
	).toBeVisible();
	await page.evaluate(() => {
		(window as Window & { tutorialMarker?: number }).tutorialMarker = 37;
	});
	await page
		.getByRole("button", { name: /Próximo arquivo — Arquivo III/ })
		.click();
	await expect(
		page.locator('[data-tutorial-step="items-opening"]'),
	).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as Window & { tutorialMarker?: number }).tutorialMarker,
		),
	).toBe(37);
	await expect(page.locator(".game-board-root")).toBeVisible();
});
