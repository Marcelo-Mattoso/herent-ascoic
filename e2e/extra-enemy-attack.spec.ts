import { expect, test, type Page } from "@playwright/test";

async function waitForCombat(page: Page) {
	await expect.poll(() => page.evaluate(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		return getElfGameState().status;
	})).toBe("HERO_ACTION");
}

test("inimigos excedentes atacam com animações sequenciais", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => {
		(window as unknown as { __dispatch: (action: unknown) => void }).__dispatch({
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"], mode: "cooperative", difficulty: "normal", seed: 42 },
		});
	});
	await expect(page.locator(".game-board-root")).toBeVisible();
	await waitForCombat(page);
	await page.evaluate(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		const state = getElfGameState();
		const hero = state.heroes[0];
		const enemy = state.activeEnemies.find((item) => item.status === "active");
		if (!hero || !enemy || !state.combat) throw new Error("Combat fixture unavailable");
		(window as unknown as { __loadGameState: (state: unknown) => void }).__loadGameState({
			...state,
			status: "HERO_ACTION",
			heroes: [{ ...hero, currentLife: 20, maxLife: 20 }],
			activeEnemies: [
				{ ...enemy, id: "extra-0", hitBonus: 0 },
				{ ...enemy, id: "extra-1", hitBonus: 1000, damage: 2 },
				{ ...enemy, id: "extra-2", hitBonus: 1000, damage: 2 },
			],
			combat: {
				...state.combat,
				phase: "selecting_hero",
				pairs: [{ heroId: hero.id, enemyId: "extra-0" }],
			},
		});
	});
	await expect(page.locator(".game-card--enemy")).toHaveCount(3);
	await page.evaluate(() => {
		const record = window as unknown as { __extraVisualCount: number; __dispatch: (action: unknown) => void };
		record.__extraVisualCount = 0;
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) for (const added of mutation.addedNodes) {
				if (added instanceof Element && (added.matches(".card-attack-animation") || added.querySelector(".card-attack-animation"))) {
					record.__extraVisualCount++;
				}
			}
			if (record.__extraVisualCount >= 2) observer.disconnect();
		});
		observer.observe(document.body, { childList: true, subtree: true });
		record.__dispatch({ type: "DIRECT_DAMAGE" });
	});
	await expect.poll(() => page.evaluate(() => (window as unknown as { __extraVisualCount: number }).__extraVisualCount)).toBe(2);
	const feedback = await page.evaluate(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		const state = getElfGameState();
		return {
			attacks: state.extraAttackFeedback?.map(({ enemyId }) => enemyId),
			damage: state.damageFeedback?.filter((entry) => entry.extraAttackId !== undefined).map(({ amount }) => amount),
		};
	});
	expect(feedback.attacks).toEqual(["extra-1", "extra-2"]);
	expect(feedback.damage).toEqual([2, 2]);
});

test("ataque excedente usa as faces físicas antes da animação", async ({ page }) => {
	test.setTimeout(45_000);
	await page.goto("/");
	await page.evaluate(() => {
		(window as unknown as { __dispatch: (action: unknown) => void }).__dispatch({
			type: "START_GAME",
			payload: { heroCardIds: ["hero_crimson_barbarian"], mode: "cooperative", difficulty: "normal", seed: 42 },
		});
	});
	await expect(page.locator(".game-board-root")).toBeVisible();
	await waitForCombat(page);
	await page.evaluate(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		const state = getElfGameState();
		const hero = state.heroes[0];
		const enemy = state.activeEnemies.find((item) => item.status === "active");
		if (!hero || !enemy || !state.combat) throw new Error("Combat fixture unavailable");
		(window as unknown as { __loadGameState: (state: unknown) => void }).__loadGameState({
			...state, status: "DIRECT_DAMAGE",
			heroes: [{ ...hero, currentLife: 20, maxLife: 20 }],
			activeEnemies: [
				{ ...enemy, id: "extra-0" },
				{ ...enemy, id: "extra-1", hitBonus: 1000, damage: 2 },
			],
			combat: { ...state.combat, pairs: [{ heroId: hero.id, enemyId: "extra-0" }], lastRoll: null,
				pendingPhysicalRoll: undefined, extraEnemiesRemaining: undefined },
		});
	});
	const dice = page.getByRole("dialog", { name: "Resultado da rolagem de dados" });
	await expect(dice).toBeVisible();
	await expect(dice.getByRole("button", { name: "Resolver ataque" })).toBeEnabled({ timeout: 15_000 });
	const rolled = await page.evaluate(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		return getElfGameState().combat?.lastRoll;
	});
	expect(rolled?.extraAttack).toBe(true);
	expect(rolled?.heroResults.every((value: number) => value >= 1 && value <= 6)).toBe(true);
	await dice.getByRole("button", { name: "Resolver ataque" }).click();
	await expect.poll(() => page.evaluate(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		return getElfGameState().extraAttackFeedback?.at(-1)?.enemyId;
	})).toBe("extra-1");
	await expect(page.locator(".card-attack-animation")).toBeVisible();
});
