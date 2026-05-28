// tohit_damage: bônus de acerto+dano em combate.
// Cobre múltiplas skills:
//   - Fio Mortal (Adaga, Machado, Martelo, Coração de Brasa): trigger "combat", sempre ativo
//   - Luz da Aurora Final (Paladino): trigger "combat_if_dungeon_red_or_purple", só a Despertar 3+
//   - Fera Solitária (Rato, Cavaleiro, Ogro): trigger "combat_if_alone_in_room" (enemy skill)
// O trigger controla QUANDO dispara; o handler aplica o bônus ao herói atacante.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseSlashPair } from "../valueParsers";
import { log } from "../../reducer/utils";

export function handleTohitDamage(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	// Aceita "X/Y" (tohit/damage distintos) ou número simples (ambos iguais)
	const parsed = parseSlashPair(value) ?? (typeof value === "number" ? { a: value, b: value } : null);
	if (!parsed) return state;
	const { a: _tohit, b: damage } = parsed;

	if (!ctx.sourceHeroId || !state.combat) return state;

	const hero = state.heroes.find((h) => h.id === ctx.sourceHeroId);
	if (!hero || hero.status !== "active") return state;

	const skillLabel =
		ctx.triggeredBy === "combat_if_dungeon_red_or_purple"
			? "Luz da Aurora Final"
			: ctx.triggeredBy === "combat_if_alone_in_room"
			? "Fera Solitária"
			: "Fio Mortal";

	const logLabel = ctx.triggeredBy === "combat_if_dungeon_red_or_purple"
		? `Despertar ${state.despertar}: +${_tohit} acerto, +${damage} dano.`
		: `+${_tohit} acerto, +${damage} dano neste ataque.`;

	return log(
		{
			...state,
			combat: {
				...state.combat,
				bonusNextAttack: {
					...state.combat.bonusNextAttack,
					[hero.id]: [...(state.combat.bonusNextAttack?.[hero.id] ?? []), { label: skillLabel, value: damage }],
				},
			},
		},
		logLabel,
	);
}
