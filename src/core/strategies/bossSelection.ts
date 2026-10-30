import { bossCard, type GameEngine } from "../gameEngine";

export function selectBoss(engine: GameEngine): string {
	const boss = bossCard(engine);
	if (!boss) throw new Error("Nenhum chefe no catálogo.");
	return boss.id;
}
