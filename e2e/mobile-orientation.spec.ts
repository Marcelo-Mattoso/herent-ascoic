import { expect, test } from "@playwright/test";

test("celular em retrato solicita paisagem e retoma o mesmo jogo após girar", async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await context.newPage();
	try {
		await page.goto("/");
		await expect(page.getByRole("button", { name: "JOGAR" })).toBeVisible();
		await expect(page.locator(".orientation-gate")).toHaveCount(0);
		await page.evaluate(() => {
			(window as unknown as { __dispatch: (action: unknown) => void }).__dispatch({
				type: "START_GAME",
				payload: {
					heroCardIds: ["hero_crimson_barbarian"],
					mode: "cooperative",
					difficulty: "normal",
					seed: 2,
				},
			});
		});
		const gate = page.getByRole("alertdialog", { name: "Gire seu celular" });
		await expect(gate).toBeVisible();
		await expect(gate).toContainText("horizontal");
		await expect(page.locator(".game-viewport")).toHaveAttribute("inert", "");
		await expect(page.locator(".game-viewport")).toHaveAttribute("aria-hidden", "true");
		await page.screenshot({ path: "test-results/mobile-portrait-rotate-notice.png" });
		const readStatus = () => page.evaluate(async () => {
			const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
			return getElfGameState().game.status;
		});
		await expect.poll(readStatus, { timeout: 12_000 }).toBe("HERO_ACTION");
		const statusBeforeRotation = await readStatus();

		await page.setViewportSize({ width: 844, height: 390 });
		await expect(gate).toHaveCount(0);
		await expect(page.locator(".game-viewport")).not.toHaveAttribute("inert");
		await expect(page.locator(".game-viewport")).toHaveAttribute("data-game-layout", "compact-landscape");
		expect(await readStatus()).toBe(statusBeforeRotation);
		const hero = page.locator(".game-board-hero-strip button").first();
		await hero.tap();
		await expect(page.locator(".game-board-root")).toBeVisible();
		await page.screenshot({ path: "test-results/mobile-landscape-board.png" });

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(gate).toBeVisible();
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(gate).toHaveCount(0);
		expect(await readStatus()).toBe(statusBeforeRotation);
	} finally {
		await context.close();
	}
});

test("tabuleiro horizontal cabe em celulares compactos sem rolar a página", async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 568, height: 320 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await context.newPage();
	try {
		await page.goto("/");
		await page.evaluate(() => {
			(window as unknown as { __dispatch: (action: unknown) => void }).__dispatch({
				type: "START_GAME",
				payload: {
					heroCardIds: ["hero_crimson_barbarian"],
					mode: "cooperative",
					difficulty: "normal",
					seed: 2,
				},
			});
		});
		for (const size of [
			{ width: 568, height: 320 },
			{ width: 667, height: 375 },
			{ width: 844, height: 390 },
			{ width: 915, height: 412 },
		]) {
			await page.setViewportSize(size);
			await expect(page.locator(".orientation-gate")).toHaveCount(0);
			await expect(page.locator(".game-viewport")).toHaveAttribute("data-game-layout", "compact-landscape");
			await expect(page.getByRole("group", { name: "Ações da partida" })).toBeVisible();
			const metrics = await page.evaluate(() => {
				const root = document.documentElement;
				const surface = document.querySelector<HTMLElement>(".game-board-surface");
				if (!surface) throw new Error("Missing board");
				const buttons = Array.from(document.querySelectorAll<HTMLElement>(".game-portable-action-bar button"))
					.filter((button) => button.getClientRects().length > 0);
				return {
					scrollWidth: root.scrollWidth, clientWidth: root.clientWidth,
					scrollHeight: root.scrollHeight, clientHeight: root.clientHeight,
					boardScrollWidth: surface.scrollWidth, boardClientWidth: surface.clientWidth,
					boardScrollHeight: surface.scrollHeight, boardClientHeight: surface.clientHeight,
					buttons: buttons.map((button) => button.getBoundingClientRect().toJSON()),
				};
			});
			expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
			expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
			expect(metrics.boardScrollWidth).toBeLessThanOrEqual(metrics.boardClientWidth + 1);
			expect(metrics.boardScrollHeight).toBeLessThanOrEqual(metrics.boardClientHeight + 1);
			expect(metrics.buttons.length).toBeGreaterThanOrEqual(3);
			for (const bounds of metrics.buttons) {
				expect(bounds.height).toBeGreaterThanOrEqual(44);
				expect(bounds.x).toBeGreaterThanOrEqual(0);
				expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width + 1);
				expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height + 1);
			}
			await page.screenshot({ path: `test-results/mobile-landscape-${size.width}x${size.height}.png` });
		}
	} finally {
		await context.close();
	}
});
