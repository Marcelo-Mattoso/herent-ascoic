// Registra todos os handlers de habilidades no registry.
// Importar este módulo uma vez popula o registry completo.
//
// Lote 1 (Patch-12): removidos dungeonLevel, discardDungeon, reward,
//   discardDungeonLock, flee_block, heal_block
// Lote 2 (Patch-12): removido purple_damage_reduction
// Lote 3 (Patch-12): removidos heal_or_damage_bonus, heal_or_survive, item_or_discardDungeon
// Lote 4 (Patch-12): removidos tohit, tohit_penalty, direct_damage
// Fase 7 (Patch-12): removido script (skill_living_ember_oil usa script field nativo)
// Patch-16 Lote A: removido heal
// Patch-16 Lote B: removidos armor, prevent_damage, targetProtection, recoverDungeon,
//   mark_and_tohit, drawItem, discardDungeon_prevention, dungeon, tohit_damage,
//   damage_bonus_duration

import { register } from "../registry";
import { handleDamageBonus } from "./damage_bonus";
import { handleDiceModification } from "./dice_modification";
import { handleDiceFix } from "./diceFix";
import { handleDiceFixDamage } from "./diceFix_damage";
import { handleItemControl } from "./itemControl";
import { handleNoop } from "./noop";
import { handleReroll } from "./reroll";
import { handleSplashDamage } from "./splash_damage";
import { handleTargetRedirectOrTohit } from "./targetRedirect_or_tohit";
import { handleToken } from "./token";

register("damage_bonus", handleDamageBonus);
register("dice_modification", handleDiceModification);
register("diceFix", handleDiceFix);
register("diceFix_damage", handleDiceFixDamage);
register("token", handleToken);
register("itemControl", handleItemControl);
register("splash_damage", handleSplashDamage);
register("reroll", handleReroll);
register("targetRedirect_or_tohit", handleTargetRedirectOrTohit);
register("noop", handleNoop);
// directDamage (skill_opportunity_shot): handler removido com direct_damage.ts;
// skill_opportunity_shot será migrada para script no Lote C.
// Por ora cai no fallback noop do dispatch.
