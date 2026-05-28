import type { ScriptHandler } from "@/core/scripts/types";

// Smoke test do subsistema de scripts. Apenas escreve no eventLog.
export const ping: ScriptHandler = (ctx) => {
	return ctx.log("[script smoke] ping executado");
};
