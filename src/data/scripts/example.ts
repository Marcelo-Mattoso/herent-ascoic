// Exemplo de script customizado.
// Execução: npm run script src/data/scripts/example.ts
//
// Tem acesso a todo o core via alias @/ — mesmo ambiente que os testes.

import { createInitialGameState } from "@/core/state/gameState";
import { reducer } from "@/core/reducer/index";

function main() {
	const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
	const state = reducer(base, {
		type: "START_GAME",
		payload: { heroCardNames: ["Bárbaro Rubro"] },
	});

	console.log("Status:", state.status);
	console.log("Heróis:", state.heroes.map((h) => `${h.cardName} (${h.currentLife}/${h.maxLife} HP)`));
	console.log("Log de actions:", state.actionLog.length, "entrada(s)");
}

// Executar apenas quando invocado diretamente (não quando importado pelo registry glob no test)
if (typeof process !== "undefined" && process.argv?.[1]?.includes("example")) {
	main();
}
