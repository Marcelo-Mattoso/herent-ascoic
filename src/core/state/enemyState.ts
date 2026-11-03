// Registro de uma criatura/subboss durante a partida. Vida, atributos de combate,
// condições e tokens vivem no ECS (state.world); EnemyState é a projeção de access.ts.

export type EnemyStatus = "active" | "defeated" | "fled" | "removed";

export interface EnemyRecord {
	readonly id: string;
	readonly cardId: string;
	// Controle para a regra de escudo: só se aplica ao primeiro dano do turno
	firstDamageTakenThisTurn: boolean;
	status: EnemyStatus;
	// Impede que esta criatura conceda recompensas ao ser derrotada (ex: Fuga Covarde)
	noReward?: boolean;
	// Marca que este inimigo é um subchefe (para tracking e UI)
	isSubboss?: boolean;
}

export interface EnemyStats {
	readonly maxLife: number;
	readonly currentLife: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	// Tokens de efeito (ex.: escudo, eco) indexados por nome
	readonly tokens: Readonly<Record<string, number>>;
	readonly conditions: readonly string[];
}

export type EnemyState = EnemyRecord & EnemyStats;
