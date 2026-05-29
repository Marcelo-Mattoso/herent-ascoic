// Registra todos os handlers de habilidades no registry.
// Importar este módulo uma vez popula o registry completo.
//
// Lote 1 (Patch-12): removidos dungeonLevel, discardDungeon, reward,
//   discardDungeonLock, flee_block, heal_block
// Lote 2 (Patch-12): removido purple_damage_reduction
// Lote 3 (Patch-12): removidos heal_or_damage_bonus, heal_or_survive, item_or_discardDungeon

import { register } from "../registry";
import { handleArmor } from "./armor";
import { handleDamageBonus } from "./damage_bonus";
import { handleDamageBonusDuration } from "./damage_bonus_duration";
import { handleDiceFix } from "./diceFix";
import { handleDiceFixDamage } from "./diceFix_damage";
import { handleDiceModification } from "./dice_modification";

import { handleDiscardDungeonPrevention } from "./discardDungeon_prevention";
import { handleDrawItem } from "./drawItem";
import { handleScript } from "./script";
import { handleDungeon } from "./dungeon";
import { handleSplashDamage } from "./splash_damage";
import { handleItemControl } from "./itemControl";
import { handleTargetProtection } from "./targetProtection";
import { handleHeal } from "./heal";
import { handleMarkAndTohit } from "./mark_and_tohit";
import { handleNoop } from "./noop";
import { handlePreventDamage } from "./prevent_damage";
import { handleRecoverDungeon } from "./recoverDungeon";
import { handleReroll } from "./reroll";

import { handleTohitDamage } from "./tohit_damage";

import { handleTargetRedirectOrTohit } from "./targetRedirect_or_tohit";
import { handleToken } from "./token";

// Heróis
register("damage_bonus", handleDamageBonus);
register("heal", handleHeal);
register("armor", handleArmor);
register("dice_modification", handleDiceModification);
register("discardDungeon_prevention", handleDiscardDungeonPrevention);
register("mark_and_tohit", handleMarkAndTohit);
register("recoverDungeon", handleRecoverDungeon);
register("tohit_damage", handleTohitDamage);
register("diceFix", handleDiceFix);
register("damage_bonus_duration", handleDamageBonusDuration);
register("token", handleToken);
register("diceFix_damage", handleDiceFixDamage);

// Itens / criaturas / salas
register("prevent_damage", handlePreventDamage);

// Handlers com SKILL_CHOICE (ainda ativos)
register("itemControl", handleItemControl);
register("targetProtection", handleTargetProtection);
register("dungeon", handleDungeon);

// Dano em área
register("splash_damage", handleSplashDamage);

// Reroll interativo
register("reroll", handleReroll);

// Redirecionamento de alvo
register("targetRedirect_or_tohit", handleTargetRedirectOrTohit);

// DrawItem — Espólios da Fornalha
register("drawItem", handleDrawItem);

// Scripts de carta
register("script", handleScript);

// Fallback
register("noop", handleNoop);
