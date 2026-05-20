// Registra todos os handlers de habilidades no registry.
// Importar este módulo uma vez popula o registry completo.

import { register } from "../registry";
import { handleArmor } from "./armor";
import { handleDamageBonus } from "./damage_bonus";
import { handleDamageBonusDuration } from "./damage_bonus_duration";
import { handleDiceFix } from "./diceFix";
import { handleDiceFixDamage } from "./diceFix_damage";
import { handleDiceModification } from "./dice_modification";
import { handleDiscardDungeonPrevention } from "./discardDungeon_prevention";
import { handleHeal } from "./heal";
import { handleHealOrDamageBonus } from "./heal_or_damage_bonus";
import { handleHealOrSurvive } from "./heal_or_survive";
import { handleMarkAndTohit } from "./mark_and_tohit";
import { handleRecoverDungeon } from "./recoverDungeon";
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
register("heal_or_survive", handleHealOrSurvive);
register("diceFix", handleDiceFix);
register("damage_bonus_duration", handleDamageBonusDuration);
register("heal_or_damage_bonus", handleHealOrDamageBonus);
register("token", handleToken);
register("diceFix_damage", handleDiceFixDamage);
