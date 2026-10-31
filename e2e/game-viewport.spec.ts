import { expect, test, type Page } from "@playwright/test";

const viewports = [
	{ width: 320, height: 568 },
	{ width: 360, height: 800 },
	{ width: 390, height: 844 },
	{ width: 412, height: 915 },
	{ width: 568, height: 320 },
	{ width: 667, height: 375 },
	{ width: 844, height: 390 },
	{ width: 915, height: 412 },
	{ width: 768, height: 1024 },
	{ width: 1024, height: 768 },
	{ width: 1366, height: 768 },
	{ width: 1920, height: 1080 },
] as const;

async function startCombat(page: Page, heroCount = 1) {
	await page.goto("/");
	await page.evaluate((count) => {
		const heroCardIds = [
			"hero_crimson_barbarian",
			"hero_eternal_rest_cleric",
			"hero_broken_bastion_warrior",
			"hero_rift_rogue",
		].slice(0, count);
		(window as unknown as { __dispatch: (action: unknown) => void }).__dispatch(
			{
				type: "START_GAME",
				payload: {
					heroCardIds,
					mode: "cooperative",
					difficulty: "normal",
					seed: 42,
				},
			},
		);
	}, heroCount);
	await expect
		.poll(
			() =>
				page.evaluate(async () => {
					const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
					return getElfGameState().status;
				}),
			{ timeout: 12_000 },
		)
		.toBe("HERO_ACTION");
}

async function setEncounter(
	page: Page,
	heroCount: number,
	enemyCount: number,
	boss = false,
) {
	await page.evaluate(
		async ({ heroCount, enemyCount, boss }) => {
			const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
			const state = getElfGameState();
			const hero = state.heroes[0];
			const enemy = state.activeEnemies.find(
				(item) => item.status === "active",
			);
			if (!hero || !enemy) throw new Error("Combat fixture unavailable");
			const heroes =
				state.heroes.length >= heroCount
					? state.heroes.slice(0, heroCount)
					: Array.from({ length: heroCount }, (_, index) => ({
							...hero,
							id: `viewport-hero-${index}`,
							playerIndex: index,
						}));
			const activeEnemies = boss
				? [{ ...enemy, id: "boss", cardId: state.bossCardId, status: "active" }]
				: Array.from({ length: enemyCount }, (_, index) => ({
						...enemy,
						id: `viewport-enemy-${index}`,
					}));
			(
				window as unknown as { __loadGameState: (state: unknown) => void }
			).__loadGameState({
				...state,
				status: boss ? "BOSS_COMBAT" : "HERO_ACTION",
				pendingSkillChoice: undefined,
				pendingTriggerInterrupt: undefined,
				heroes,
				activeEnemies,
				combat: {
					...state.combat,
					phase: "selecting_hero",
					selectedHeroId: null,
					heroesActed: [],
				},
			});
		},
		{ heroCount, enemyCount, boss },
	);
	await expect(page.locator(".game-card--hero")).toHaveCount(heroCount);
	await expect(
		page.locator(boss ? ".game-card--boss" : ".game-card--enemy"),
	).toHaveCount(boss ? 1 : enemyCount);
}

async function expectBoardFits(page: Page) {
	const geometry = await page.evaluate(() => {
		const root = document.documentElement;
		const surface = document.querySelector(
			".game-board-surface",
		) as HTMLElement;
		const viewport = document.querySelector(".game-viewport") as HTMLElement;
		const controls = [
			...document.querySelectorAll<HTMLElement>(
				".game-card--room, .game-card--enemy, .game-card--boss, .game-card--hero, .game-portable-action-bar button, .game-portable-action-bar a",
			),
		].filter((element) => element.getClientRects().length > 0);
		return {
			document: {
				scrollWidth: root.scrollWidth,
				clientWidth: root.clientWidth,
				scrollHeight: root.scrollHeight,
				clientHeight: root.clientHeight,
			},
			surface: {
				scrollWidth: surface.scrollWidth,
				clientWidth: surface.clientWidth,
				scrollHeight: surface.scrollHeight,
				clientHeight: surface.clientHeight,
			},
			viewport: viewport.getBoundingClientRect().toJSON(),
			cards: controls.map((element) => {
				const box = element.getBoundingClientRect();
				const hit = [0.2, 0.5, 0.8].every((fraction) => {
					const top = document.elementFromPoint(
						box.x + box.width * fraction,
						box.y + box.height / 2,
					);
					return top === element || element.contains(top);
				});
				return { className: element.className, box: box.toJSON(), hit };
			}),
		};
	});
	expect(geometry.document.scrollWidth).toBeLessThanOrEqual(
		geometry.document.clientWidth + 1,
	);
	expect(geometry.document.scrollHeight).toBeLessThanOrEqual(
		geometry.document.clientHeight + 1,
	);
	expect(geometry.surface.scrollWidth).toBeLessThanOrEqual(
		geometry.surface.clientWidth + 1,
	);
	expect(geometry.surface.scrollHeight).toBeLessThanOrEqual(
		geometry.surface.clientHeight + 1,
	);
	for (const { className, box, hit } of geometry.cards) {
		expect(box.x, `${className} left`).toBeGreaterThanOrEqual(-1);
		expect(box.y, `${className} top`).toBeGreaterThanOrEqual(-1);
		expect(box.x + box.width, `${className} right`).toBeLessThanOrEqual(
			geometry.viewport.width + 1,
		);
		expect(box.y + box.height, `${className} bottom`).toBeLessThanOrEqual(
			geometry.viewport.height + 1,
		);
		expect(hit, `${className} hit target`).toBe(true);
	}
}

