import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditRunDirectory, writeAudit } from "./run";
import { LEVELING_RUNS_ROOT } from "../localLevelingReports";

describe("saída do CLI de auditoria P0", () => {
	it("cria uma pasta com data e restringe --output às execuções locais", () => {
		const now = new Date("2026-11-13T21:04:05.123Z");
		expect(auditRunDirectory([], now)).toBe(join(LEVELING_RUNS_ROOT, "skill-audit-2026-11-13T21-04-05-123Z"));
		expect(auditRunDirectory(["--", "--output", "tools/bot/runs/audit-2026-11-13"], now))
			.toBe(join(LEVELING_RUNS_ROOT, "audit-2026-11-13"));
		expect(() => auditRunDirectory(["--output", "../out"], now)).toThrow(/tools\/bot\/runs/);
		expect(() => auditRunDirectory(["--unknown"], now)).toThrow(/Uso:/);
	});

	it("grava JSON e HTML em diretório inexistente e retorna bloqueadores", async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), "ascensao-heroica-skill-audit-"));
		const dir = join(tempRoot, "runs", "audit-2026-11-13");
		try {
			const result = await writeAudit(dir);
			expect(result.json).toBe(join(dir, "skill-audit.json"));
			expect(result.html).toBe(join(dir, "skill-audit.html"));
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
