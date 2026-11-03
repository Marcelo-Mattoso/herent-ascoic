import type { ModifierComponent } from "@/core/ecs/types";
import { addComponent } from "@/core/ecs/world";
import { log } from "@/core/reducer/utils";
import type { ScriptHandler, SkillContinuation } from "@/core/scripts/types";

import {
	scopedCountOf,
	withScopedCount,
	withWorld,
	worldOf,
} from "@/core/state/access";
import { gameOf, withGame } from "../../engine/state";
// power_deep_veil_echo — Eco Profundo do Véu
// Uma vez por jogo, ao derrotar uma criatura: ganha 1 Eco.
// Gaste o Eco via USE_SKILL → escolha: +3 acerto, -2 dano sofrido, ou ver 2 cartas inimigo.
export const run: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !gameOf(ctx.state).combat) return ctx.state;

	const sourceId = ctx.sourceId;
	const currentEco = scopedCountOf(ctx.state, "game", "eco", sourceId);
	return withGame(
		withScopedCount(ctx.state, "game", "eco", sourceId, currentEco + 1),
		(prevGame) => ({ ...prevGame, eventLog: [
			...gameOf(ctx.state).eventLog,
			`Necromante: Eco Profundo — 1 Eco ganho (total: ${currentEco + 1}).`,
		] }));
};

// spend — ativado por USE_SKILL quando o jogador decide gastar o Eco.
// Apresenta 3 opções.
export const spend: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !ctx.skillId) return ctx.state;
	const eco = scopedCountOf(ctx.state, "game", "eco", ctx.sourceId);
	if (eco <= 0) {
		return ctx.action.log("Eco Profundo: nenhum Eco disponível para gastar.");
	}
	return ctx.action.requestChoice([
		{ id: "tohit", label: "+2 de acerto no próximo ataque" },
		{ id: "damage", label: "+2 de dano no próximo ataque" },
	]);
};

// Continuação: aplica o efeito escolhido e consome o Eco.
export const continuation: SkillContinuation = (
	state,
	ctx,
	choice,
) => {
	if (!ctx.sourceHeroId || !gameOf(state).combat) return state;

	const tokensAfterUse =
		scopedCountOf(state, "game", "eco", ctx.sourceHeroId) - 1;
	const spent = withScopedCount(
		state,
		"game",
		"eco",
		ctx.sourceHeroId,
		tokensAfterUse > 0 ? tokensAfterUse : 0,
	);

	if (choice === "tohit") {
		// Patch-18 Lote G: usa ECS world (hit_bonus) em vez de bonusNextAttack
		const mod: ModifierComponent = {
			type: "modifier",
			target: "hit_bonus",
			operation: "add",
			value: 2,
			source: "power_deep_veil_echo",
			duration: { kind: "this_combat" },
		};
		const newWorld = addComponent(worldOf(state), ctx.sourceHeroId, mod);
		return log(
			withWorld(spent, newWorld),
			"Eco Profundo gasto: +2 de acerto no próximo ataque.",
		);
	}

	if (choice === "damage") {
		const mod: ModifierComponent = {
			type: "modifier",
			target: "damage_dealt",
			operation: "add",
			value: 2,
			source: "power_deep_veil_echo",
			duration: { kind: "this_combat" },
		};
		const newWorld = addComponent(worldOf(state), ctx.sourceHeroId, mod);
		return log(
			withWorld(spent, newWorld),
			"Eco Profundo gasto: +2 de dano no próximo ataque.",
		);
	}

	return state;
};
