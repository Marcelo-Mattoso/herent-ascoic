// Estado do combate em andamento dentro de uma sala.
// Criado em COMBAT_START e descartado ao sair da sala.

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

export interface CombatState {
	round: number;
	readonly heroesActed: readonly string[];
	readonly enemiesEngaged: readonly string[];
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
}

export function createEmptyCombatState(): CombatState {
	return {
		round: 0,
		heroesActed: [],
		enemiesEngaged: [],
		pairs: [],
		lastRoll: null,
		shieldsUsedThisCombat: {},
		powersUsedThisRoom: {},
		extraDice: {},
		bossFirstDamageReduced: false,
		temporaryEffects: [],
	};
}
