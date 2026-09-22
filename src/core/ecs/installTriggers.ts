// Installer histórico de TriggerComponents para habilidades reativas.
//
// Pipeline canônica:
// - habilidades declaradas em skills.yaml (op_triggered) são executadas pelo
//   TriggerEngine / resolveSkillWindow, que preserva contexto e interrupções;
// - TriggerComponents do ECS são reservados para efeitos reativos instalados
//   durante a partida (armaduras, condições e efeitos temporários).
//
// Antes, a mesma habilidade de catálogo era instalada aqui E percorrida pelo
// TriggerEngine. Um DamageDealt podia, portanto, executar a habilidade duas
// vezes. Mantemos a função como adaptador no-op para chamadas de versões
// antigas, mas ela não instala mais gatilhos de catálogo.

import type { SkillRef } from "../data/cardTypes";
import type { SkillDefinition } from "../data/skillTypes";
import { isManuallyActivatable } from "../skills/useSkill";
import {
	TRIGGER_EVENT_TO_GAME_EVENT,
} from "../triggers/engine";
import type { EntityId } from "./types";
import type { World } from "./world";

// ── Passivos ───────────────────────────────────────────────────────────────────

export function isPassiveTrigger(def: SkillDefinition): boolean {
	return def.operate_type === "op_passive";
}

// ── Cobertura ──────────────────────────────────────────────────────────────────

export function hasTriggerCoverage(def: SkillDefinition): boolean {
	if (isManuallyActivatable(def)) return true;
	if (isPassiveTrigger(def)) return true;
	if (def.operate_type === "op_triggered" && def.trigger?.event) {
		return def.trigger.event in TRIGGER_EVENT_TO_GAME_EVENT;
	}
	return false;
}

// ── Instalação principal ───────────────────────────────────────────────────────

export function installSkillTriggers(
	world: World,
	_entityId: EntityId,
	_skills: readonly { def: SkillDefinition; ref: SkillRef }[],
): World {
	return world;
}
