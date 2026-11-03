import path from "node:path";
import ts from "typescript";

const root = path.resolve(__dirname, "../..");

export const GUARDED_FIELDS = {
	engine: "GameState",
	game: "GameState",
	world: "AscensaoGame",
} as const;

export type GuardedField = keyof typeof GUARDED_FIELDS | "statComponent";

export const ACCESS_MODULE = "src/core/state/access.ts";

// Módulos que definem ou constroem a forma do estado; o motivo fica na allowlist.
export const OWNER_ALLOWLIST: Readonly<Record<string, string>> = {
	[ACCESS_MODULE]: "acessores: único ponto de leitura e escrita dos campos",
	"src/core/state/gameState.ts":
		"constrói o estado inicial e a forma persistida do GameState",
	"src/core/reducer/utils.ts":
		"createHero: literal que constrói o HeroState inicial (sem estado anterior a copiar)",
};

export type AccessForm =
	| "read"
	| "write"
	| "destructure"
	| "literal"
	| "literal-spread";

export interface AccessHit {
	readonly file: string;
	readonly line: number;
	readonly field: GuardedField;
	readonly form: AccessForm;
	readonly node: ts.Node;
	readonly source: ts.SourceFile;
}

export function createProgram(): ts.Program {
	const configPath = path.join(root, "tsconfig.app.json");
	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(
		config.config,
		ts.sys,
		root,
		{ noEmit: true, composite: false, incremental: false },
		configPath,
	);
	const extra = ts.sys
		.readDirectory(path.join(root, "src/data/scripts"), [".ts"])
		.filter((f) => !/\.test\.ts$|__tests__/.test(f));
	return ts.createProgram({
		rootNames: [...parsed.fileNames, ...extra],
		options: parsed.options,
	});
}

export function relativeOf(file: string): string {
	return path.relative(root, file).split(path.sep).join("/");
}

export function isScanned(rel: string): boolean {
	if (!/^src\/(core|data)\//.test(rel)) {
		return false;
	}
	return !/\.test\.tsx?$|\/__tests__\//.test(rel);
}

function ownerName(
	checker: ts.TypeChecker,
	node: ts.Node,
): string | undefined {
	const symbol = checker.getSymbolAtLocation(node);
	const declaration = symbol?.declarations?.[0];
	const parent = declaration?.parent;
	if (parent && (ts.isInterfaceDeclaration(parent) || ts.isClassDeclaration(parent))) {
		return parent.name?.text;
	}
	return undefined;
}

function typeName(type: ts.Type | undefined): string | undefined {
	return type?.getSymbol()?.getName() ?? type?.aliasSymbol?.getName();
}

function isGuarded(name: string): name is keyof typeof GUARDED_FIELDS {
	return Object.hasOwn(GUARDED_FIELDS, name);
}

function isAssignmentTarget(node: ts.Node): boolean {
	const parent = node.parent;
	return (
		ts.isBinaryExpression(parent) &&
		parent.left === node &&
		parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
		parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
	);
}

