import { expect, test } from "@playwright/test";

test("menu publica as cinco faixas e o manual, com controles acessíveis", async ({ page }) => {
	page.on("response", (response) => {
		if (response.url().includes("/generated/music/manifest.json"))
			console.log("[e2e music] browser manifest status", response.status(), response.url());
	});
	page.on("requestfailed", (request) => {
		if (request.url().includes("/generated/music/manifest.json"))
			console.log("[e2e music] browser request failed", request.failure()?.errorText);
	});
	await page.goto("/");
	const toggle = page.getByRole("button", { name: "Abrir menu global" });
	await expect(toggle).toHaveAttribute("aria-expanded", "false");
	await toggle.click();
	await expect(page.getByRole("button", { name: "Fechar menu global" })).toHaveAttribute("aria-expanded", "true");
	await expect(page.getByRole("heading", { name: "Música" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Regras" })).toBeVisible();
	try {
		await expect(page.locator(".global-menu__track + label select option")).toHaveCount(5);
	} catch (error) {
		const response = await page.request.get("/generated/music/manifest.json");
		console.log("[e2e music] manifest HTTP status", response.status());
		console.log("[e2e music] manifest body", (await response.text()).slice(0, 2000));
		console.log("[e2e music] UI track", await page.locator(".global-menu__track").allTextContents());
		console.log("[e2e music] UI status", await page.locator(".global-menu__status").allTextContents());
		throw error;
	}
	await expect(page.getByLabel("Idioma da interface").locator('option[value="pt-BR"]')).toHaveText("Português (Brasil)");
	const readManual = page.getByRole("link", { name: "Ler manual de regras" });
	const downloadManual = page.getByRole("link", { name: "Baixar manual em PDF" });
	await expect(readManual).toHaveAttribute("href", "/rules/ascensao-heroica-manual.pdf");
	await expect(readManual).toHaveAttribute("target", "_blank");
	await expect(downloadManual).toHaveAttribute("download", "ascensao-heroica-manual.pdf");
	const manifest = await page.request.get("/generated/music/manifest.json");
	expect(manifest.ok()).toBe(true);
	const tracks = (await manifest.json()).tracks as { url: string }[];
	expect(tracks).toHaveLength(5);
	for (const track of tracks) {
		const response = await page.request.get(track.url);
		expect(response.ok()).toBe(true);
		expect((await response.body()).length).toBeGreaterThan(1000);
	}
	await page.keyboard.press("Escape");
	await expect(page.locator("#global-menu-panel")).toHaveCount(0);
	await expect(toggle).toBeFocused();
});

test("player mantém seleção e volume ao navegar, respeitando Stop ao recarregar", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__track + label select option")).toHaveCount(5);
	await page.locator(".global-menu__track + label select").selectOption({ index: 1 });
	await page.locator("#global-music-volume").fill("68");
	await page.getByRole("button", { name: "Play" }).click();
	await expect(page.locator(".global-menu__status")).toContainText(/Reproduzindo|Não foi possível/);
	await page.getByRole("button", { name: "Stop" }).click();
	await expect(page.locator(".global-menu__status")).toHaveText("Parado");
	await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
	await page.getByRole("button", { name: "JOGAR" }).click();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__track + label select")).toHaveValue("o_chamado_da_fornalha");
	await expect(page.locator("#global-music-volume")).toHaveValue("68");
	await page.reload();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__status")).toHaveText("Parado");
	await expect(page.locator("#global-music-volume")).toHaveValue("68");
});

test("uma reprodução segue ativa ao passar por menu, preparação e tabuleiro", async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as Window & { __musicAudio?: HTMLMediaElement; __musicPlayCount?: number };
		HTMLMediaElement.prototype.play = function () {
			if (this.src.includes("/generated/music/")) {
				state.__musicAudio = this;
				state.__musicPlayCount = (state.__musicPlayCount ?? 0) + 1;
			}
			return Promise.resolve();
		};
		HTMLMediaElement.prototype.load = function () {};
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__track + label select option")).toHaveCount(5);
	await page.getByRole("button", { name: "Play" }).click();
	await expect(page.locator(".global-menu__status")).toHaveText("Reproduzindo");
	await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
	await page.getByRole("button", { name: "JOGAR" }).click();
	await page.locator(".setup-hero-select-button").first().click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();
	await expect(page.locator(".game-board-root")).toBeVisible();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__status")).toHaveText("Reproduzindo");
	expect(await page.evaluate(() => (window as Window & { __musicPlayCount?: number }).__musicPlayCount)).toBe(1);
	await page.getByRole("button", { name: "Stop" }).click();
});

test("música começa sozinha quando o navegador permite e não volta após Stop", async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as Window & { __musicPlayCount?: number };
		HTMLMediaElement.prototype.play = function () {
			if (this.src.includes("/generated/music/")) state.__musicPlayCount = (state.__musicPlayCount ?? 0) + 1;
			return Promise.resolve();
		};
		HTMLMediaElement.prototype.load = function () {};
	});
	await page.goto("/");
	await expect.poll(() => page.evaluate(() => (window as Window & { __musicPlayCount?: number }).__musicPlayCount ?? 0)).toBe(1);
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__status")).toHaveText("Reproduzindo");
	await page.getByRole("button", { name: "Stop" }).click();
	await page.reload();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__track + label select option")).toHaveCount(5);
	await expect(page.locator(".global-menu__status")).toHaveText("Parado");
	expect(await page.evaluate(() => (window as Window & { __musicPlayCount?: number }).__musicPlayCount ?? 0)).toBe(0);
});

