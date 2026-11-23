import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.join(repositoryRoot, "tools", "bot", "runs", "audit-" + timestamp);
const npmCli = process.env.npm_execpath;

function run(script, extraArgs = []) {
	const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
	const args = [
		...(npmCli ? [npmCli] : []),
		"run", script, "--", "--output", directory, ...extraArgs,
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
  const levelingCode = run("bot:leveling-report");
  if (levelingCode !== 0) {
    process.exitCode = levelingCode;
  } else if (process.env.AUDIT_BUG_HUNT === "0") {
    console.info("Caçador de Bugs: desabilitado por AUDIT_BUG_HUNT=0.");
    process.exitCode = 0;
  } else {
    // Smoke exploratório pequeno para não multiplicar o custo do audit normal.
    // Investigações extensas usam npm run bot:explore isoladamente (alias legado: bot:bug-hunt).
    process.exitCode = run("bot:explore",
      ["--max-scenarios", "6", "--runs", "1", "--max-steps", "500"]);
  }
}
