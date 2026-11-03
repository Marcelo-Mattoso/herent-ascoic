import { describe, expect, it } from "vitest";
import { scanCoupling } from "./couplingScan";

describe("acoplamento do core ao conteúdo", () => {
	const report = scanCoupling();

	it("só o composition root importa catálogos, locales, defaults, JSON e package.json", () => {
		expect(report.compositionRoots).toEqual(["src/core/composition.ts"]);
		expect(report.catalogImports.hits).toEqual([]);
		expect(report.totals.catalogImportsOutsideCompositionRoot).toBe(0);
	});

	it("nenhum módulo fora do root alcança catálogo por import de valor", () => {
		expect(report.transitiveCatalogReach.modules).toEqual([]);
		expect(report.totals.transitiveCatalogReach).toBe(0);
	});
});
