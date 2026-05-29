// Incrementa o patch da versão em package.json e MainMenu.tsx.
// Chamado pelo hook PreToolUse antes de cada git commit.
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pkgPath = path.join(root, "package.json");
const menuPath = path.join(root, "src/ui/screens/MainMenu.tsx");

let pkg = fs.readFileSync(pkgPath, "utf8");
const m = pkg.match(/"version": "(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
	console.error("bump-version: campo version não encontrado em package.json");
	process.exit(1);
}

const newVersion = `${m[1]}.${m[2]}.${+m[3] + 1}`;
pkg = pkg.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${newVersion}"`);
fs.writeFileSync(pkgPath, pkg);

let menu = fs.readFileSync(menuPath, "utf8");
menu = menu.replace(/v\d+\.\d+\.\d+/, `v${newVersion}`);
fs.writeFileSync(menuPath, menu);

console.log(`bump-version: ${m[1]}.${m[2]}.${m[3]} → ${newVersion}`);
