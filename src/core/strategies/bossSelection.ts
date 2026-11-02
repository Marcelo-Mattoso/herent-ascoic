import type { GameEngine } from "../gameEngine";
import { expansionOf } from "../gameEngine";

// O pacote escolhido determina o mestre da masmorra.
export function selectBoss(engine: GameEngine, expansionId?: string): string {
	const boss = engine.content.cardsOfType("boss").find((card) =>
		!expansionId || expansionOf(engine, card.id) === expansionId,
	);
	if (!boss) throw new Error("Nenhum chefe no catálogo.");
	return boss.id;
}
