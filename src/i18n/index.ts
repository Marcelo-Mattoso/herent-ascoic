import i18next, { type TOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import ptCommon from "../../locales/pt-BR/common.json";
import ptGame from "../../locales/pt-BR/game.json";
import ptCards from "../../locales/pt-BR/cards.json";
import ptSkills from "../../locales/pt-BR/skills.json";
import ptTutorials from "../../locales/pt-BR/tutorials.json";
import ptJournal from "../../locales/pt-BR/journal.json";
import { publishedLocale, publishedLocales } from "./registry";
import { publicAssetUrl } from "@/ui/publicAssetUrl";

export const LOCALE_STORAGE_KEY = "ascensao-heroica:locale:v1";
const namespaces = ["common", "game", "cards", "skills", "tutorials", "journal"] as const;
type Namespace = (typeof namespaces)[number];
const resources = {
	"pt-BR": { common: ptCommon, game: ptGame, cards: ptCards, skills: ptSkills, tutorials: ptTutorials, journal: ptJournal },
};

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
	resources,
	lng: "pt-BR",
	fallbackLng: "pt-BR",
	supportedLngs: publishedLocales().map((locale) => locale.code),
	ns: [...namespaces],
	defaultNS: "common",
	initAsync: false,
	returnNull: false,
	interpolation: { escapeValue: false }, // React escapes text nodes and attributes.
	react: { useSuspense: false },
});

const cache = new Map<string, Promise<Record<Namespace, object>>>();
let switchSequence = 0;

async function loadResources(code: string): Promise<Record<Namespace, object>> {
	if (code === "pt-BR") return resources["pt-BR"];
	let pending = cache.get(code);
	if (!pending) {
		pending = Promise.all(namespaces.map(async (namespace) => {
			const response = await fetch(publicAssetUrl(`generated/locales/${code}/${namespace}.json`));
			if (!response.ok) throw new Error(`Recurso ausente: ${code}/${namespace}`);
			const value: unknown = await response.json();
			if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Recurso inválido: ${code}/${namespace}`);
			return [namespace, value] as const;
		})).then((entries) => Object.fromEntries(entries) as Record<Namespace, object>);
		cache.set(code, pending);
		pending.catch(() => cache.delete(code));
	}
	return pending;
}

export async function changeLocale(code: string): Promise<boolean> {
	const meta = publishedLocale(code);
	if (!meta) return false;
	const request = ++switchSequence;
	try {
		const loaded = await loadResources(code);
		if (request !== switchSequence) return false;
		for (const namespace of namespaces) i18n.addResourceBundle(code, namespace, loaded[namespace], true, true);
		await i18n.changeLanguage(code);
		if (request !== switchSequence) return false;
		document.documentElement.lang = code;
		document.documentElement.dir = meta.direction;
		document.title = translate("common:pageTitle");
		try { localStorage.setItem(LOCALE_STORAGE_KEY, code); } catch { /* preferência opcional */ }
		return true;
	} catch (error) {
		console.warn("Não foi possível carregar o idioma", code, error);
		return false;
	}
}

export function initialLocale(): string {
	let saved: string | null = null;
	try { saved = localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* sem armazenamento */ }
	if (saved && publishedLocale(saved)) return saved;
	for (const candidate of navigator.languages ?? [navigator.language]) {
		if (publishedLocale(candidate)) return candidate;
		const sameLanguage = publishedLocales().find((locale) => locale.code.split("-")[0] === candidate.split("-")[0]);
		if (sameLanguage) return sameLanguage.code;
	}
	return "pt-BR";
}

export async function restoreLocale() {
	const code = initialLocale();
	if (code !== "pt-BR") await changeLocale(code);
	else {
		document.documentElement.lang = "pt-BR";
		document.documentElement.dir = "ltr";
		document.title = translate("common:pageTitle");
	}
}

const missing = new Set<string>();
export function translate(key: string, options?: TOptions): string {
	if (!i18n.exists(key, { ...options, lng: "pt-BR" })) {
		if (!missing.has(key)) { missing.add(key); console.warn(`Chave de localização ausente: ${key}`); }
		return "Texto indisponível";
	}
	return String(i18n.t(key, options));
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat(i18n.language).format(value);
}
