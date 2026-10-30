import { reducer } from "@/core/reducer/index";
import { createInitialGameState } from "@/core/state/gameState";
import { gameOf } from "@/engine/state";

function main() {
	const base = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
	const state = reducer(base, {
		type: "START_GAME",
		payload: { heroCardNames: ["Bárbaro Rubro"] },
	});

	console.log("Status:", gameOf(state).status);
	console.log(
		"Heróis:",
		gameOf(state).heroes.map((h) => `${h.cardName} (${h.currentLife}/${h.maxLife} HP)`),
	);
	console.log("Log de actions:", gameOf(state).actionLog.length, "entrada(s)");
}

// Executar apenas quando invocado diretamente (não quando importado pelo registry glob no test)
if (typeof process !== "undefined" && process.argv?.[1]?.includes("example")) {
	main();
}
