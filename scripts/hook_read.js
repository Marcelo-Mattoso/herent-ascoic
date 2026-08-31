import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = input?.tool_input?.file_path ?? "";
const basename = filePath.split(/[\\/]/).pop() ?? "";

if (/^\.env(\..+)?$/.test(basename)) {
	console.log(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: "Leitura de arquivos .env é bloqueada por política do projeto.",
			},
		}),
	);
}