test("autoplay bloqueado exibe convite e funciona após interação", async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as Window & { __musicPlayCount?: number };
		HTMLMediaElement.prototype.play = function () {
			if (this.src.includes("/generated/music/")) state.__musicPlayCount = (state.__musicPlayCount ?? 0) + 1;
			return state.__musicPlayCount === 1
				? Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }))
				: Promise.resolve();
		};
		HTMLMediaElement.prototype.load = function () {};
	});
	await page.goto("/");
	await expect(page.getByRole("button", { name: "♫ Ouvir música" })).toBeVisible();
	await page.getByRole("button", { name: "JOGAR" }).click();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__status")).toHaveText("Reproduzindo");
	await expect(page.getByRole("button", { name: "♫ Ouvir música" })).toHaveCount(0);
	expect(await page.evaluate(() => (window as Window & { __musicPlayCount?: number }).__musicPlayCount)).toBe(2);
});

test("menu global permanece disponível no arquivo de tutoriais e durante a narração", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "TUTORIAL" }).click();
	await expect(page.getByRole("heading", { name: "Arquivos de treinamento" })).toBeVisible();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.getByRole("heading", { name: "Música" })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.locator(".tutorial-hub__module").first().getByRole("button", { name: "Iniciar arquivo" }).click();
	await expect(page.locator('[data-tutorial-step="opening"]')).toBeVisible();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.getByRole("heading", { name: "Regras" })).toBeVisible();
});

test("menu cabe em telas pequenas, paisagem, tablet e desktop", async ({ page }) => {
	for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }]) {
		await page.setViewportSize(viewport);
		await page.goto("/");
		await page.getByRole("button", { name: "Abrir menu global" }).click();
		const box = await page.locator("#global-menu-panel").boundingBox();
		expect(box).not.toBeNull();
		if (box) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
			expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
		}
		await expect(page.getByRole("link", { name: "Ler manual de regras" })).toBeVisible();
		if (viewport.width === 360 || viewport.width === 844)
			await page.screenshot({ path: `test-results/global-menu-${viewport.width}x${viewport.height}.png` });
	}
});

test("troca para inglês mantém tabuleiro e música, e persiste a escolha", async ({ page }) => {
	await page.addInitScript(() => {
		const state = window as Window & { __musicPlayCount?: number };
		HTMLMediaElement.prototype.play = function () {
			if (this.src.includes("/generated/music/")) state.__musicPlayCount = (state.__musicPlayCount ?? 0) + 1;
			return Promise.resolve();
		};
		HTMLMediaElement.prototype.load = function () {};
	});
	await page.goto("/");
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	const selector = page.getByLabel("Idioma da interface");
	if (await selector.locator('option[value="en-US"]').count() === 0) {
		test.skip(true, "en-US ainda não está publicado");
		return;
	}
	await page.getByRole("button", { name: "Play" }).click();
	await expect(page.locator(".global-menu__status")).toHaveText("Reproduzindo");
	await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
	await page.getByRole("button", { name: "JOGAR" }).click();
	await page.locator(".setup-hero-select-button").first().click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();
	await expect(page.locator(".game-board-root")).toBeVisible();
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await page.getByLabel("Idioma da interface").selectOption("en-US");
	await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
	await expect(page.getByRole("heading", { name: "Music" })).toBeVisible();
	await expect(page.locator(".game-board-root")).toBeVisible();
	expect(await page.evaluate(() => (window as Window & { __musicPlayCount?: number }).__musicPlayCount)).toBe(1);
	await expect(page.locator(".global-menu__status")).toHaveText("Playing");
	await expect.poll(() => page.evaluate(() => localStorage.getItem("ascensao-heroica:locale:v1"))).toBe("en-US");
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
	await page.getByRole("button", { name: "Open global menu" }).click();
	await expect(page.getByLabel("Interface language")).toHaveValue("en-US");
});

test("efeitos desabilitados não interferem no status da música", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await expect(page.locator(".global-menu__status")).toHaveCount(1);
	await expect(page.locator(".global-menu__sfx-notice")).toContainText("temporariamente desativados");
	await expect(page.getByRole("note")).toHaveCount(1);
	await expect(page.locator("#global-sfx-volume")).toBeDisabled();
	await expect(page.getByRole("button", { name: /Silenciar efeitos|Reativar efeitos/ })).toBeDisabled();
	await expect(page.locator("#global-music-volume")).toBeEnabled();
});
