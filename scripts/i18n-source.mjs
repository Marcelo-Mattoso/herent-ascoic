import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const baseDir = path.join(root, "locales", "pt-BR");

function json(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function readYaml(file) {
	return YAML.parse(fs.readFileSync(path.join(root, "src/data", file), "utf8"));
}

function property(object, name) {
	return object.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText() === name)?.initializer;
}

function literal(node, variables) {
	if (!node) return undefined;
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isNumericLiteral(node)) return Number(node.text);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (ts.isIdentifier(node)) return literal(variables.get(node.text), variables);
	if (ts.isAsExpression(node)) return literal(node.expression, variables);
	if (ts.isArrayLiteralExpression(node)) return node.elements.map((entry) => literal(entry, variables));
	if (ts.isObjectLiteralExpression(node)) {
		const result = {};
		for (const entry of node.properties) {
			if (!ts.isPropertyAssignment(entry)) continue;
			const key = ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name) ? entry.name.text : undefined;
			if (key) result[key] = literal(entry.initializer, variables);
		}
		return result;
	}
	return undefined;
}

function tutorialTexts() {
	const source = ts.createSourceFile("registry.ts", fs.readFileSync(path.join(root, "src/ui/tutorials/registry.ts"), "utf8"), ts.ScriptTarget.Latest, true);
	const variables = new Map();
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations)
			if (ts.isIdentifier(declaration.name) && declaration.initializer)
				variables.set(declaration.name.text, declaration.initializer);
	}
	const modules = variables.get("TUTORIAL_MODULES");
	if (!modules || !ts.isArrayLiteralExpression(modules)) throw new Error("TUTORIAL_MODULES não encontrado");
	const output = {};
	for (const moduleNode of modules.elements) {
		if (!ts.isObjectLiteralExpression(moduleNode)) continue;
		const id = literal(property(moduleNode, "id"), variables);
		const stepsNode = property(moduleNode, "steps");
		const steps = literal(stepsNode, variables);
		if (!id || !Array.isArray(steps)) throw new Error("Módulo de tutorial inválido");
		output[id] = {
			title: literal(property(moduleNode, "title"), variables),
			subtitle: literal(property(moduleNode, "subtitle"), variables),
			summary: literal(property(moduleNode, "summary"), variables),
			steps: Object.fromEntries(steps.map((step) => [step.id, {
				title: step.title,
				narration: step.narration,
				instruction: step.instruction,
				...(step.highlights ? { highlights: step.highlights.map((highlight) => highlight.instruction) } : {}),
			}])),
		};
	}
	return output;
}

export function sourceCatalogs() {
	return {
		cards: readYaml("cards.locale.pt-BR.yaml"),
		skills: readYaml("skills.locale.pt-BR.yaml"),
		tutorials: tutorialTexts(),
	};
}

export function syncSourceCatalogs(check = false) {
	fs.mkdirSync(baseDir, { recursive: true });
	for (const [namespace, catalog] of Object.entries(sourceCatalogs())) {
		const target = path.join(baseDir, `${namespace}.json`);
		const expected = json(catalog);
		if (check) {
			if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== expected)
				throw new Error(`${namespace}.json divergiu da fonte PT-BR; execute npm run i18n:sync`);
		} else fs.writeFileSync(target, expected);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
	syncSourceCatalogs(process.argv.includes("--check"));
	console.log("Catálogos PT-BR de cartas, habilidades e tutoriais sincronizados.");
}
