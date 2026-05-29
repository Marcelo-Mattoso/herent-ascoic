// Parsers centralizados para o campo `value` heterogêneo do catálogo.
// Cada handler valida o formato e loga [VALUE INVÁLIDO] se não casar.

export function parseNumber(value: number | string | null): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const n = Number(value);
		if (!Number.isNaN(n)) return n;
	}
	return null;
}

// "a/b" → { a, b }
export function parseSlashPair(
	value: number | string | null,
): { a: number; b: number } | null {
	if (typeof value !== "string") return null;
	const parts = value.split("/");
	if (parts.length !== 2) return null;
	const a = Number(parts[0]);
	const b = Number(parts[1]);
	if (Number.isNaN(a) || Number.isNaN(b)) return null;
	return { a, b };
}

// "a/b/c/d" → [a, b, c, d]
export function parseSlashQuad(
	value: number | string | null,
): [number, number, number, number] | null {
	if (typeof value !== "string") return null;
	const parts = value.split("/");
	if (parts.length !== 4) return null;
	const ns = parts.map(Number);
	if (ns.some(Number.isNaN)) return null;
	return ns as [number, number, number, number];
}

// "full/b" → { full: true, b }
export function parseFullOr(
	value: number | string | null,
): { full: true; alt: number } | null {
	if (typeof value !== "string") return null;
	const parts = value.split("/");
	if (parts.length !== 2 || parts[0] !== "full") return null;
	const alt = Number(parts[1]);
	if (Number.isNaN(alt)) return null;
	return { full: true, alt };
}
