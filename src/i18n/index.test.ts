// @vitest-environment jsdom
import { expect, test } from "vitest";
import { changeLocale, i18n, LOCALE_STORAGE_KEY, translate } from "./index";
import { publishedLocales } from "./registry";

test("registry lê os metadados publicados e preserva IDs técnicos", () => {
	const locales = publishedLocales();
	expect(locales.some((locale) => locale.code === "pt-BR")).toBe(true);
	expect(locales.every((locale) => locale.status === "published")).toBe(true);
	expect(translate("cards:hero_eternal_rest_cleric.name")).toBe("Clérigo do Descanso Eterno");
	expect(translate("skills:skill_crimson_fury.name")).toBe("Fúria Rubra");
	expect(i18n.language).toBe("pt-BR");
});

test("plural, parâmetros, chave ausente e idioma inválido", async () => {
	expect(translate("game:screens.setup.selectedHeroes", { count: 1 })).toBe("1 herói selecionado");
	expect(translate("game:screens.setup.selectedHeroes", { count: 2 })).toBe("2 heróis selecionados");
	expect(translate("game:screens.exploration.closeDrawer", { title: "Grupo" })).toBe("Fechar Grupo");
	expect(translate("common:missing.key")).toBe("Texto indisponível");
	expect(await changeLocale("xx-XX")).toBe(false);
	expect(i18n.language).toBe("pt-BR");
	expect(await changeLocale("pt-BR")).toBe(true);
	expect(document.documentElement.lang).toBe("pt-BR");
	expect(document.documentElement.dir).toBe("ltr");
	expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
});
