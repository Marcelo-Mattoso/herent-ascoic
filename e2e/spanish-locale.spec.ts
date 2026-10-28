import { expect, test } from "@playwright/test";

test("título oficial em inglês é Heroic Ascension", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	await page.getByLabel("Idioma da interface").selectOption("en-US");
	await expect(page).toHaveTitle("Heroic Ascension — The Dark Forge");
	await expect(page.getByText("Heroic Ascension", { exact: true }).first()).toBeVisible();
});

test("espanhol traduz menus e jogo e mantém preferência ao atualizar", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Abrir menu global" }).click();
	const selector = page.getByLabel("Idioma da interface");
	await expect(selector.locator('option[value="es-ES"]')).toHaveText("Español (España)");
	await selector.selectOption("es-ES");
	await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
	await expect(page).toHaveTitle("Ascensión Heroica — La Forja Oscura");
	await page.getByRole("button", { name: "Cerrar menú", exact: true }).click();
	await page.getByRole("button", { name: "JUGAR", exact: true }).click();
	await expect(page.getByText("Preparar expedición")).toBeVisible();
	await page.getByRole("button", { name: "Abrir menú general" }).click();
	await expect(page.getByLabel("Idioma de la interfaz")).toHaveValue("es-ES");
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
	await expect(page).toHaveTitle("Ascensión Heroica — La Forja Oscura");
	await page.getByRole("button", { name: "Abrir menú general" }).click();
	await expect(page.getByLabel("Idioma de la interfaz")).toHaveValue("es-ES");
});
