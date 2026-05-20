// Desvio de Foco: Capuz do Túnel — ao ser escolhido como alvo, o portador pode
// redirecionar o ataque para outra criatura ou aceitar e ganhar +N de acerto.
// Trigger: once_per_room_on_targeted.

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log } from "../../reducer/utils";
import { registerContinuation } from "../registry";

export function handleTargetRedirectOrTohit(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	if (!ctx.sourceHeroId || !ctx.skillId) return state;

	const tohitBonus = parseNumber(value) ?? 2;
	const otherEnemies = state.activeEnemies.filter(
		(e) => e.status === "active" && e.id !== ctx.sourceEnemyId,
	);

	const options: { id: string; label: string }[] = [
		{ id: "tohit", label: `Aceitar e ganhar +${tohitBonus} de acerto neste ataque` },
	];

	if (otherEnemies.length > 0) {
		options.unshift({ id: "redirect", label: `Redirecionar para ${otherEnemies[0]!.cardName}` });
	}

	return {
		...state,
		pendingSkillChoice: {
			skillId: ctx.skillId,
			prompt: "Capuz do Túnel: você foi escolhido como alvo. Como deseja responder?",
			options,
			sourceHeroId: ctx.sourceHeroId,
		},
	};
}

registerContinuation(
	"targetRedirect_or_tohit",
	(state: GameState, ctx: SkillContext, choice: string): GameState => {
		if (!ctx.sourceHeroId || !state.combat) return state;

		if (choice === "redirect") {
			// Redirecionar o último par para outra criatura ativa
			const pairs = [...state.combat.pairs];
			const pairIndex = pairs.findLastIndex((p) => p.heroId === ctx.sourceHeroId);
			if (pairIndex === -1) return state;

			const currentPair = pairs[pairIndex]!;
			const other = state.activeEnemies.find(
				(e) => e.status === "active" && e.id !== currentPair.enemyId,
			);
			if (!other) return log(state, "Nenhuma outra criatura para redirecionar.");

			pairs[pairIndex] = { ...currentPair, enemyId: other.id };
			return log(
				{ ...state, combat: { ...state.combat, pairs } },
				`Desvio de Foco: ataque redirecionado para ${other.cardName}.`,
			);
		}

		// "tohit": adicionar bônus ao próximo ataque
		const bonus = 2; // valor padrão; o ctx pode não ter value aqui
		const current = state.combat.bonusNextAttack[ctx.sourceHeroId] ?? 0;
		return log(
			{
				...state,
				combat: {
					...state.combat,
					bonusNextAttack: { ...state.combat.bonusNextAttack, [ctx.sourceHeroId]: current + bonus },
				},
			},
			`Desvio de Foco: +${bonus} de acerto neste ataque.`,
		);
	},
);
