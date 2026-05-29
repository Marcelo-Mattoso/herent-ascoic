// Registra todos os handlers de habilidades no registry.
// Importar este módulo uma vez popula o registry completo.
//
// Lote 1 (Patch-12): removidos handlers absorvidos pela DSL:
//   dungeonLevel, discardDungeon, reward, discardDungeonLock, flee_block, heal_block

import { register } from "../registry";
import { handleArmor } from "./armor";
import { handleDamageBonus } from "./damage_bonus";
import { handleDamageBonusDuration } from "./damage_bonus_duration";
import { handleDiceFix } from "./diceFix";
import { handleDiceFixDamage } from "./diceFix_damage";
import { handleDiceModification } from "./dice_modification";
import { handleDirectDamage } from "./direct_damage";
import { handleDiscardDungeonPrevention } from "./discardDungeon_prevention";
import { handleDrawItem } from "./drawItem";
import { handlePurpleDamageReduction } from "./purple_damage_reduction";
import { handleScript } from "./script";
import { handleDungeon } from "./dungeon";
import { handleSplashDamage } from "./splash_damage";
import { handleItemControl } from "./itemControl";
import { handleItemOrDiscardDungeon } from "./item_or_discardDungeon";
import { handleTargetProtection } from "./targetProtection";
import { handleHeal } from "./heal";
import { handleHealOrDamageBonus } from "./heal_or_damage_bonus";
import { handleHealOrSurvive } from "./heal_or_survive";
import { handleMarkAndTohit } from "./mark_and_tohit";
import { handleNoop } from "./noop";
import { handlePreventDamage } from "./prevent_damage";
import { handleRecoverDungeon } from "./recoverDungeon";
import { handleReroll } from "./reroll";
import { handleTohit } from "./tohit";
import { handleTohitDamage } from "./tohit_damage";
import { handleTohitPenalty } from "./tohit_penalty";
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
register("heal_or_survive", handleHealOrSurvive);
register("diceFix", handleDiceFix);
register("damage_bonus_duration", handleDamageBonusDuration);
register("heal_or_damage_bonus", handleHealOrDamageBonus);
register("token", handleToken);
register("diceFix_damage", handleDiceFixDamage);

// Itens / criaturas / salas
register("direct_damage", handleDirectDamage);
register("directDamage", handleDirectDamage); // alias camelCase — skill_opportunity_shot
register("tohit", handleTohit);
register("prevent_damage", handlePreventDamage);

// Efeitos reativos
register("tohit_penalty", handleTohitPenalty);

// Handlers com SKILL_CHOICE
register("item_or_discardDungeon", handleItemOrDiscardDungeon);
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

// Redução de dano roxo
register("purple_damage_reduction", handlePurpleDamageReduction);

// Scripts de carta
register("script", handleScript);

// Fallback
register("noop", handleNoop);
