import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openArchive(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	await expect(
		page.getByRole("heading", { name: "Arquivos de treinamento" }),
	).toBeVisible();
	await expect(page.locator(".tutorial-hub__module")).toHaveCount(4);
	await expect(
		page.locator(".tutorial-hub__module button:disabled"),
	).toHaveCount(0);
	await page
		.locator(".tutorial-hub__module")
		.first()
		.getByRole("button", { name: "Iniciar arquivo" })
		.click();
	await expect(page.locator('[data-tutorial-step="opening"]')).toBeVisible();
}

async function reachBoard(page: Page) {
	await openArchive(page);
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(
		page.locator('[data-tutorial-step="choose-hero"]'),
	).toBeVisible();
	await page.locator(".setup-hero-select-button").first().click();
	await expect(page.locator('[data-tutorial-step="group"]')).toBeVisible();
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(page.locator('[data-tutorial-step="start"]')).toBeVisible();
	await page.getByRole("button", { name: "Iniciar partida" }).click();
	await expect(page.locator('[data-tutorial-step="board"]')).toBeVisible();
	await expect(page.locator(".game-board-root")).toBeVisible();
}

test("menu, ações reais e conclusão do Arquivo I", async ({ page }) => {
	await reachBoard(page);
	await expect(
		page.getByRole("button", { name: "Revelar sala" }),
	).toBeDisabled();
	for (let index = 0; index < 4; index++) {
		await expect(page.locator(".tutorial-spotlight")).toBeVisible();
		await page
			.getByRole("button", { name: index < 3 ? "Próximo ponto" : "Continuar" })
			.click();
	}
	await expect(page.locator('[data-tutorial-step="reveal"]')).toBeVisible();
	await page.getByRole("button", { name: "Revelar sala" }).click();
	await expect(page.locator('[data-tutorial-step="encounter"]')).toBeVisible({
		timeout: 10_000,
	});
	await expect(
		page.locator('[data-tutorial-anchor="board.current-room"]'),
	).toBeVisible();
	await expect(
		page.locator('[data-tutorial-anchor="board.active-enemies"]'),
	).toBeVisible();
	await page.getByRole("button", { name: "Pular observação" }).click();
	await expect(page.locator('[data-tutorial-step="goal"]')).toBeVisible();
	await page.getByRole("button", { name: "Continuar" }).click();
	await expect(page.locator('[data-tutorial-step="completion"]')).toBeVisible();
	await expect(page.getByText("Eu registrei.")).toBeVisible();
	await expect(page.getByText("Registro do treinamento")).toBeVisible();
	await page.getByText("Registro do treinamento").click();
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Baixar registro e diário" }).click();
	const audit = JSON.parse(
		await readFile(await (await downloadPromise).path(), "utf8"),
	);
	expect(
		audit.tutorial.events.some(
			(event: { type: string }) => event.type === "room-revealed",
		),
	).toBe(true);
	expect(audit.gameJournal).toBeTruthy();
	await expect(
		page.getByRole("button", { name: /Próximo arquivo — Arquivo II/ }),
	).toBeEnabled();
	await page.getByRole("button", { name: "Repetir arquivo" }).click();
	await expect(page.locator('[data-tutorial-step="opening"]')).toBeVisible();
	await page.getByRole("button", { name: "Sair do tutorial" }).click();
	await page.getByRole("button", { name: "JOGAR" }).click();
	await expect(
		page.getByRole("heading", { name: "Preparar Expedição" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Iniciar partida" }),
	).toBeDisabled();
});

test("inspecionar a carta ou tocar fora do destaque não confirma a seleção", async ({
	page,
}) => {
	await openArchive(page);
	await page.getByRole("button", { name: "Continuar" }).click();
	await page.mouse.click(5, 5);
	await expect(
		page.locator('[data-tutorial-step="choose-hero"]'),
	).toBeVisible();
	await page.locator(".setup-hero-info-button").first().click();
	await expect(page.locator(".flow-modal-overlay")).toBeVisible();
	await expect(
		page.locator('[data-tutorial-step="choose-hero"]'),
	).toBeVisible();
	await page
		.locator(".flow-modal-overlay")
		.getByRole("button", { name: /Fechar|Voltar/ })
		.first()
		.click();
	await page.locator(".setup-hero-select-button").first().click();
	await expect(page.locator('[data-tutorial-step="group"]')).toBeVisible();
});

test("abandonar preserva um registro separado e limpa a partida", async ({
	page,
}) => {
	await openArchive(page);
	await page.getByRole("button", { name: "Sair do tutorial" }).click();
	await expect(page.getByRole("button", { name: "JOGAR" })).toBeVisible();
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	const downloadPromise = page.waitForEvent("download");
	await page
		.getByRole("button", { name: "Baixar último registro de treinamento" })
		.click();
	const audit = JSON.parse(
		await readFile(await (await downloadPromise).path(), "utf8"),
	);
	expect(audit.tutorial.status).toBe("cancelled");
	expect(audit.tutorial.events.at(-1).type).toBe("abandoned");
});

test("escolher outro arquivo após concluir mantém o tabuleiro até a saída", async ({
	page,
}) => {
	await reachBoard(page);
	await page.getByRole("button", { name: "Pular observação" }).click();
	await page.getByRole("button", { name: "Revelar sala" }).click();
	await expect(page.locator('[data-tutorial-step="encounter"]')).toBeVisible({
		timeout: 10_000,
	});
	await page.getByRole("button", { name: "Pular observação" }).click();
	await page.getByRole("button", { name: "Continuar" }).click();
	await page.getByRole("button", { name: "Escolher arquivo" }).click();
	await expect(
		page.getByRole("dialog", { name: "Arquivos de treinamento" }),
	).toBeVisible();
	await expect(page.locator(".game-board-root")).toBeVisible();
	await page.getByRole("button", { name: "← Voltar" }).click();
	await expect(page.getByRole("button", { name: "JOGAR" })).toBeVisible();
});

test("tabuleiro guiado permanece utilizável no celular e desktop", async ({
	page,
}) => {
	for (const viewport of [
		{ width: 360, height: 800 },
		{ width: 1366, height: 768 },
	]) {
		await page.setViewportSize(viewport);
		await reachBoard(page);
		await page.screenshot({
			path: `test-results/tutorial-board-${viewport.width}.png`,
		});
		await page.getByRole("button", { name: "Pular observação" }).click();
		await expect(page.locator('[data-tutorial-step="reveal"]')).toBeVisible();
		const reveal = page.getByRole("button", { name: "Revelar sala" });
		await expect(reveal).toBeEnabled();
		await page.screenshot({
			path: `test-results/tutorial-reveal-${viewport.width}.png`,
		});
		await reveal.click();
		await expect(page.locator('[data-tutorial-step="encounter"]')).toBeVisible({
			timeout: 10_000,
		});
		const roomBounds = await page
			.locator('[data-tutorial-anchor="board.current-room"]')
			.boundingBox();
		if (!roomBounds) throw new Error("Sala sem geometria");
		await page.mouse.click(
			roomBounds.x + roomBounds.width / 2,
			roomBounds.y + roomBounds.height / 2,
		);
		await expect(page.locator(".modal-layer")).toHaveCount(0);
		await page.screenshot({
			path: `test-results/tutorial-encounter-${viewport.width}.png`,
		});
	}
});

test("spotlight acompanha viewports e permite toque real", async ({ page }) => {
	for (const viewport of [
		{ width: 360, height: 800 },
		{ width: 390, height: 844 },
		{ width: 844, height: 390 },
		{ width: 768, height: 1024 },
		{ width: 1366, height: 768 },
	]) {
		await page.setViewportSize(viewport);
		await openArchive(page);
		await page.getByRole("button", { name: "Continuar" }).click();
		const target = page.locator(
			'[data-tutorial-anchor="setup.hero-selection"]',
		);
		const spotlight = page.locator(".tutorial-spotlight");
		await expect(target).toBeVisible();
		await expect(spotlight).toBeVisible();
		const targetBounds = await target.boundingBox();
		const lightBounds = await spotlight.boundingBox();
		expect(targetBounds).not.toBeNull();
		expect(lightBounds).not.toBeNull();
		expect(
			Math.abs((targetBounds?.x ?? 0) - (lightBounds?.x ?? 0)),
		).toBeLessThan(8);
		await page.locator(".setup-hero-select-button").first().click();
		await expect(page.locator('[data-tutorial-step="group"]')).toBeVisible();
		if (viewport.width === 360 || viewport.width === 1366) {
			await page.screenshot({
				path: `test-results/tutorial-setup-${viewport.width}.png`,
				fullPage: true,
			});
		}
	}
});

test("toque e mudança de orientação mantêm o alvo acessível", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await context.newPage();
	try {
		await openArchive(page);
		await page.getByRole("button", { name: "Continuar" }).tap();
		await page.locator(".setup-hero-select-button").first().tap();
		await expect(page.locator('[data-tutorial-step="group"]')).toBeVisible();
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(page.locator(".tutorial-spotlight")).toBeVisible();
		await page.getByRole("button", { name: "Continuar" }).tap();
		await page.getByRole("button", { name: "Iniciar partida" }).tap();
		await page.getByRole("button", { name: "Pular observação" }).tap();
		await page.getByRole("button", { name: "Revelar sala" }).tap();
		await expect(page.locator('[data-tutorial-step="encounter"]')).toBeVisible({
			timeout: 10_000,
		});
	} finally {
		await context.close();
	}
});
