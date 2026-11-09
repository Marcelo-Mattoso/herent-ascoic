import fs from "node:fs";
import path from "node:path";

export const LEVELING_RUNS_ROOT = path.resolve("tools/bot/runs");

export type SavedReportKind = "simulation" | "catalog";

export interface SavedReportInfo {
	readonly id: string;
	readonly kind: SavedReportKind;
	readonly generatedAt: string;
	readonly completed: number | null;
	readonly expected: number | null;
}

export function assertLocalReportExecution(): void {
	if (process.env.CI || process.env.GITHUB_ACTIONS === "true" || process.env.NODE_ENV === "production") {
		throw new Error("Relatórios de leveling só podem ser gerados em desenvolvimento local, fora de CI/GitHub Actions e produção.");
	}
}

function isFolderId(id: string): boolean {
	return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,150}$/.test(id);
}

function reportPath(root: string, id: string): string | null {
	if (!isFolderId(id)) return null;
	const folder = path.join(root, id);
	const file = path.join(folder, "report.json");
	if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
	// Never follow symlinked directories or files outside the local reports root.
	if (fs.lstatSync(folder).isSymbolicLink() || fs.lstatSync(file).isSymbolicLink()) return null;
	return file;
}

function isReport(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const doc = value as Record<string, unknown>;
	return doc.schemaVersion === 1 && (doc.kind === "simulation" || doc.kind === "catalog") &&
		typeof doc.generatedAt === "string" && Number.isFinite(Date.parse(doc.generatedAt));
}

export function readSavedReport(root: string, id: string): Record<string, unknown> | null {
	const file = reportPath(root, id);
	if (!file || fs.statSync(file).size > 30 * 1024 * 1024) return null;
	try {
		const document: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		return isReport(document) ? document : null;
	} catch {
		return null;
	}
}

export function listSavedReports(root: string = LEVELING_RUNS_ROOT): SavedReportInfo[] {
	if (!fs.existsSync(root)) return [];
	return fs.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && isFolderId(entry.name))
		.flatMap((entry): SavedReportInfo[] => {
			const document = readSavedReport(root, entry.name);
			if (!document) return [];
			return [{
				id: entry.name,
				kind: document.kind as SavedReportKind,
				generatedAt: document.generatedAt as string,
				completed: typeof document.completed === "number" ? document.completed : null,
				expected: typeof document.expected === "number" ? document.expected : null,
			}];
		})
		.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}
