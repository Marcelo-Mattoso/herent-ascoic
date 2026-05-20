// Dano em área ao destruir uma criatura com ataque.
// Aplica `value` de dano a outra criatura ativa na mesma sala.
// Cobre: habilidade-golpe-trespassante (Espada do Trespasse, Lâmina Vermelha).

import type { SkillContext } from "../../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { parseNumber } from "../valueParsers";
import { log, mapEnemy } from "../../reducer/utils";

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
	const target = others.reduce((a, b) => (a.currentLife <= b.currentLife ? a : b));

	const next = mapEnemy(state, target.id, (e) => ({
		...e,
		currentLife: Math.max(0, e.currentLife - amount),
		status: e.currentLife - amount <= 0 ? "defeated" : e.status,
	}));
	return log(next, `Golpe Trespassante: ${target.cardName} sofreu ${amount} de dano.`);
}
