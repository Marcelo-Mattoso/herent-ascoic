import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const argumentValue = (flag) => process.argv[process.argv.indexOf(flag) + 1];
const code = process.argv.includes("--locale") ? argumentValue("--locale") : "";
const nativeName = process.argv.includes("--name") ? argumentValue("--name") : "";
if (!code || !nativeName || Intl.getCanonicalLocales(code)[0] !== code) {
	console.error("Uso: npm run i18n:new -- --locale fr-FR --name \"Français (France)\"");
	process.exit(1);
}
const target = path.join(root, "locales", code);
if (fs.existsSync(target)) throw new Error(`Idioma já existe: ${code}`);

function blank(value) {
	if (typeof value === "string") return "";
	if (Array.isArray(value)) return value.map(blank);
	if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, blank(item)]));
	throw new Error("Contrato PT-BR contém valor não textual");
}

const base = path.join(root, "locales", "pt-BR");
const namespaces = fs.readdirSync(base).filter((name) => name.endsWith(".json") && name !== "meta.json");
fs.mkdirSync(target);
for (const file of namespaces) {
	const source = JSON.parse(fs.readFileSync(path.join(base, file), "utf8"));
	fs.writeFileSync(path.join(target, file), `${JSON.stringify(blank(source), null, 2)}\n`);
}
const internationalName = new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
fs.writeFileSync(path.join(target, "meta.json"), `${JSON.stringify({ code, name: internationalName, nativeName, direction: "ltr", status: "draft", version: 1 }, null, 2)}\n`);
console.log(`Criado locales/${code} como draft, com ${namespaces.length} namespaces vazios. Traduza os JSONs, valide e solicite revisão.`);
