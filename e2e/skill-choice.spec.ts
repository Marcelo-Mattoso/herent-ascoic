import { expect, test } from "@playwright/test";

test("o jogador examina duas cartas reveladas antes de confirmar uma", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");

	// Injeta somente o estado de apresentação da escolha para exercitar o fluxo
	// visual sem depender de uma sequência aleatória de salas no teste de browser.
	await page.evaluate(async () => {
		const modulePath = "/src/ui/store/elfStore.ts";
		const { getElfGameState, setElfStoreProps } = await import(modulePath);
		setElfStoreProps({
			gameState: {
				...getElfGameState(),
				status: "HERO_ACTION",
				pendingSkillChoice: {
					skillId: "skill_forge_spoils",
					prompt: "Escolha 1 carta para ficar (as outras são descartadas):",
					kind: "draw_and_choose",
					discardDeck: "itemDeck",
					options: [
						{ id: "item_rusty_dagger", label: "item_rusty_dagger" },
						{ id: "item_cracked_shield", label: "item_cracked_shield" },
					],
				},
			},
		});
	});

	await expect(page.locator(".game-board-root")).toBeVisible();
	const cards = page.locator(".skill-choice-option--card");
	await expect(cards).toHaveCount(2);
	await expect(
		page.getByRole("img", { name: "Adaga Enferrujada" }),
	).toBeVisible();
	await expect(page.getByRole("img", { name: "Escudo Rachado" })).toBeVisible();
	await expect
		.poll(() =>
			cards
				.locator("img")
				.evaluateAll((images) =>
					images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
				),
		)
		.toBe(true);
	await cards
		.locator("img")
		.evaluateAll((images) =>
			Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
		);
	await page.screenshot({ path: "test-results/skill-choice-desktop.png" });
	await page.setViewportSize({ width: 720, height: 390 });
	await expect(cards).toHaveCount(2);
	expect(
		await page
			.locator(".skill-choice-options")
			.evaluate((grid) => grid.scrollWidth <= grid.clientWidth),
	).toBe(true);
	await page.screenshot({ path: "test-results/skill-choice-small.png" });
	await page.setViewportSize({ width: 1280, height: 720 });

	await page
		.getByRole("button", { name: "Examinar carta: Adaga Enferrujada" })
		.click();
	await expect(
		page.getByRole("dialog", { name: "Adaga Enferrujada" }),
	).toBeVisible();
	await page
		.getByRole("dialog", { name: "Adaga Enferrujada" })
		.locator(".modal-close")
		.click();
	await expect(
		page.getByRole("dialog", { name: "Adaga Enferrujada" }),
	).toHaveCount(0);
	await expect(cards).toHaveCount(2);
	await cards.first().getByRole("button", { name: "Guardar" }).click();
	await expect(cards).toHaveCount(0);
	expect(errors).toEqual([]);
});
