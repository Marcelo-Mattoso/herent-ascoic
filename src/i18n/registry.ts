export interface LocaleMeta {
	readonly code: string;
	readonly name: string;
	readonly nativeName: string;
	readonly direction: "ltr" | "rtl";
	readonly status: "draft" | "review" | "published";
	readonly version: 1;
	readonly retained?: Readonly<Record<string, string>>;
}

// Vite resolves this glob at build time. Adding an approved locale folder needs no TS edit.
const discovered = import.meta.glob<LocaleMeta>("../../locales/*/meta.json", { eager: true, import: "default" });

export function publishedLocales(): readonly LocaleMeta[] {
	return Object.entries(discovered)
		.filter(([path, meta]) => meta.status === "published" && path.endsWith(`/${meta.code}/meta.json`))
		.map(([, meta]) => meta)
		.sort((a, b) => a.nativeName.localeCompare(b.nativeName, a.code));
}

export function publishedLocale(code: string): LocaleMeta | undefined {
	return publishedLocales().find((locale) => locale.code === code);
}
