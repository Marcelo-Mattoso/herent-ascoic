import { expect, test } from "@playwright/test";

test("interrupção mostra carta e decisões acessíveis em telas pequenas", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto("/");
	await page.evaluate(async () => {
		const { getElfGameState, setElfStoreProps } = await import("/src/ui/store/elfStore.ts");
		setElfStoreProps({
			gameState: {
				...getElfGameState(),
				status: "HERO_ACTION",
				pendingTriggerInterrupt: {
					id: "e2e-trigger-1",
					skillId: "power_mighty_crimson_fury",
					event: "evt_damage_dealt",
					window: "after_damage",
					sourceKind: "hero",
					sourceCardId: "hero_crimson_barbarian",
					reason: "Pode ativar o poder.",
					description: "power_mighty_crimson_fury",
				},
			},
		});
	});
	const modal = page.getByRole("dialog", { name: "Fúria Rubra Poderosa" });
	await expect(modal).toBeVisible();
	const bounds = await modal.boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
	await modal.getByRole("button", { name: /Ver carta/ }).click();
	await expect(page.getByRole("dialog", { name: "Bárbaro Rubro" })).toBeVisible();
	await page.getByRole("dialog", { name: "Bárbaro Rubro" }).locator(".modal-close").click();
	await modal.getByRole("button", { name: "Ignorar" }).click();
	await expect(modal).toHaveCount(0);
	await page.setViewportSize({ width: 568, height: 320 });
	await page.evaluate(async () => {
		const { getElfGameState, setElfStoreProps } = await import("/src/ui/store/elfStore.ts");
		setElfStoreProps({ gameState: {
			...getElfGameState(),
			status: "HERO_ACTION",
			pendingTriggerInterrupt: {
				id: "e2e-trigger-2", skillId: "power_mighty_crimson_fury",
				event: "evt_damage_dealt", window: "after_damage",
				sourceKind: "hero", sourceCardId: "hero_crimson_barbarian",
				reason: "Pode ativar o poder.", description: "power_mighty_crimson_fury",
			},
		} });
	});
	await expect(modal).toBeVisible();
	const landscapeBounds = await modal.boundingBox();
	expect(landscapeBounds).not.toBeNull();
	expect(landscapeBounds!.y).toBeGreaterThanOrEqual(0);
	expect(landscapeBounds!.y + landscapeBounds!.height).toBeLessThanOrEqual(320);
	await modal.getByRole("button", { name: "Aplicar habilidade" }).click();
	await expect(modal).toHaveCount(0);
	expect(errors).toEqual([]);
});
