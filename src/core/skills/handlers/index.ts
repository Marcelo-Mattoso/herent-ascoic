// Registra todos os handlers de habilidades no registry.
// Importar este módulo uma vez popula o registry completo.
//
// Lote 1 (Patch-12): removidos dungeonLevel, discardDungeon, reward,
//   discardDungeonLock, flee_block, heal_block
// Lote 2 (Patch-12): removido purple_damage_reduction
// Lote 3 (Patch-12): removidos heal_or_damage_bonus, heal_or_survive, item_or_discardDungeon
// Lote 4 (Patch-12): removidos tohit, tohit_penalty, direct_damage
// Fase 7 (Patch-12): removido script (skill_living_ember_oil usa script field nativo)

import { register } from "../registry";
import { handleArmor } from "./armor";
import { handleDamageBonus } from "./damage_bonus";
import { handleDamageBonusDuration } from "./damage_bonus_duration";
import { handleDiceModification } from "./dice_modification";
import { handleDiceFix } from "./diceFix";
import { handleDiceFixDamage } from "./diceFix_damage";
import { handleDiscardDungeonPrevention } from "./discardDungeon_prevention";
import { handleDrawItem } from "./drawItem";
import { handleDungeon } from "./dungeon";
import { handleHeal } from "./heal";
import { handleItemControl } from "./itemControl";
import { handleMarkAndTohit } from "./mark_and_tohit";
import { handleNoop } from "./noop";
import { handlePreventDamage } from "./prevent_damage";
import { handleRecoverDungeon } from "./recoverDungeon";
import { handleReroll } from "./reroll";
import { handleSplashDamage } from "./splash_damage";
import { handleTargetProtection } from "./targetProtection";
import { handleTargetRedirectOrTohit } from "./targetRedirect_or_tohit";
import { handleTohitDamage } from "./tohit_damage";
import { handleToken } from "./token";

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
register("prevent_damage", handlePreventDamage);
register("itemControl", handleItemControl);
register("targetProtection", handleTargetProtection);
register("dungeon", handleDungeon);
register("splash_damage", handleSplashDamage);
register("reroll", handleReroll);
register("targetRedirect_or_tohit", handleTargetRedirectOrTohit);
register("drawItem", handleDrawItem);
register("noop", handleNoop);
// directDamage (skill_opportunity_shot): handler removido com direct_damage.ts;
// skill_opportunity_shot será migrada para script no Lote 4 restante.
// Por ora cai no fallback noop do dispatch.
