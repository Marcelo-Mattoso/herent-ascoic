// Estado da sala em jogo.
// Criado ao revelar uma carta de dungeon e descartado ao escolher o próximo caminho.

export type RewardType = "item" | "artifact";

export type RoomStatus = "active" | "cleared";

export interface RoomState {
	readonly cardId: string;
	readonly exits: number;
	readonly currentEnemies: number;
	readonly reward: number;
	readonly rewardType: RewardType;
	readonly effect: string;
	readonly xp: number;
	readonly specialCreatureId?: string;
	status: RoomStatus;
}
