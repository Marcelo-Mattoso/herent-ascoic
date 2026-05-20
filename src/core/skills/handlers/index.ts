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
import { handleDrawItem } from "./drawItem";
import { handlePurpleDamageReduction } from "./purple_damage_reduction";
import { handleDungeon } from "./dungeon";
import { handleDungeonLevel } from "./dungeonLevel";
import { handleFleeBlock } from "./flee_block";
import { handleSplashDamage } from "./splash_damage";
import { handleItemControl } from "./itemControl";
import { handleItemOrDiscardDungeon } from "./item_or_discardDungeon";
import { handleTargetProtection } from "./targetProtection";
import { handleHeal } from "./heal";
import { handleHealBlock } from "./heal_block";
import { handleHealOrDamageBonus } from "./heal_or_damage_bonus";
import { handleHealOrSurvive } from "./heal_or_survive";
import { handleMarkAndTohit } from "./mark_and_tohit";
import { handleNoop } from "./noop";
import { handlePreventDamage } from "./prevent_damage";
import { handleRecoverDungeon } from "./recoverDungeon";
import { handleReroll } from "./reroll";
import { handleReward } from "./reward";
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

// Onda B (patch-8 fase 5) — handlers com SKILL_CHOICE
// Imports com side-effect de registerContinuation já ocorrem acima
register("item_or_discardDungeon", handleItemOrDiscardDungeon);
register("itemControl", handleItemControl);
register("targetProtection", handleTargetProtection);
register("dungeon", handleDungeon);

// Fuga (Onda C — patch-8 fase 3)
register("flee_block", handleFleeBlock);

// Dano em área + alternativo (patch-8 fases 6/7)
register("splash_damage", handleSplashDamage);

// Reroll interativo (patch-8 fase 8)
register("reroll", handleReroll);

// Redirecionamento de alvo (patch-8 fase 9)
register("targetRedirect_or_tohit", handleTargetRedirectOrTohit);

// DrawItem — Espólios da Fornalha (patch-8 fase 12)
register("drawItem", handleDrawItem);

// Redução de dano roxo (patch-8 fase 10)
register("purple_damage_reduction", handlePurpleDamageReduction);

// Tipos não implementados (noop com log)
const noopTypes = [
	"recover_item",
];
for (const t of noopTypes) {
	register(t, handleNoop);
}
