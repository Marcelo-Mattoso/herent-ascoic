// União discriminada de todos os estados da máquina de estados do jogo.
// O reducer transita entre estes estados ao processar cada action.

export type GameStatus =
	// Menus e configuração
	| "MAIN_MENU"
	| "SETUP_MODE"
	| "SETUP_DIFFICULTY"
	| "SETUP_HERO"
	| "SETUP_CONFIRM"
	// Exploração de sala
	| "REVEAL_ROOM"
	| "ROOM_EFFECT"
	| "SPAWN_ENEMIES"
	// Combate
	| "COMBAT_START"
	| "HERO_ACTION"
	| "ROLL_DICE"
	| "RESOLVE_ATTACK"
	| "CHECK_COMBAT_END"
	| "DIRECT_DAMAGE"
	// Pós-sala
	| "REWARD_PHASE"
	| "XP_SPEND_PHASE"
	| "OPEN_PATHS"
	| "CHOOSE_PATH"
	| "DISCARD_PATHS"
	| "SHUFFLE_REMAINING"
	| "CHECK_BOSS_CONDITION"
	// Deck esgotado — aguarda jogador pagar 5 XP ou aceitar derrota
	| "DUNGEON_EXHAUSTED"
	// Boss
	| "BOSS_REVEAL"
	| "BOSS_COMBAT"
	// Terminal
	| "VICTORY"
	| "DEFEAT";
