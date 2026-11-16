import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export interface ReportProvenance {
	readonly gitCommit: string | null;
	readonly gitBranch: string | null;
	readonly workingTreeClean: boolean | null;
	readonly catalogSha256: string;
	/** Only clean, identifiable snapshots can be compared/resumed safely. */
	readonly comparable: boolean;
}

function git(args: readonly string[]): string | null {
	try {
		return execFileSync("git", [...args], {
			encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000,
		}).trim();
	} catch {
		return null;
	}
}

export function reportProvenance(catalog: unknown): ReportProvenance {
	const commit = git(["rev-parse", "HEAD"]);
	const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
	const status = git(["status", "--porcelain", "--untracked-files=normal"]);
	const workingTreeClean = status === null ? null : status.length === 0;
	const catalogSha256 = createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
	return {
		gitCommit: commit,
		gitBranch: branch,
		workingTreeClean,
		catalogSha256,
		comparable: Boolean(commit && workingTreeClean === true),
	};
}

/** A resumed run must not silently combine different game/bot snapshots. */
export function assertSameReportProvenance(
	saved: ReportProvenance | null,
	current: ReportProvenance,
): void {
	if (!saved || !saved.comparable || !current.comparable ||
		!saved.gitCommit || saved.gitCommit !== current.gitCommit ||
		!saved.catalogSha256 || saved.catalogSha256 !== current.catalogSha256) {
		throw new Error("Checkpoint incompatível: faça a retomada no mesmo commit, com árvore Git limpa e catálogo idêntico. Inicie uma nova execução se o código mudou.");
	}
}
