import fs from "node:fs";
import path from "node:path";
import { directAccessReport } from "./accessScan";
import { scanCoupling, TERMS } from "./couplingScan";

const outFile = path.resolve(__dirname, "../../docs/coupling-baseline.json");
const direct = directAccessReport();
const scanned = scanCoupling();
const baseline = {
	...scanned,
	totals: { ...scanned.totals, directStateAccess: direct.total },
	directStateAccess: direct,
};

fs.writeFileSync(outFile, `${JSON.stringify(baseline, null, "	")}
`);
console.log(
	`coupling: ${baseline.totals.literalContentIds} ids literais, ${baseline.totals.catalogImportsOutsideCompositionRoot} imports de catálogo, ${baseline.totals.transitiveCatalogReach} módulos com alcance transitivo, ${baseline.totals.directStateAccess} acessos diretos a campos do GameState fora de access.ts (${direct.allowlisted} em módulos donos), ${baseline.totals.gameTermLines} linhas com termos (${baseline.filesScanned} arquivos) -> docs/coupling-baseline.json`,
);
for (const t of TERMS) {
	console.log(`  ${t}: ${baseline.gameTerms[t]?.count}`);
}
