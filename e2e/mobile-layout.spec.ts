import { expect, test } from "@playwright/test";

const viewports = [
	{ name: "android-portrait", width: 360, height: 800 },
	{ name: "phone-portrait", width: 390, height: 844 },
	{ name: "large-phone-portrait", width: 412, height: 915 },
	{ name: "phone-landscape", width: 844, height: 390 },
	{ name: "compact-landscape", width: 667, height: 375 },
	{ name: "tablet-portrait", width: 768, height: 1024 },
	{ name: "desktop", width: 1366, height: 768 },
] as const;

test("menu, preparação e tabuleiro permanecem acessíveis em retrato e paisagem", async ({
	page,
}) => {
	test.setTimeout(90_000);
	for (const viewport of viewports) {
		await page.setViewportSize(viewport);
		await page.goto("/");
		await expect(page.getByRole("button", { name: "JOGAR" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Abrir menu global" })).toBeVisible();
		if (viewport.width === 360)
			await page.screenshot({ path: "test-results/layout-menu-portrait.png" });
		await page.getByRole("button", { name: "JOGAR" }).click();
		await expect(
			page.getByRole("heading", { name: "Preparar Expedição" }),
		).toBeVisible();
		if (viewport.width === 360)
			await page.screenshot({ path: "test-results/layout-setup-portrait.png" });
		await page.locator(".setup-hero-select-button").first().click();
		await page.getByRole("button", { name: "Iniciar partida" }).click();
		await expect(page.locator(".game-board-root")).toBeVisible();
		await page.evaluate(() => {
			(
				window as unknown as { __dispatch: (action: unknown) => void }
			).__dispatch({
				type: "START_GAME",
				payload: {
					heroCardIds: ["hero_crimson_barbarian"],
					mode: "cooperative",
					difficulty: "normal",
					seed: 42,
				},
			});
		});
		await page
			.getByRole("dialog", { name: "Tochas Mortas" })
			.getByRole("button", { name: "Escolher" })
			.last()
			.click();
		await expect
			.poll(
				() =>
					page.evaluate(async () => {
						const modulePath = "/src/ui/store/elfStore.ts";
						const { getElfGameState } = await import(modulePath);
						return getElfGameState().status;
					}),
				{ timeout: 12_000 },
			)
			.toBe("HERO_ACTION");
		const hero = page.locator(".game-board-hero-strip button").first();
		await expect(hero).toBeVisible();
		await expect(
			page.locator(".game-board-active-cards button").first(),
		).toBeVisible();
		await expect
			.poll(() =>
				page
					.locator(".game-landscape-stage")
					.evaluate((element) =>
						element.style.backgroundImage.includes("url("),
					),
			)
			.toBe(true);
		await expect
			.poll(() =>
				hero.evaluate((element) =>
					getComputedStyle(element).backgroundImage.includes("url("),
				),
			)
			.toBe(true);
		await expect(page.locator(".game-board-stacks")).toHaveCount(0);
		await expect(page.locator(".orientation-gate")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Abrir menu global" })).toBeVisible();

		if (viewport.width <= 900) {
			await expect(
				page.getByRole("group", { name: "Ações da partida" }),
			).toBeVisible();
			const surface = page.locator(".game-board-surface");
			const dimensions = await surface.evaluate((element) => ({
				contentWidth: element.scrollWidth,
				visibleWidth: element.clientWidth,
				contentHeight: element.scrollHeight,
				visibleHeight: element.clientHeight,
			}));
			expect(dimensions.contentWidth).toBeLessThanOrEqual(
				dimensions.visibleWidth + 1,
			);
			expect(dimensions.contentHeight).toBeLessThanOrEqual(
				dimensions.visibleHeight + 1,
			);
			if (viewport.width <= 600 && viewport.height > viewport.width) {
				const bounds = await hero.boundingBox();
				expect(bounds).not.toBeNull();
				expect(bounds!.x).toBeGreaterThanOrEqual(0);
				expect(bounds!.x).toBeLessThan(viewport.width);
				expect(bounds!.y).toBeLessThan(viewport.height - 50);
			}
		}
		await page.waitForTimeout(250);
		await page.screenshot({ path: `test-results/layout-${viewport.name}.png` });
	}

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(
		page.getByRole("group", { name: "Ações da partida" }),
	).toBeVisible();
	await expect
		.poll(() =>
			page
				.locator(".game-board-surface")
				.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
		)
		.toBe(true);
	await page.setViewportSize({ width: 1366, height: 768 });
	await expect(
		page.getByRole("group", { name: "Ações da partida" }),
	).toBeHidden();
	await expect(page.locator(".game-board-root")).toBeVisible();
});

test("toque escolhe herói e criatura sem arrastar", async ({ browser }) => {
	test.setTimeout(45_000);
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await context.newPage();
	try {
		await page.goto("/");
		await page.evaluate(() => {
			const dispatch = (
				window as unknown as { __dispatch: (action: unknown) => void }
			).__dispatch;
			dispatch({
				type: "START_GAME",
				payload: {
					heroCardIds: ["hero_crimson_barbarian"],
					mode: "cooperative",
					difficulty: "normal",
					seed: 42,
				},
			});
		});
		const roomChoice = page.getByRole("dialog", { name: "Tochas Mortas" });
		await expect(roomChoice).toBeVisible();
		await roomChoice.getByRole("button", { name: "Escolher" }).last().tap();
		const readState = () =>
			page.evaluate(async () => {
				const modulePath = "/src/ui/store/elfStore.ts";
				const { getElfGameState } = await import(modulePath);
				const state = getElfGameState();
				return {
					status: state.status,
					phase: state.combat.phase,
					enemyCount: state.activeEnemies.filter(
						(enemy: { status: string }) => enemy.status === "active",
					).length,
					selectedHeroId: state.combat.selectedHeroId,
					actionTypes: state.actionLog.map(
						(entry: { action: { type: string } }) => entry.action.type,
					),
				};
			});
		await expect
			.poll(async () => (await readState()).status, { timeout: 12_000 })
			.toBe("HERO_ACTION");
		await expect
			.poll(async () => (await readState()).enemyCount)
			.toBeGreaterThan(0);
		const hero = page.locator(".game-board-hero-strip button").first();
		await hero.tap();
		await expect
			.poll(async () => (await readState()).phase)
			.toBe("selecting_target");
		await hero.tap({ timeout: 5_000 });
		await page.getByRole("button", { name: "Preparar habilidade" }).tap({ timeout: 5_000 });
		await expect(page.getByRole("button", { name: "Cancelar preparação" })).toBeVisible({ timeout: 5_000 });
		await page.getByRole("button", { name: "Fechar herói em foco" }).tap({
			position: { x: 5, y: 5 }, timeout: 5_000,
		});
		const enemy = page.locator(".game-board-active-cards button").nth(1);
		await enemy.tap();
		await expect
			.poll(async () =>
				(await readState()).actionTypes.includes("CHOOSE_TARGET"),
			)
			.toBe(true);
		await expect(page.getByRole("dialog", { name: "Fúria Rubra" })).toHaveCount(0);
		const dice = page.getByRole("dialog", {
			name: "Resultado da rolagem de dados",
		});
		await expect(dice).toBeVisible({ timeout: 10_000 });
		const diceBounds = await dice.boundingBox();
		expect(diceBounds).not.toBeNull();
		expect(diceBounds!.x).toBeGreaterThanOrEqual(0);
		expect(diceBounds!.x + diceBounds!.width).toBeLessThanOrEqual(390);
		await page.screenshot({ path: "test-results/layout-dice-portrait.png" });
		await expect(dice.getByRole("button", { name: "Resolver ataque" })).toBeEnabled({ timeout: 15_000 });
		const attackGeometry = await page.evaluate(async () => {
			const modulePath = "/src/ui/store/elfStore.ts";
			const { getElfGameState } = await import(modulePath);
			const roll = getElfGameState().combat.lastRoll;
			if (!roll || roll.heroTotal === roll.enemyTotal) return null;
			const source = document
				.querySelector(
					roll.heroTotal > roll.enemyTotal
						? ".game-card--hero"
						: ".game-card--enemy",
				)
				?.getBoundingClientRect();
			const target = document
				.querySelector(
					roll.heroTotal > roll.enemyTotal
						? ".game-card--enemy"
						: ".game-card--hero",
				)
				?.getBoundingClientRect();
			if (!source || !target) throw new Error("Attack cards have no bounds");
			const geometry = {
				source: {
					left: source.left,
					top: source.top,
					width: source.width,
					height: source.height,
				},
				target: {
					x: target.left + target.width / 2,
					y: target.top + target.height / 2,
				},
			};
			const observer = new MutationObserver(() => {
				const card = document.querySelector<HTMLElement>(
					".card-attack-animation__card",
				);
				if (!card) return;
				(
					window as unknown as { __attackCoordinates: unknown }
				).__attackCoordinates = {
					left: Number.parseFloat(card.style.left),
					top: Number.parseFloat(card.style.top),
					width: Number.parseFloat(card.style.width),
					height: Number.parseFloat(card.style.height),
					x: Number.parseFloat(
						card.style.getPropertyValue("--attack-travel-x"),
					),
					y: Number.parseFloat(
						card.style.getPropertyValue("--attack-travel-y"),
					),
				};
				observer.disconnect();
			});
			observer.observe(document.body, { childList: true, subtree: true });
			return geometry;
		});
		if (!attackGeometry) {
			const tied = await page.evaluate(async () => {
				const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
				const roll = getElfGameState().combat.lastRoll;
				return !!roll && roll.heroTotal === roll.enemyTotal;
			});
			expect(tied).toBe(true);
		}
		await dice.getByRole("button", { name: "Resolver ataque" }).tap();
		if (attackGeometry) {
			await expect
				.poll(() =>
					page.evaluate(
						() =>
							(window as unknown as { __attackCoordinates?: unknown })
								.__attackCoordinates,
					),
				)
				.toBeTruthy();
			const rendered = await page.evaluate(
				() =>
					(
						window as unknown as {
							__attackCoordinates: {
								left: number;
								top: number;
								width: number;
								height: number;
								x: number;
								y: number;
							};
						}
					).__attackCoordinates,
			);
			expect(Math.abs(rendered.left - attackGeometry.source.left)).toBeLessThan(
				2,
			);
			expect(Math.abs(rendered.top - attackGeometry.source.top)).toBeLessThan(
				2,
			);
			expect(
				Math.abs(rendered.width - attackGeometry.source.width),
			).toBeLessThan(2);
			expect(
				Math.abs(rendered.height - attackGeometry.source.height),
			).toBeLessThan(2);
			const expectedX =
				(attackGeometry.target.x -
					attackGeometry.source.left -
					attackGeometry.source.width / 2) *
				0.82;
			const expectedY =
				(attackGeometry.target.y -
					attackGeometry.source.top -
					attackGeometry.source.height / 2) *
				0.82;
			expect(Math.abs(rendered.x - expectedX)).toBeLessThan(2);
			expect(Math.abs(rendered.y - expectedY)).toBeLessThan(2);
		}
		await expect(dice).toHaveCount(0);
		await expect
			.poll(async () =>
				(await readState()).actionTypes.includes("RESOLVE_ATTACK"),
			)
			.toBe(true);
	} finally {
		await context.close();
	}
});

test("inventário e telas finais mantêm ações alcançáveis em telas pequenas", async ({
	browser,
}) => {
	test.setTimeout(60_000);
	const context = await browser.newContext({
		viewport: { width: 360, height: 800 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await context.newPage();
	try {
		for (const viewport of [
			{ width: 360, height: 800, name: "portrait" },
			{ width: 667, height: 375, name: "landscape" },
		]) {
			await page.setViewportSize(viewport);
			await page.goto("/");
			await page.evaluate(() => {
				(
					window as unknown as { __dispatch: (action: unknown) => void }
				).__dispatch({
					type: "START_GAME",
					payload: {
						heroCardIds: ["hero_crimson_barbarian"],
						mode: "cooperative",
						difficulty: "normal",
						seed: 42,
					},
				});
			});
			const roomChoice = page.getByRole("dialog", { name: "Tochas Mortas" });
			await expect(roomChoice).toBeVisible();
			await roomChoice.getByRole("button", { name: "Escolher" }).last().tap();
			await expect
				.poll(() =>
					page.evaluate(async () => {
						const modulePath = "/src/ui/store/elfStore.ts";
						const { getElfGameState } = await import(modulePath);
						return getElfGameState().status;
					}),
				)
				.toBe("HERO_ACTION");
			await expect(
				page.locator(".game-board-hero-strip button").first(),
			).toBeVisible();
			const rewardItemId = await page.evaluate(async () => {
				const modulePath = "/src/ui/store/elfStore.ts";
				const { getElfGameState } = await import(modulePath);
				const state = getElfGameState();
				const itemId = state.decks.itemDeck.available[0];
				(
					window as unknown as { __loadGameState: (state: unknown) => void }
				).__loadGameState({
					...state,
					status: "REWARD_PHASE",
					pendingRewards: [
						{ type: "item", cardId: itemId, requiresBearer: false },
					],
					decks: {
						...state.decks,
						itemDeck: {
							...state.decks.itemDeck,
							available: state.decks.itemDeck.available.slice(1),
						},
					},
				});
				return itemId;
			});
			expect(rewardItemId).toBeTruthy();
			const showStatus = (status: string) =>
				page.evaluate(async (nextStatus) => {
					const modulePath = "/src/ui/store/elfStore.ts";
					const { getElfGameState } = await import(modulePath);
					(
						window as unknown as { __loadGameState: (state: unknown) => void }
					).__loadGameState({
						...getElfGameState(),
						status: nextStatus,
						pendingSkillChoice: undefined,
						pendingTriggerInterrupt: undefined,
					});
				}, status);
			await expect
				.poll(() =>
					page.evaluate(async () => {
						const modulePath = "/src/ui/store/elfStore.ts";
						const { getElfGameState } = await import(modulePath);
						return getElfGameState().status;
					}),
				)
				.toBe("REWARD_PHASE");
			const inventory = page.locator(".inventory-dialog");
			await expect(inventory).toBeVisible();
			await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
			await page.screenshot({
				path: `test-results/layout-reward-${viewport.name}.png`,
			});
			await page.getByRole("button", { name: "Guardar" }).tap();
			await expect
				.poll(() =>
					page.evaluate(async (itemId) => {
						const modulePath = "/src/ui/store/elfStore.ts";
						const { getElfGameState } = await import(modulePath);
						return getElfGameState().heroes[0]?.backpack.includes(itemId);
					}, rewardItemId!),
				)
				.toBe(true);
			await inventory.evaluate((element) => {
				element.scrollTop = element.scrollHeight;
			});
			await page
				.getByRole("button", { name: /Mochila de Ankhar Varkun/ })
				.tap();
			await expect(page.getByRole("button", { name: "Equipar" })).toBeVisible();
			await page.getByRole("button", { name: "Equipar" }).tap();
			await expect
				.poll(() =>
					page.evaluate(async (itemId) => {
						const modulePath = "/src/ui/store/elfStore.ts";
						const { getElfGameState } = await import(modulePath);
						return Object.values(
							getElfGameState().heroes[0]?.activeItems ?? {},
						).includes(itemId);
					}, rewardItemId!),
				)
				.toBe(true);
			await expect(
				page.getByRole("button", { name: "Finalizar arrumação" }),
			).toBeVisible();
			await page
				.getByRole("button", { name: /Detalhes de Ankhar Varkun/ })
				.click();
			const equipment = page.getByRole("dialog", {
				name: /Detalhes de Ankhar Varkun/,
			});
			await expect(equipment).toBeVisible();
			await expect(
				equipment.locator(".inventory-hero-modal__equipment"),
			).toHaveCount(5);
			await equipment.getByRole("button", { name: "Fechar detalhes" }).click();
			await expect(equipment).toHaveCount(0);
			await inventory.evaluate((element) => {
				element.scrollTop = 0;
			});
			await page.screenshot({
				path: `test-results/layout-inventory-${viewport.name}.png`,
			});

			await showStatus("VICTORY");
			await expect(
				page.getByRole("heading", { name: "Vitória" }),
			).toBeVisible();
			await page.screenshot({
				path: `test-results/layout-victory-top-${viewport.name}.png`,
			});
			await page
				.getByRole("button", { name: "Voltar ao menu" })
				.scrollIntoViewIfNeeded();
			await page.screenshot({
				path: `test-results/layout-victory-${viewport.name}.png`,
			});
			await showStatus("DEFEAT");
			await expect(
				page.getByRole("heading", { name: "Derrota" }),
			).toBeVisible();
			await page.locator(".end-card").evaluate((element) => {
				element.scrollTop = 0;
			});
			await page.screenshot({
				path: `test-results/layout-defeat-top-${viewport.name}.png`,
			});
			await page
				.getByRole("button", { name: "Tentar novamente" })
				.scrollIntoViewIfNeeded();
			await page.screenshot({
				path: `test-results/layout-defeat-${viewport.name}.png`,
			});
		}
	} finally {
		await context.close();
	}
});