test("Apoie-nos aparece apenas no menu e não intercepta cartas do tabuleiro", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto("/");
	const support = page.locator(".support-action__trigger");
	await expect(support).toBeVisible();
	await support.click();
	const dialog = page.getByRole("dialog", { name: /Ajude a expandir Ascensão Heróica/ });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("img", { name: "QR Code de pagamento Pix" })).toBeVisible();
	await dialog.getByRole("button", { name: "✕" }).click();
	await expect(dialog).toHaveCount(0);
	await startCombat(page);
	await expect(support).toHaveCount(0);
	await expectBoardFits(page);
	await page.locator(".game-card--room").click();
	await expect(page.getByRole("dialog", { name: /Passagem das Tochas Mortas/ })).toBeVisible();
});

test("a cena inteira cabe nos doze viewports com quatro heróis e criaturas", async ({
	page,
}) => {
	test.setTimeout(120_000);
	for (const viewport of viewports) {
		await page.setViewportSize(viewport);
		await startCombat(page, 4);
		await setEncounter(page, 4, 4);
		await expectBoardFits(page);
		await page.screenshot({
			path: `test-results/viewport-${viewport.width}x${viewport.height}-group.png`,
		});
		await setEncounter(page, 4, 1, true);
		await expectBoardFits(page);
		if (viewport.width <= 568 || viewport.width === 1366)
			await page.screenshot({
				path: `test-results/viewport-${viewport.width}x${viewport.height}-boss.png`,
			});
	}
});

test("um a quatro inimigos e redimensionamento preservam a cena", async ({
	page,
}) => {
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await startCombat(page, 4);
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 568, height: 320 },
		{ width: 320, height: 568 },
	]) {
		await page.setViewportSize(viewport);
		for (let count = 1; count <= 4; count++) {
			await setEncounter(page, count === 1 ? 1 : 4, count);
			await expectBoardFits(page);
		}
	}
});

test("drawers, detalhes e painel do herói continuam operáveis em 320 px", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await startCombat(page);
	const group = page.getByRole("button", { name: "Grupo", exact: true });
	await group.click();
	await expect(
		page.getByRole("dialog", { name: "Grupo e Despertar" }),
	).toBeVisible();
	await expect(
		page
			.getByRole("dialog", { name: "Grupo e Despertar" })
			.getByText("XP do grupo"),
	).toBeVisible();
	await group.click();
	await expect(
		page.getByRole("dialog", { name: "Grupo e Despertar" }),
	).toHaveCount(0);
	await page.getByRole("button", { name: /Influências/ }).click();
	await expect(page.getByRole("dialog", { name: "Influências" })).toBeVisible();
	await page
		.getByRole("button", { name: "Fechar Influências" })
		.first()
		.click();
	await expect(page.getByRole("dialog", { name: "Influências" })).toHaveCount(
		0,
	);
	const room = page.locator(".game-card--room");
	await room.click();
	const detail = page.getByRole("dialog", {
		name: /Passagem das Tochas Mortas/,
	});
	await expect(detail).toBeVisible();
	await expect(detail).toBeFocused();
	const bounds = await detail.boundingBox();
	if (!bounds) throw new Error("Room detail has no bounds");
	expect(bounds.x).toBeGreaterThanOrEqual(0);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
	await detail.locator(".modal-close").click();
	await expect(detail).toHaveCount(0);
	await expect(room).toBeFocused();
	const hero = page.locator(".game-card--hero").first();
	await hero.click();
	await hero.click();
	await expect(page.locator(".game-hero-focus-popover")).toBeVisible();
	const focusBounds = await page
		.locator(".game-hero-focus-popover")
		.boundingBox();
	if (!focusBounds) throw new Error("Hero panel has no bounds");
	expect(focusBounds.x).toBeGreaterThanOrEqual(0);
	expect(focusBounds.x + focusBounds.width).toBeLessThanOrEqual(320);
	expect(focusBounds.y + focusBounds.height).toBeLessThanOrEqual(568);
	await page.screenshot({
		path: "test-results/viewport-320x568-hero-focus.png",
	});
	await page
		.getByRole("button", { name: "Fechar herói em foco" })
		.click({ position: { x: 2, y: 2 } });
	await expect(page.locator(".game-hero-focus-popover")).toHaveCount(0);
});

test("as duas ações do encontro com o chefe cabem em retrato e paisagem", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 568 });
	await startCombat(page);
	await page.evaluate(async () => {
		const modulePath = "/src/ui/store/elfStore.ts";
		const { getElfGameState } = await import(modulePath);
		(
			window as unknown as { __loadGameState: (state: unknown) => void }
		).__loadGameState({
			...getElfGameState(),
			status: "BOSS_REVEAL",
		});
	});
	for (const viewport of [
		{ width: 320, height: 568 },
		{ width: 568, height: 320 },
	]) {
		await page.setViewportSize(viewport);
		for (const name of ["Enfrentar chefe", "Continuar explorando"]) {
			const button = page.getByRole("button", { name: new RegExp(name) });
			await expect(button).toBeVisible();
			const box = await button.boundingBox();
			if (!box) throw new Error(`${name} has no bounds`);
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
			expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 44);
		}
		await expectBoardFits(page);
	}
});
