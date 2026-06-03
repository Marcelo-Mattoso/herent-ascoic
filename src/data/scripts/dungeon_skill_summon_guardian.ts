import type { ScriptHandler } from "@/core/scripts/types";

// dungeon_skill_summon_guardian — Invocar Guardião
// Enquanto o guardião estiver em jogo, o grupo não pode prevenir descartes
// de dungeon por efeitos de herói ou item (discardDungeonLocked = true).
// O spawn real da criatura especial já é tratado por handleSpawnEnemies.
// Este script ativa a trava de prevenção ao revelar a sala.
export const run: ScriptHandler = (ctx) => {
	const creatureId = ctx.state.currentRoom?.specialCreatureId ?? "Guardião";

	return {
		...ctx.state,
		flags: { ...ctx.state.flags, discardDungeonLocked: true },
		eventLog: [
			...ctx.state.eventLog,
			`Guardião (${creatureId}) em jogo: prevenção de descarte de dungeon bloqueada.`,
		],
	};
};
