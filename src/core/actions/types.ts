// União discriminada de todas as actions do jogo.
// A UI e os testes disparam estas actions. O reducer as processa.

import type { XpSpendOption } from "../config/defaults";
import type { GameConfig } from "../state/gameState";
import type { ItemSlotType } from "../state/heroState";

// ── Zonas de inventário (Patch 4) ─────────────────────────────────────────────
// "from" = onde o item está agora; "to" = destino.
export type InvFromZone =
	| { kind: "mesa" }
	| { kind: "hero_slot"; heroId: string; slotType: ItemSlotType }
	| { kind: "hero_backpack"; heroId: string; index: number };

export type InvToZone =
	| { kind: "mesa" }
	| { kind: "hero_equip"; heroId: string } // auto-slot pelo itemClass
	| { kind: "hero_backpack"; heroId: string };

export type { XpSpendOption };

export type Action =
	| { type: "START_GAME"; payload: GameConfig }
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
	| { type: "RESOLVE_ATTACK" }
	| {
			type: "APPLY_DAMAGE";
			payload: { targetType: "hero" | "enemy"; id: string; amount: number };
	  }
	| { type: "CHECK_COMBAT_END" }
	| { type: "DIRECT_DAMAGE" }
	| {
			type: "USE_ITEM";
			payload: { itemName: string; heroId: string; targetHeroId?: string };
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
	| { type: "CHOOSE_PATH"; payload: { cardName: string } }
	| { type: "DISCARD_PATHS" }
	| { type: "CHECK_BOSS_CONDITION" }
	| { type: "REVEAL_BOSS" }
	| { type: "START_BOSS_COMBAT" }
	| { type: "DUNGEON_EXHAUSTED" }
	| { type: "VICTORY" }
	| { type: "DEFEAT"; payload: { reason: string } }
	// ── Inventário do grupo (Patch 4) ─────────────────────────────────────────
	| {
			// Move geral entre qualquer zona — substitui INV_ASSIGN_ITEM
			type: "INV_MOVE";
			payload: { itemName: string; from: InvFromZone; to: InvToZone };
	  }
	| {
			type: "INV_ASSIGN_ITEM"; // mantido por compatibilidade
			payload: {
				itemName: string;
				heroId: string;
				destination: "equip" | "backpack";
			};
	  }
	| {
			type: "INV_ASSIGN_ARTIFACT";
			payload: { artifactName: string; vagaIndex: 0 | 1; heroId: string | null };
	  }
	| {
			type: "INV_SET_BEARER";
			payload: { vagaIndex: number; heroId: string | null };
	  }
	| { type: "INV_DISCARD_MESA" };