export function collectAccesses(
	program: ts.Program,
	filter: (rel: string) => boolean = isScanned,
): { hits: AccessHit[]; sources: Map<string, ts.SourceFile> } {
	const checker = program.getTypeChecker();
	const hits: AccessHit[] = [];
	const sources = new Map<string, ts.SourceFile>();

	for (const source of program.getSourceFiles()) {
		if (source.isDeclarationFile) continue;
		const rel = relativeOf(source.fileName);
		if (!filter(rel)) continue;
		sources.set(rel, source);

		const add = (node: ts.Node, field: GuardedField, form: AccessForm) => {
			const { line } = source.getLineAndCharacterOfPosition(node.getStart());
			hits.push({ file: rel, line: line + 1, field, form, node, source });
		};

		const visit = (node: ts.Node): void => {
			if (ts.isPropertyAccessExpression(node) && isGuarded(node.name.text)) {
				const field = node.name.text;
				if (ownerName(checker, node.name) === GUARDED_FIELDS[field]) {
					add(node, field, isAssignmentTarget(node) ? "write" : "read");
				}
			} else if (
				ts.isElementAccessExpression(node) &&
				ts.isStringLiteralLike(node.argumentExpression) &&
				isGuarded(node.argumentExpression.text)
			) {
				const field = node.argumentExpression.text;
				if (typeName(checker.getTypeAtLocation(node.expression)) === GUARDED_FIELDS[field]) {
					add(node, field, "read");
				}
			} else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
				const name = (node.propertyName ?? node.name) as ts.Node;
				if (ts.isIdentifier(name) && isGuarded(name.text)) {
					const owner = typeName(checker.getTypeAtLocation(node.parent));
					if (owner === GUARDED_FIELDS[name.text]) add(node, name.text, "destructure");
				}
			} else if (
				(ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
				ts.isObjectLiteralExpression(node.parent) &&
				ts.isIdentifier(node.name) &&
				isGuarded(node.name.text)
			) {
				const field = node.name.text;
				const literal = node.parent;
				const owners = [
					typeName(checker.getContextualType(literal)),
					typeName(checker.getTypeAtLocation(literal)),
					...literal.properties
						.filter(ts.isSpreadAssignment)
						.map((spread) =>
							typeName(checker.getTypeAtLocation(spread.expression)),
						),
				];
				const owner = owners.includes(GUARDED_FIELDS[field])
					? GUARDED_FIELDS[field]
					: undefined;
				if (owner === GUARDED_FIELDS[field]) {
					const hasSpread = literal.properties.some(ts.isSpreadAssignment);
					add(node, field, hasSpread ? "literal-spread" : "literal");
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return { hits, sources };
}

export const STAT_COMPONENTS = [
	"health",
	"damage_stat",
	"dice",
	"condition",
	"token",
] as const;

const STAT_ACCESS_FUNCTIONS = new Set([
	"getComponent",
	"getComponents",
	"hasComponent",
	"updateComponent",
	"queryWithComponent",
	"addComponent",
]);

// A migração v3→v4 escreve os componentes direto no JSON bruto do snapshot, antes de existir GameState.
export const STAT_OWNERS: readonly string[] = [
	ACCESS_MODULE,
	"src/core/persistence/migrations.ts",
];

export function isStatOwner(rel: string): boolean {
	return STAT_OWNERS.includes(rel) || rel.startsWith("src/core/ecs/");
}

export function statComponentHits(source: ts.SourceFile, rel: string): AccessHit[] {
	const hits: AccessHit[] = [];
	const isStat = (node: ts.Node | undefined): boolean =>
		node !== undefined &&
		ts.isStringLiteralLike(node) &&
		(STAT_COMPONENTS as readonly string[]).includes(node.text);
	const add = (node: ts.Node, form: AccessForm) => {
		const { line } = source.getLineAndCharacterOfPosition(node.getStart());
		hits.push({ file: rel, line: line + 1, field: "statComponent", form, node, source });
	};
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const callee = ts.isIdentifier(node.expression)
				? node.expression.text
				: ts.isPropertyAccessExpression(node.expression)
					? node.expression.name.text
					: "";
			if (STAT_ACCESS_FUNCTIONS.has(callee) && node.arguments.some(isStat)) {
				add(node, "read");
			}
		} else if (
			ts.isPropertyAssignment(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "type" &&
			isStat(node.initializer)
		) {
			add(node, "literal");
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return hits;
}

export function directAccessReport() {
	const program = createProgram();
	const { hits } = collectAccesses(program);
	for (const program_ of program.getSourceFiles()) {
		if (program_.isDeclarationFile) continue;
		const rel = relativeOf(program_.fileName);
		if (!isScanned(rel) || isStatOwner(rel)) continue;
		hits.push(...statComponentHits(program_, rel));
	}
	const outside = hits.filter((h) => !(h.file in OWNER_ALLOWLIST));
	const byField: Record<string, number> = {};
	const byForm: Record<string, number> = {};
	for (const h of outside) {
		byField[h.field] = (byField[h.field] ?? 0) + 1;
		byForm[h.form] = (byForm[h.form] ?? 0) + 1;
	}
	return {
		total: outside.length,
		byField,
		byForm,
		allowlist: OWNER_ALLOWLIST,
		allowlisted: hits.length - outside.length,
		hits: outside.map((h) => `${h.file}:${h.line} ${h.field} (${h.form})`),
	};
}
