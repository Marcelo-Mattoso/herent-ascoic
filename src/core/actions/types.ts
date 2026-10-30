// União discriminada de todas as actions do jogo.
// A UI e os testes disparam estas actions. O reducer as processa.

import type { XpSpendOption } from "../config/defaults";
import type { GameConfig } from "../state/gameState";
import type { ItemSlotType } from "../state/heroState";

export interface LoggedAction {
	readonly seq: number;
	readonly action: Action;
}

// ── Zonas de inventário (Patch 4) ─────────────────────────────────────────────
// "from" = onde o item está agora; "to" = destino.
export type InvFromZone =
	| { kind: "mesa" }
	| { kind: "hero_slot"; heroId: string; slotType: ItemSlotType }
	| { kind: "hero_backpack"; heroId: string; index: number };

export type InvToZone =
	| { kind: "mesa" }
	| { kind: "hero_equip"; heroId: string; slotType?: ItemSlotType }
	| { kind: "hero_backpack"; heroId: string };

export type { XpSpendOption };

export type Action =
	| {
			type: "START_GAME";
			payload: GameConfig & {
				seed?: number;
				gameId?: string;
				deferInitialRoomReveal?: boolean;
			};
	  }
	| { type: "REVEAL_ROOM" }
	| { type: "RESOLVE_ROOM_EFFECT" }
	| { type: "SPAWN_ENEMIES" }
	| { type: "START_COMBAT" }
	| { type: "CHOOSE_HERO"; payload?: { heroId: string } }
	| { type: "CHOOSE_HERO_FOR_ROUND"; payload: { heroId: string } }
	| { type: "PASS_HERO_ACTION"; payload: { heroId: string } }
	| { type: "CANCEL_HERO_SELECTION" }
	| { type: "CHOOSE_TARGET"; payload: { heroId: string; enemyId: string } }
	| { type: "ROLL_DICE" }
	| { type: "PREPARE_PHYSICAL_ROLL" }
	| { type: "PREPARE_EXTRA_ATTACK" }
	| {
			type: "CONFIRM_DICE_ROLL";
			payload: {
				rollId: string;
				heroId: string;
				enemyId: string;
				heroResults: readonly number[];
				enemyResults: readonly number[];
				source: "physics" | "fallback";
			};
	  }
	| { type: "RESOLVE_ATTACK" }
	| {
			type: "APPLY_DAMAGE";
			payload: { targetType: "hero" | "enemy"; id: string; amount: number };
	  }
	| { type: "CHECK_COMBAT_END" }
	| { type: "DIRECT_DAMAGE" }
	| {
			type: "USE_ITEM";
			payload: {
				itemId: string;
				heroId: string;
				targetHeroId?: string;
				targetEnemyId?: string;
			};
	  }
	| { type: "USE_POWER"; payload: { heroId: string } }
	| { type: "GRANT_REWARDS" }
	| {
			type: "CHOOSE_ITEM_DESTINATION";
			payload: {
				heroId: string;
				destination: "equip" | "backpack" | "discard";
			};
	  }
	| {
			type: "CHOOSE_ARTIFACT_BEARER";
			payload: { heroId: string | null };
	  }
	| { type: "GAIN_XP"; payload: { amount: number } }
	| { type: "SPEND_XP"; payload: { option: XpSpendOption; heroId?: string } }
	| { type: "OPEN_PATHS" }
	| { type: "CHOOSE_PATH"; payload: { cardId: string } }
	| { type: "DISCARD_PATHS" }
	| { type: "CHECK_BOSS_CONDITION" }
	| { type: "REVEAL_BOSS" }
	| { type: "CONTINUE_EXPLORATION" }
	| { type: "START_BOSS_COMBAT" }
	| { type: "DUNGEON_EXHAUSTED" }
	| { type: "VICTORY" }
	| { type: "DEFEAT"; payload: { reason: string } }
	// ── Inventário do grupo (Patch 4) ─────────────────────────────────────────
	| {
			// Move geral entre qualquer zona — substitui INV_ASSIGN_ITEM
			type: "INV_MOVE";
			payload: { itemId: string; from: InvFromZone; to: InvToZone };
	  }
	| {
			type: "INV_ASSIGN_ITEM"; // mantido por compatibilidade
			payload: {
				itemId: string;
				heroId: string;
				destination: "equip" | "backpack";
			};
	  }
	| {
			type: "INV_ASSIGN_ARTIFACT";
			payload: {
				artifactId: string;
				vagaIndex: number;
				heroId: string | null;
			};
	  }
	| {
			type: "INV_SET_BEARER";
			payload: { vagaIndex: number; heroId: string | null };
	  }
	| { type: "INV_DISCARD_MESA" }
	// ── Engine de habilidades (Patch 7) ──────────────────────────────────────────
	| {
			type: "USE_SKILL";
			payload: {
				skillId: string;
				sourceId: string;
				targetIds?: string[];
				value?: number | string | null;
			};
	  }
	| { type: "SELECT_SKILL_TARGET"; payload: { targetId: string } }
	| { type: "CANCEL_SKILL_TARGET" }
	// ── Escolha de habilidade (Patch 8) ──────────────────────────────────────────
	| { type: "SKILL_CHOICE"; payload: { skillId: string; choice: string } }
	// ── Interrupção de trigger (habilidade/item/inimigo em uma fase) ───────────
	| { type: "APPLY_TRIGGER_INTERRUPT"; payload?: { interruptId?: string } }
	| { type: "SKIP_TRIGGER_INTERRUPT"; payload?: { interruptId?: string } }
	// ── Fuga (Patch 8 F3) ────────────────────────────────────────────────────────
	| { type: "DECLARE_FLEE"; payload: { heroId: string } }
	| { type: "RESTART_DUNGEON"; payload: { keepEquipment: boolean } }
	// ── Seleção de dado (Patch 8 F8) ─────────────────────────────────────────────
	| {
			type: "SELECT_DIE";
			payload: { side: "hero" | "enemy"; index: number; value?: number };
	  };
