// Estado de uma criatura/subboss durante a partida.
// Derivado da carta JSON ao spawnar na sala e mutado pelo reducer durante o combate.

export type EnemyStatus = "active" | "defeated" | "fled" | "removed";

export interface EnemyState {
	readonly id: string;
	readonly cardId: string;
	readonly cardName: string;
	readonly maxLife: number;
	currentLife: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	// Tokens de efeito (ex.: escudo, eco) indexados por nome
	readonly tokens: Readonly<Record<string, number>>;
	readonly conditions: readonly string[];
	// Controle para a regra de escudo: só se aplica ao primeiro dano do turno
	firstDamageTakenThisTurn: boolean;
	status: EnemyStatus;
	// Impede que esta criatura conceda recompensas ao ser derrotada (ex: Fuga Covarde)
	noReward?: boolean;
	// Marca que este inimigo é um subchefe (para tracking e UI)
	isSubboss?: boolean;
}
