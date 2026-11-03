import { expect, test, type Page } from "@playwright/test";
import { mutateGame, readGame } from "./state";

async function waitForCombat(page: Page) {
	await expect.poll(() => readGame(page, "(s) => s.game.status")).toBe("HERO_ACTION");
}

async function setEnemies(
	page: Page,
	status: string,
	enemies: readonly Record<string, unknown>[],
	combat: Record<string, unknown>,
) {
	await mutateGame(
		page,
		`(state, access, engine, { status, enemies, combat }) => {
			const hero = access.heroesOf(state)[0];
			const enemy = access.enemiesOf(state).find((item) => item.status === "active");
			if (!hero || !enemy) throw new Error("Combat fixture unavailable");
			const nextHero = { ...hero, currentLife: 20, maxLife: 20 };
			const nextEnemies = enemies.map((patch) => ({ ...enemy, ...patch }));
			let world = engine.gameOf(state).world;
			world = access.spawnHero(world, nextHero);
			for (const unit of nextEnemies) world = access.spawnEnemy(world, unit);
			return {
				state: engine.withGame(state, (g) => ({
					...g,
					world,
					status,
					heroes: [access.recordOfHero(nextHero)],
					activeEnemies: nextEnemies.map(access.recordOfEnemy),
					combat: { ...g.combat, ...combat, pairs: [{ heroId: hero.id, enemyId: "extra-0" }] },
				})),
			};
		}`,
		{ status, enemies, combat },
	);
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
	await setEnemies(page, "HERO_ACTION", [
		{ id: "extra-0", hitBonus: 0 },
		{ id: "extra-1", hitBonus: 1000, damage: 2 },
		{ id: "extra-2", hitBonus: 1000, damage: 2 },
	], { phase: "selecting_hero" });
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
	const feedback = await readGame<{ attacks: string[]; damage: number[] }>(page, `(s) => ({
		attacks: s.game.extraAttackFeedback?.map(({ enemyId }) => enemyId),
		damage: s.game.damageFeedback?.filter((entry) => entry.extraAttackId !== undefined).map(({ amount }) => amount),
	})`);
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
	await setEnemies(page, "DIRECT_DAMAGE", [
		{ id: "extra-0" },
		{ id: "extra-1", hitBonus: 1000, damage: 2 },
	], { lastRoll: null, pendingPhysicalRoll: undefined, extraEnemiesRemaining: undefined });
	const dice = page.getByRole("dialog", { name: "Resultado da rolagem de dados" });
	await expect(dice).toBeVisible();
	await expect(dice.getByRole("button", { name: "Resolver ataque" })).toBeEnabled({ timeout: 15_000 });
	const rolled = await readGame<{ extraAttack?: boolean; heroResults: number[] } | null>(page, "(s) => s.game.combat?.lastRoll");
	expect(rolled?.extraAttack).toBe(true);
	expect(rolled?.heroResults.every((value: number) => value >= 1 && value <= 6)).toBe(true);
	await dice.getByRole("button", { name: "Resolver ataque" }).click();
	await expect.poll(() => readGame(page, "(s) => s.game.extraAttackFeedback?.at(-1)?.enemyId")).toBe("extra-1");
	await expect(page.locator(".card-attack-animation")).toBeVisible();
});
