import type { ModifierComponent } from "@/core/ecs/types";
import { addComponent } from "@/core/ecs/world";
import { log } from "@/core/reducer/utils";
import type { ScriptHandler, SkillContinuation } from "@/core/scripts/types";

import {
	deckOf,
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
	const currentEco = scopedCountOf(ctx.state, "combat", "eco", sourceId);
	return withGame(
		withScopedCount(ctx.state, "combat", "eco", sourceId, currentEco + 1),
		(prevGame) => ({ ...prevGame, eventLog: [
			...gameOf(ctx.state).eventLog,
			`Necromante: Eco Profundo — 1 Eco ganho (total: ${currentEco + 1}).`,
		] }));
};

// spend — ativado por USE_SKILL quando o jogador decide gastar o Eco.
// Apresenta 3 opções.
export const spend: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !ctx.skillId) return ctx.state;
	const eco = scopedCountOf(ctx.state, "combat", "eco", ctx.sourceId);
	if (eco <= 0) {
		return ctx.action.log("Eco Profundo: nenhum Eco disponível para gastar.");
	}
	return ctx.action.requestChoice([
		{ id: "tohit", label: "+3 no total de acerto neste ataque" },
		{ id: "damage_reduction", label: "Reduzir 2 de dano sofrido" },
		{
			id: "peek_enemies",
			label: "Ver as 2 cartas do topo do deck de inimigos",
		},
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
		scopedCountOf(state, "combat", "eco", ctx.sourceHeroId) - 1;
	const spent = withScopedCount(
		state,
		"combat",
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
			value: 3,
			source: "power_deep_veil_echo",
			duration: { kind: "once" },
		};
		const newWorld = addComponent(worldOf(state), ctx.sourceHeroId, mod);
		return log(
			withWorld(spent, newWorld),
			"Eco Profundo gasto: +3 de acerto neste ataque.",
		);
	}

	if (choice === "damage_reduction") {
		// Patch-18 Lote G: usa ECS world (damage_taken negativo) em vez de damageReduction
		const mod: ModifierComponent = {
			type: "modifier",
			target: "damage_taken",
			operation: "add",
			value: -2,
			source: "power_deep_veil_echo",
			duration: { kind: "this_combat" },
		};
		const newWorld = addComponent(worldOf(state), ctx.sourceHeroId, mod);
		return log(
			withWorld(spent, newWorld),
			"Eco Profundo gasto: -2 no próximo dano sofrido.",
		);
	}

	if (choice === "peek_enemies") {
		const topTwo = deckOf(state, "enemyDeck").available.slice(0, 2);
		return log(
			spent,
			`Eco Profundo gasto: próximos inimigos — ${topTwo.join(", ") || "deck vazio"}.`,
		);
	}

	return state;
};
