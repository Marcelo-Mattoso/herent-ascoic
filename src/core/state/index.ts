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
	TemporaryEffect,
} from "./combatState";
export { createEmptyCombatState } from "./combatState";
export type { DeckState } from "./deckState";
export { createEmptyDeck } from "./deckState";
export type { EnemyState, EnemyStatus } from "./enemyState";
export type {
	Difficulty,
	GameConfig,
	GameDecks,
	GameMode,
	GameState,
	GroupArtifact,
} from "./gameState";
export { createInitialGameState } from "./gameState";
export type { HeroState, HeroStatus, ItemSlotType } from "./heroState";
export type { RewardType, RoomState, RoomStatus } from "./roomState";
export type { GameStatus } from "./status";
