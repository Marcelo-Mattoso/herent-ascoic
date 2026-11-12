import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAudit } from "./run";

describe("saída do CLI de auditoria P0", () => {
	it("grava JSON e HTML em diretório inexistente e retorna bloqueadores", async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), "ascensao-heroica-skill-audit-"));
		const dir = join(tempRoot, "reports", "skill-audit");
		try {
			const result = await writeAudit(dir);
			expect(result.json).toBe(join(dir, "report.json"));
			expect(result.html).toBe(join(dir, "report.html"));
			const [json, html] = await Promise.all([
				readFile(result.json, "utf8"),
				readFile(result.html, "utf8"),
			]);
			const report = JSON.parse(json);
			expect(report.version).toBe(1);
			expect(report.summary.discoveredGrants).toBeGreaterThan(0);
			expect(report.runtimeScenarios.length).toBeGreaterThan(0);
			expect(report.groupProjectionScenarios.length).toBeGreaterThan(0);
			expect(html).toContain("Auditoria de habilidades");
			expect(Array.isArray(result.blockers)).toBe(true);
		} finally {
			await rm(tempRoot, { recursive: true, force: true });
		}
	});
});
