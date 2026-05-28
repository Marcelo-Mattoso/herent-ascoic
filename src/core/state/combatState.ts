// Estado do combate em andamento dentro de uma sala.
// Criado em COMBAT_START e descartado ao sair da sala.
// Patch 2: phase controla o micro-estado do turno; selectedHeroId é o herói aguardando alvo.
// Patch 5: engajamento 1-para-1 removido (v2 §8.8); múltiplos heróis podem atacar o mesmo inimigo.

export interface BonusEntry {
	readonly source: string;
	readonly value: number;
}

export interface CombatRollResult {
	readonly heroId: string;
	readonly enemyId: string;
	readonly heroResults: readonly number[];
	readonly heroTotal: number;
	readonly heroBreakdown: readonly BonusEntry[];
	readonly enemyResults: readonly number[];
	readonly enemyTotal: number;
	readonly enemyBreakdown: readonly BonusEntry[];
}

export interface CombatPair {
	readonly heroId: string;
	readonly enemyId: string;
}

export interface TemporaryEffect {
	readonly id: string;
	readonly description: string;
	// Quantas rodadas o efeito ainda dura (-1 = até a sala terminar)
	readonly roundsLeft: number;
}

export type CombatPhase =
	| "selecting_hero" // aguardando o jogador escolher qual herói age
	| "selecting_target" // herói selecionado, aguardando escolha de monstro
	| "resolving" // par herói↔monstro formado, aguardando rolar/resolver
	| "between_heroes" // resolução concluída, transição para próximo herói
	| "direct_damage" // monstros sem oponente causam dano direto
	| "round_end"; // fim de rodada, limpeza antes da próxima

// Bônus de skill individual para o próximo ataque (label = nome da skill, value = valor)
export interface SkillBonusEntry {
	readonly label: string;
	readonly value: number;
}

export interface CombatState {
	round: number;
	phase: CombatPhase;
	selectedHeroId: string | null;
	readonly heroesActed: readonly string[];
	readonly pairs: readonly CombatPair[];
	lastRoll: CombatRollResult | null;
	// Heróis que já usaram o Escudo Rachado neste combate
	readonly shieldsUsedThisCombat: Readonly<Record<string, boolean>>;
	// Heróis que usaram o poder do Bárbaro nesta sala
	readonly powersUsedThisRoom: Readonly<Record<string, boolean>>;
	// Dados extras concedidos por poder (ex: Bárbaro Rubro +1 dado)
	readonly extraDice: Readonly<Record<string, number>>;
	// Controle Azhakar: primeiro dano do turno já sofreu redução de Trono Vivo
	bossFirstDamageReduced: boolean;
	readonly temporaryEffects: readonly TemporaryEffect[];
	// Bônus de dano para o próximo ataque de cada herói — array de entradas por skill (consumido após uso)
	readonly bonusNextAttack: Readonly<Record<string, readonly SkillBonusEntry[]>>;
	// Redução de dano recebido ativa por herói (ex: Guerreiro power até fim da rodada)
	readonly damageReduction: Readonly<Record<string, number>>;
	// Presa do Caçador: id do inimigo marcado como alvo preferencial
	prey: string | null;
	// Token do Necromante (Eco): 0 = sem eco, 1 = eco disponível
	readonly ecoTokens: Readonly<Record<string, number>>;
	// Herói declarou tentativa de fuga — o próximo confronto resolve a fuga
	readonly fleeAttemptByHero: Readonly<Record<string, boolean>>;
	// Seleção interativa de dado pendente (reroll, diceFix)
	pendingDiceSelection?: {
		readonly skillId: string;
		readonly heroId: string;
		readonly side: "hero" | "enemy" | "any";
		readonly filter?: { readonly value?: number; readonly minValue?: number };
		readonly action: "reroll" | "set_to";
		readonly setToValue?: number;
	};
	// Penalidade de acerto por herói (ex: Calor Escaldante, Corpo Gelatinoso)
	readonly tohitPenaltyByHero: Readonly<Record<string, number>>;
	// Inimigo ignora 1º efeito de item (Evasão das Fendas)
	readonly itemControlByEnemy: Readonly<Record<string, boolean>>;
	// Herói ignora 1º efeito que o escolha como alvo (Véu Protetor)
	readonly targetProtectionByHero: Readonly<Record<string, boolean>>;
	// Flags de uso por escopo (guards once_per_*)
	readonly oncePer: {
		readonly room: Readonly<Record<string, boolean>>;
		readonly combat: Readonly<Record<string, boolean>>;
		readonly round: Readonly<Record<string, boolean>>;
	};
}

export function createEmptyCombatState(): CombatState {
	return {
		round: 0,
		phase: "selecting_hero",
		selectedHeroId: null,
		heroesActed: [],
		pairs: [],
		lastRoll: null,
		shieldsUsedThisCombat: {},
		powersUsedThisRoom: {},
		extraDice: {},
		bossFirstDamageReduced: false,
		temporaryEffects: [],
		oncePer: { room: {}, combat: {}, round: {} },
		bonusNextAttack: {},
		damageReduction: {},
		prey: null,
		ecoTokens: {},
		fleeAttemptByHero: {},
		tohitPenaltyByHero: {},
		itemControlByEnemy: {},
		targetProtectionByHero: {},
	};
}
