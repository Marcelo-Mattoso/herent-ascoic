// Registra todos os handlers de habilidades no registry.
// Importar este módulo uma vez popula o registry completo.

import { register } from "../registry";
import { handleArmor } from "./armor";
import { handleDamageBonus } from "./damage_bonus";
import { handleDamageBonusDuration } from "./damage_bonus_duration";
import { handleDiceFix } from "./diceFix";
import { handleDiceFixDamage } from "./diceFix_damage";
import { handleDiceModification } from "./dice_modification";
import { handleDirectDamage } from "./direct_damage";
import { handleDiscardDungeon } from "./discardDungeon";
import { handleDiscardDungeonLock } from "./discardDungeonLock";
import { handleDiscardDungeonPrevention } from "./discardDungeon_prevention";
import { handleDungeonLevel } from "./dungeonLevel";
import { handleHeal } from "./heal";
import { handleHealBlock } from "./heal_block";
import { handleHealOrDamageBonus } from "./heal_or_damage_bonus";
import { handleHealOrSurvive } from "./heal_or_survive";
import { handleMarkAndTohit } from "./mark_and_tohit";
import { handleNoop } from "./noop";
import { handlePreventDamage } from "./prevent_damage";
import { handleRecoverDungeon } from "./recoverDungeon";
import { handleReward } from "./reward";
import { handleTohit } from "./tohit";
import { handleTohitDamage } from "./tohit_damage";
import { handleTohitPenalty } from "./tohit_penalty";
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
register("heal_or_survive", handleHealOrSurvive);
register("diceFix", handleDiceFix);
register("damage_bonus_duration", handleDamageBonusDuration);
register("heal_or_damage_bonus", handleHealOrDamageBonus);
register("token", handleToken);
register("diceFix_damage", handleDiceFixDamage);

// Itens / criaturas / salas
register("direct_damage", handleDirectDamage);
register("directDamage", handleDirectDamage); // alias com camelCase do catálogo
register("tohit", handleTohit);
register("prevent_damage", handlePreventDamage);
register("dungeonLevel", handleDungeonLevel);

// Onda A (patch-8 fase 2)
register("tohit_penalty", handleTohitPenalty);
register("healBlock", handleHealBlock);
register("discardDungeonLock", handleDiscardDungeonLock);
register("discardDungeon", handleDiscardDungeon);
register("reward", handleReward);

// Tipos não implementados (noop com log)
const noopTypes = [
	"reroll", "drawItem", "recover_item", "flee_block",
	"item_or_discardDungeon", "itemControl",
	"targetProtection", "targetRedirect_or_tohit", "dungeon",
	"purple_damage_reduction",
];
for (const t of noopTypes) {
	register(t, handleNoop);
}
