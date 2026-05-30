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
// Patch-16 Lote C: removidos dice_modification, diceFix, diceFix_damage,
//   targetRedirect_or_tohit, itemControl, token, splash_damage, reroll, damage_bonus
// Todos os handlers legados foram migrados para DSL (effect) ou script.

import { register } from "../registry";
import { handleNoop } from "./noop";

register("noop", handleNoop);
