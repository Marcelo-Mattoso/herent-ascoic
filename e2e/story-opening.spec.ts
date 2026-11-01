import { expect, test, type Page } from "@playwright/test";

async function prepare(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "JOGAR" }).click();
	await page.locator(".setup-hero-select-button").first().click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();
	await expect(page.locator(".story-opening")).toBeVisible();
}

async function gameState(page: Page) {
	return page.evaluate(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		const state = getElfGameState();
		return { status: state.status, bossCardId: state.bossCardId, difficulty: state.difficulty, mode: state.mode, heroes: state.heroes.map((hero) => hero.cardId), seed: state.rng.seed, actions: state.actionLog, starts: state.actionLog.flatMap((entry) => entry.action.type === "START_GAME" ? [entry.action.payload] : []) };
	});
}

test("percorre as 12 cenas e só inicia a partida ao concluir", async ({ page }) => {
	await prepare(page);
	await expect(page.locator(".story-opening")).toHaveAttribute("data-scene-id", "scene-01");
	await expect(page.getByRole("button", { name: "Pular abertura" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Próximo" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Voltar", exact: true })).toHaveCount(0);
	await expect(page.getByText("Eu registrei. Antes das Fendas", { exact: false })).toBeVisible();
	const before = await gameState(page);
	expect(before.status).toBe("MAIN_MENU");
	expect(before.actions).toHaveLength(0);
	for (let scene = 2; scene <= 12; scene++) {
		await page.getByRole("button", { name: "Próximo" }).click();
		await expect(page.locator(".story-opening")).toHaveAttribute("data-scene-id", `scene-${String(scene).padStart(2, "0")}`);
	}
	await expect(page.getByRole("button", { name: "Pular abertura" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Próximo" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Voltar", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Voltar", exact: true }).click();
	await expect(page.locator(".story-opening")).toHaveAttribute("data-scene-id", "scene-11");
	await page.getByRole("button", { name: "Próximo" }).click();
	await page.getByRole("button", { name: "Iniciar aventura" }).dblclick();
	await expect(page.locator(".game-board-root")).toBeVisible();
	const state = await gameState(page);
	expect(state.bossCardId).toBe("boss_azhakar");
	expect(state.difficulty).toBe("normal");
	expect(state.mode).toBe("cooperative");
	expect(state.heroes).toHaveLength(1);
	expect(state.seed).toBeTruthy();
	expect(state.starts).toHaveLength(1);
	expect(state.starts[0]?.seed).toBe(state.seed);
	expect(state.starts[0]?.heroCardIds).toEqual(state.heroes);
});

test("pular abre o tabuleiro uma única vez mesmo com cliques rápidos", async ({ page }) => {
	await prepare(page);
	await page.getByRole("button", { name: "Pular abertura" }).dblclick();
	await expect(page.locator(".game-board-root")).toBeVisible();
	expect((await gameState(page)).starts).toHaveLength(1);
});

test("troca o idioma sem perder o quadro e mantém navegação com imagem indisponível", async ({ page }) => {
	await page.route("**/generated/openings/assets/**/scene-02.webp", (route) => route.abort());
	await prepare(page);
	await page.getByRole("button", { name: "Próximo" }).click();
	await expect(page.locator(".story-opening")).toHaveAttribute("data-scene-id", "scene-02");
	await expect(page.getByText("Imagem indisponível", { exact: false })).toBeVisible();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await page.getByLabel("Idioma da interface").selectOption("en-US");
	await expect(page.getByText("But beyond the material world", { exact: false })).toBeVisible();
	await expect(page.locator(".story-opening")).toHaveAttribute("data-scene-id", "scene-02");
	await page.getByRole("button", { name: "Close menu", exact: true }).click();
	await page.getByRole("button", { name: "Open global menu" }).click();
	await page.getByLabel("Interface language").selectOption("es-ES");
	await expect(page.getByText("Pero más allá de la materia", { exact: false })).toBeVisible();
	await expect(page.locator(".story-opening")).toHaveAttribute("data-scene-id", "scene-02");
});

test("imagem e controles cabem no celular e a rota do asset responde", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await prepare(page);
	await expect(page.locator(".story-opening__image")).toBeVisible();
	const image = page.locator(".story-opening__image");
	const url = await image.getAttribute("src");
	expect(url).toContain("/generated/openings/assets/fornalha-sombria/abertura/images/scene-01.webp");
	const response = await page.request.get(url!);
	expect(response.ok()).toBe(true);
	expect((await response.body()).toString("ascii", 8, 12)).toBe("WEBP");
	for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
		await page.setViewportSize(viewport);
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
		expect(overflow).toBe(false);
		await expect(page.getByRole("button", { name: "Próximo" })).toBeInViewport();
		await expect(page.getByRole("button", { name: "Pular abertura" })).toBeInViewport();
	}
});
