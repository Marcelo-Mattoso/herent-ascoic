import { describe, expect, it } from "vitest";
import { assertSameReportProvenance, type ReportProvenance } from "./reportProvenance";

const clean: ReportProvenance = {
	gitCommit: "0123456789abcdef",
	gitBranch: "dev",
	workingTreeClean: true,
	catalogSha256: "abc",
	comparable: true,
};

describe("proveniência de relatórios locais", () => {
	it("permite retomar somente um snapshot idêntico", () => {
		expect(() => assertSameReportProvenance(clean, { ...clean, gitBranch: "leveling" })).not.toThrow();
	});

	it("recusa mistura de commits, catálogos e árvores sujas", () => {
		expect(() => assertSameReportProvenance(clean, { ...clean, gitCommit: "outro" })).toThrow();
		expect(() => assertSameReportProvenance(clean, { ...clean, catalogSha256: "outro" })).toThrow();
		expect(() => assertSameReportProvenance(clean, { ...clean, comparable: false, workingTreeClean: false })).toThrow();
		expect(() => assertSameReportProvenance(null, clean)).toThrow();
	});
});
