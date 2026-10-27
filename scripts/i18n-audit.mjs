import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const targets = [path.join(root, "src/ui"), path.join(root, "src/App.tsx")];
const textAttributes = new Set(["aria-label", "title", "placeholder", "alt"]);

function files(target) {
	if (fs.statSync(target).isFile()) return [target];
	return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(target, entry.name);
		return entry.isDirectory() ? files(full) : entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [full] : [];
	});
}

const findings = [];
const dynamic = [];
const remaining = [];
for (const file of targets.flatMap(files)) {
	const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	function visit(node) {
		let value;
		let kind;
		if (ts.isJsxText(node)) {
			value = node.getText(source).replace(/\s+/g, " ").trim();
			kind = "jsxText";
		} else if (ts.isJsxAttribute(node) && textAttributes.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
			value = node.initializer.text;
			kind = node.name.text;
		}
		if (value && /[A-Za-zÀ-ÿ]{2}/.test(value)) {
			const location = source.getLineAndCharacterOfPosition(node.getStart(source));
			findings.push({ file: path.relative(root, file).split(path.sep).join("/"), line: location.line + 1, kind, value });
		}
		if (ts.isStringLiteral(node) && /[A-Za-zÀ-ÿ]{2}/.test(node.text)) {
			let ancestor = node.parent;
			let jsxExpression = false;
			let skip = false;
			while (ancestor && ancestor !== source) {
				if (ts.isCallExpression(ancestor) && ancestor.expression.getText(source) === "translate") skip = true;
				if (ts.isJsxAttribute(ancestor) && !textAttributes.has(ancestor.name.text)) skip = true;
				if (ts.isJsxExpression(ancestor)) jsxExpression = true;
				ancestor = ancestor.parent;
			}
			if (jsxExpression && !skip && (node.text.includes(" ") || /[À-ÿ]/.test(node.text))) {
				const location = source.getLineAndCharacterOfPosition(node.getStart(source));
				dynamic.push({ file: path.relative(root, file).split(path.sep).join("/"), line: location.line + 1, value: node.text });
			}
			if (!jsxExpression && !skip && (node.text.includes(" ") || /[À-ÿ]/.test(node.text)) && !ts.isImportDeclaration(node.parent)) {
				const location = source.getLineAndCharacterOfPosition(node.getStart(source));
				remaining.push({ file: path.relative(root, file).split(path.sep).join("/"), line: location.line + 1, value: node.text });
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
}

const byFile = Object.entries(Object.groupBy(findings, (item) => item.file)).map(([file, rows]) => ({ file, count: rows.length })).sort((a, b) => b.count - a.count);
console.log(JSON.stringify({ total: findings.length, files: byFile.length, byFile, dynamicCount: dynamic.length, remainingCount: remaining.length, remainingByFile: Object.entries(Object.groupBy(remaining, (item) => item.file)).map(([file, rows]) => ({ file, count: rows.length })).sort((a, b) => b.count - a.count), ...(process.argv.includes("--details") ? { findings, dynamic, remaining } : {}) }, null, 2));
if (process.argv.includes("--check") && (findings.length || dynamic.length)) process.exitCode = 1;
