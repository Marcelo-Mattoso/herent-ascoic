// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("./registry", () => {
	const locales = [
		{ code: "pt-BR", name: "Portuguese", nativeName: "Português", direction: "ltr", status: "published", version: 1 },
		{ code: "fr-FR", name: "French", nativeName: "Français", direction: "ltr", status: "published", version: 1 },
		{ code: "de-DE", name: "German", nativeName: "Deutsch", direction: "ltr", status: "published", version: 1 },
	];
	return { publishedLocales: () => locales, publishedLocale: (code: string) => locales.find((item) => item.code === code) };
});

import { changeLocale, i18n, translate } from "./index";

function MountedState() {
	useTranslation();
	const [count, setCount] = useState(0);
	return <button type="button" onClick={() => setCount((value) => value + 1)}>{translate("common:language.title")} {count}</button>;
}

afterEach(async () => { vi.restoreAllMocks(); await changeLocale("pt-BR"); });

test("troca carregada atualiza a tela montada, preserva estado e usa fallback", async () => {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
		const namespace = String(url).split("/").at(-1)?.replace(".json", "");
		return { ok: true, json: async () => namespace === "common" ? { language: { title: "LOCALIZED" } } : {} } as Response;
	});
	render(<MountedState />);
	fireEvent.click(screen.getByRole("button", { name: "Idioma 0" }));
	expect(await changeLocale("fr-FR")).toBe(true);
	await waitFor(() => expect(screen.getByRole("button", { name: "LOCALIZED 1" })).toBeTruthy());
	expect(translate("common:pageTitle")).toBe("Ascensão Heróica — A Fornalha Sombria");
	expect(document.documentElement.lang).toBe("fr-FR");
	expect(i18n.language).toBe("fr-FR");
});

test("falha de recurso mantém o idioma anterior", async () => {
	vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
	expect(await changeLocale("de-DE")).toBe(false);
	expect(i18n.language).toBe("pt-BR");
	expect(document.documentElement.lang).toBe("pt-BR");
	expect(warning).toHaveBeenCalled();
});
