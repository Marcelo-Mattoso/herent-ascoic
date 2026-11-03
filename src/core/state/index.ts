// Barrel de re-exports do módulo de estado.

export type { Color, ColorIndex } from "./color";
export { COLORS } from "./color";
export { ActivationTracker } from "./activation";
export type {
	ActivationLock,
	ActivationLocks,
	ActivationScope,
	ActivationSubjectKind,
} from "./activation";
export type {
	BonusEntry,
	CombatPair,
	CombatRollResult,
	CombatState,
} from "./combatState";
export { createEmptyCombatState } from "./combatState";
export type {
	EnemyRecord,
	EnemyState,
	EnemyStats,
	EnemyStatus,
} from "./enemyState";
export type {
	Difficulty,
	GameConfig,
	GameMode,
	GameState,
	GroupArtifact,
} from "./gameState";
export { createInitialGameState } from "./gameState";
export type {
	HeroRecord,
	HeroState,
	HeroStats,
	HeroStatus,
	ItemSlotType,
} from "./heroState";
export type { RewardType, RoomState, RoomStatus } from "./roomState";
export type { GameStatus } from "./status";
