import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.join(repositoryRoot, "tools", "bot", "runs", "audit-" + timestamp);
const npmCli = process.env.npm_execpath;

function run(script) {
	const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
	const args = [
		...(npmCli ? [npmCli] : []),
		"run", script, "--", "--output", directory,
	];
	const result = spawnSync(command, args, {
		cwd: repositoryRoot,
		stdio: "inherit",
		...(npmCli ? {} : { shell: process.platform === "win32" }),
	});
	if (result.error) throw result.error;
	return result.status ?? 1;
}

console.info("Pasta da auditoria:", directory);
const auditCode = run("bot:skills-audit");
if (auditCode !== 0) {
	console.error("Auditoria reprovada; report de leveling não iniciado.");
	process.exitCode = auditCode;
} else {
	process.exitCode = run("bot:leveling-report");
}
