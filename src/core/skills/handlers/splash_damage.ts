// Dano em área ao destruir uma criatura com ataque.
// Aplica `value` de dano a outra criatura ativa na mesma sala.
// Cobre: habilidade-golpe-trespassante (Espada do Trespasse, Lâmina Vermelha).

import type { SkillContext } from "../../data/skillTypes";
import { log } from "../../reducer/utils";
import type { GameState } from "../../state/gameState";
import { applyDamage } from "../../systems/damageSystem";
import { parseNumber } from "../valueParsers";

export function handleSplashDamage(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	const amount = parseNumber(value);
	if (!amount || amount <= 0) return state;

	// Excluir a criatura recém-destruída (sourceEnemyId)
	const others = state.activeEnemies.filter(
		(e) => e.status === "active" && e.id !== ctx.sourceEnemyId,
	);
	if (others.length === 0) return state;

	// Alvo: criatura com menor vida dentre as restantes
	const target = others.reduce((a, b) =>
		a.currentLife <= b.currentLife ? a : b,
	);

	const next = applyDamage(state, target.id, amount);
	return log(
		next,
		`Golpe Trespassante: ${target.cardName} sofreu ${amount} de dano.`,
	);
}
