import type { GameEngine } from "@/core/gameEngine";
import { cardById } from "@/core/gameEngine";
import type { GameState } from "@/core/state/gameState";
import { gameOf } from "@/engine/state";

/** Observação do fluxo real: uma aparição de inimigo não equivale a uma derrota. */
export interface RoomEncounterTelemetry {
	readonly entered: number;
	readonly cleared: number;
	readonly creaturesThreeXpSeen: number;
	readonly subbossesSeen: number;
	readonly subbossesDefeated: number;
	/** XP total recebido na transição que concluiu a sala (sala + criaturas). */
	readonly xpAwardedOnClear: number;
	/** Apenas o XP nominal escrito na carta da sala, não a soma de monstros. */
	readonly roomCardXpOnClear: number;
}

/** Atualiza um acumulador por ID de sala, sem afetar IA, RNG ou estado do jogo. */
export function recordRoomEncounterStep(
	engine: GameEngine,
	before: GameState,
	after: GameState,
	rooms: Record<string, RoomEncounterTelemetry>,
): void {
	const previous = gameOf(before);
	const current = gameOf(after);
	const roomId = current.currentRoom?.cardId ?? previous.currentRoom?.cardId;
	if (!roomId) return;
	const card = cardById(engine, roomId);
	if (!card || (card.type !== "room" && card.type !== "subboss_room")) return;

	const value = rooms[roomId] ?? {
		entered: 0, cleared: 0, creaturesThreeXpSeen: 0,
		subbossesSeen: 0, subbossesDefeated: 0,
		xpAwardedOnClear: 0, roomCardXpOnClear: 0,
	};
	let { entered, cleared, creaturesThreeXpSeen, subbossesSeen, subbossesDefeated,
		xpAwardedOnClear, roomCardXpOnClear } = value;

	// CHECK_BOSS_CONDITION pode sair da sala anterior e revelar outra na
	// mesma ação. Mudança de ID ou nova etapa indica uma entrada real.
	if (current.currentRoom && (previous.currentRoom?.cardId !== current.currentRoom.cardId ||
		(previous.currentRoom?.status === "cleared" && current.currentRoom.status === "active"))) entered++;

	if (current.roomsCleared > previous.roomsCleared) {
		cleared += current.roomsCleared - previous.roomsCleared;
		xpAwardedOnClear += Math.max(0, current.groupXp - previous.groupXp);
		roomCardXpOnClear += card.xp ?? 0;
	}

	const beforeEnemies = new Map(previous.activeEnemies.map((enemy) => [enemy.id, enemy]));
	for (const enemy of current.activeEnemies) {
		const card = cardById(engine, enemy.cardId);
		if (!card) continue;
		if (!beforeEnemies.has(enemy.id)) {
			if (card.type === "creature" && card.xp === 3) creaturesThreeXpSeen++;
			if (card.type === "subboss") subbossesSeen++;
		}
	}
	// A resolução do último golpe pode retirar o subchefe de activeEnemies
	// e colocá-lo diretamente no cemitério no mesmo passo do bot.
	for (const enemy of previous.activeEnemies) {
		if (enemy.status !== "active" || cardById(engine, enemy.cardId)?.type !== "subboss") continue;
		const activeNow = current.activeEnemies.find((unit) => unit.id === enemy.id);
		const inGraveyard = current.enemyGraveyard.some((unit) => unit.id === enemy.id && unit.status === "defeated");
		if (activeNow?.status === "defeated" || inGraveyard) subbossesDefeated++;
	}
	rooms[roomId] = {
		entered, cleared, creaturesThreeXpSeen, subbossesSeen, subbossesDefeated,
		xpAwardedOnClear, roomCardXpOnClear,
	};
}
