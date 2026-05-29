#!/usr/bin/env node
/**
 * Gerador de specs para Fase 0 do patch-12.
 * Roda com: node tools/skill-port/gen-specs.js
 */
const fs = require("node:fs");
const path = require("node:path");

const OUT_DIR = path.join(__dirname, "specs");
const skills = require("../../src/data/skills.json").abilities;

// ── Handler descriptions ─────────────────────────────────────────────────────
const HANDLER_DESC = {
	damage_bonus:
		"Cobra `value` de vida do herói-fonte (applyDamageMin1) e registra `value*3` em `combat.bonusNextAttack`. Mutação direta de state.",
	heal: "Cura `value` de vida em `ctx.targetHeroIds` (fallback: herói-fonte). Checa `hero.healBlocked` antes.",
	armor:
		"Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.",
	dice_modification:
		"Apenas loga que a habilidade está disponível. A efetivação ocorre quando o jogador age via USE_SKILL — handler aqui é informacional.",
	discardDungeon_prevention:
		"Registra disponibilidade (log). A prevenção real é verificada no momento do descarte pela lógica de dungeon.",
	mark_and_tohit:
		"Define `combat.prey` (auto-seleciona se único inimigo). Com múltiplos inimigos, pede seleção do jogador.",
	recoverDungeon:
		"Recupera `count` cartas do descarte de dungeon embaralhando no deck. Se skill_id='skill_return_rite', cobra 3 de vida.",
	tohit_damage:
		"Parseia valor 'X/Y' ou número simples. Adiciona entrada em `combat.bonusNextAttack` do herói-fonte. Checa triggers compostos via `ctx.triggeredBy`.",
	heal_or_survive:
		"Escolha via `ctx.value`: 'survive' → applySurvive (deixa com 1 vida); default → applyFullHeal.",
	diceFix:
		"Configura `combat.pendingDiceSelection` com `action: 'set_to'`, `setToValue: 6`. Interativo — jogador escolhe dado.",
	damage_bonus_duration:
		"Adiciona `temporaryEffects` com id 'furia-rubra-duracao'. BUG: `damage_bonus` handler não checa essa flag — duração extra não funciona.",
	heal_or_damage_bonus:
		"Escolha via `ctx.value`: 'damage' → adiciona bonusNextAttack; default → cura todos os heróis ativos.",
	token:
		"Concede 1 Eco em `combat.ecoTokens[heroId]`. Sem implementação de gasto do Eco.",
	diceFix_damage:
		"Verifica se alvo atual é a presa. Adiciona +1 em bonusNextAttack. BUG: não fixa o dado em 6 — só adiciona bônus de dano.",
	direct_damage:
		"Causa `value` de dano via applyDamage. Resolve alvos: targetEnemyIds → heroId menor vida → targetHeroIds. parseNumber falha em '2/3'.",
	directDamage: "Alias de direct_damage. Mesmo comportamento.",
	tohit:
		"Handler vazio — devolve state inalterado. Bônus passivo coletado por `collectHeroBonuses` em outra parte da engine.",
	prevent_damage: "Apenas loga. BUG: nenhuma prevenção real de dano acontece.",
	dungeonLevel: "Incrementa `state.despertar` em `value` (máx 4).",
	discardDungeon:
		"Descarta N cartas do deck de dungeon via discardFromDungeonDeck.",
	reward: "Marca `enemy.noReward = true` na criatura-fonte via mapEnemy.",
	flee_block: "Define `state.flags.fleeBlocked = true`.",
	item_or_discardDungeon:
		"Abre SKILL_CHOICE com opções 'item' / 'dungeon'. Continuação: descarta 1 carta dungeon ou remove item da mochila/slot.",
	itemControl:
		"Seta `combat.itemControlByEnemy[enemyId] = true` (bloqueia próximo item). Usa oncePer.combat.",
	targetProtection:
		"Seta `combat.targetProtectionByHero[heroId] = true`. Consumido por consumeTargetProtection.",
	dungeon:
		"Revela N cartas do topo do deck de dungeon via SKILL_CHOICE (informacional). Continuação: noop.",
	splash_damage:
		"Aplica `value` de dano à criatura com menor vida entre as restantes (excluindo fonte).",
	reroll:
		"Configura `pendingDiceSelection` com `filter: {value: 1}`. BUG: skill_rift_second_chance não deveria filtrar por valor 1.",
	targetRedirect_or_tohit:
		"SKILL_CHOICE: 'redirect' → troca par de combate; 'tohit' → adiciona bônus em bonusNextAttack.",
	drawItem:
		"Saca N cartas do deck de itens, abre SKILL_CHOICE para escolher 1. Continuação: adiciona item às pendingRewards.",
	purple_damage_reduction:
		"Armazena redução em `state.flags['purpleDmgReduction::heroId']` com cast questionável para boolean.",
	script: "Delega para getScript(value).run(buildScriptCtx(state, ctx)).",
	heal_block: "Seta `hero.healBlocked = true` para cada herói-alvo.",
	healBlock: "Alias de heal_block.",
	discardDungeonLock: "Define `state.flags.discardDungeonLocked = true`.",
	tohit_penalty:
		"Soma `value` em `combat.tohitPenaltyByHero[heroId]`. BUG: `ctx.sourceHeroId` pode ser undefined em skills de criatura.",
	noop: "Loga '[SKILL NÃO IMPLEMENTADA]' e devolve state.",
	// Tipos não registrados
	recover_item: "NÃO REGISTRADO. Skill nunca executa.",
	roomSpecial:
		"NÃO REGISTRADO (intencional — spawn tratado via handleSpawnEnemies).",
	drawArtifact: "NÃO REGISTRADO. Skill nunca executa.",
	drawSpecificItem: "NÃO REGISTRADO. Skill nunca executa.",
	damage_reflect: "NÃO REGISTRADO. Skill nunca executa.",
	powerBlock: "NÃO REGISTRADO. Skill nunca executa.",
	dungeonLock: "NÃO REGISTRADO. Skill nunca executa.",
	tohit_damage_penalty: "NÃO REGISTRADO. Skill nunca executa.",
	item_or_damage: "NÃO REGISTRADO. Skill nunca executa.",
	item_or_tohit_penalty: "NÃO REGISTRADO. Skill nunca executa.",
	tohit_damage_heal: "NÃO REGISTRADO. Skill nunca executa.",
	armor_purple_damage_reduction: "NÃO REGISTRADO. Skill nunca executa.",
	self_damage_for_damage_until_end_of_combat:
		"NÃO REGISTRADO. Skill nunca executa.",
	room: "NÃO REGISTRADO. Sala sem efeito adicional.",
};

// ── Trigger decomposition ────────────────────────────────────────────────────
function decomposeTrigger(trigger) {
	const map = {
		before_attack: { on: "before_attack" },
		on_use: { on: "on_use" },
		on_damage_taken: { on: "on_damage_taken" },
		after_roll: { on: "after_roll" },
		while_equipped: { on: "passive" },
		once_per_round_on_damage_taken: {
			on: "on_damage_taken",
			limit: "once_per_round",
		},
		once_per_room_on_dungeon_discard: {
			on: "on_dungeon_discard",
			limit: "once_per_room",
		},
		on_win_room: { on: "on_win_room" },
		once_per_combat: { on: "on_use", limit: "once_per_combat" },
		once_per_room_after_roll: { on: "after_roll", limit: "once_per_room" },
		once_per_room: { on: "on_use", limit: "once_per_room" },
		start_of_combat: { on: "start_of_combat" },
		once_per_room_on_targeted_by_effect: {
			on: "on_targeted_by_effect",
			limit: "once_per_room",
		},
		once_per_room_on_extra_dungeon_discard: {
			on: "on_extra_dungeon_discard",
			limit: "once_per_room",
		},
		once_per_room_on_targeted: { on: "on_targeted", limit: "once_per_room" },
		once_per_game: { on: "on_use", limit: "once_per_game" },
		once_per_game_until_end_of_round: {
			on: "on_use",
			when: "always",
			limit: "once_per_game",
			duration: "until_end_of_round",
		},
		once_per_game_on_use_furia_rubra: {
			on: "on_use_skill:skill_crimson_fury",
			limit: "once_per_game",
		},
		once_per_game_on_defeat_creature: {
			on: "on_defeat_creature",
			limit: "once_per_game",
		},
		once_per_game_after_roll_vs_prey: {
			on: "after_roll",
			when: "target_is_prey",
			limit: "once_per_game",
		},
		once_per_game_after_any_roll: { on: "after_roll", limit: "once_per_game" },
		combat_if_dungeon_red_or_purple: {
			on: "combat",
			when: '{"kind":"or","children":[{"kind":"compare","op":"gte","left":"$dungeon.level","right":3}]}',
		},
		combat_if_alone_in_room: {
			on: "combat",
			when: '{"kind":"compare","op":"eq","left":"$room.enemy_count","right":1}',
		},
		combat_if_another_creature_in_room: {
			on: "combat",
			when: '{"kind":"compare","op":"gt","left":"$room.enemy_count","right":1}',
		},
		combat_vs_boss_or_subboss: {
			on: "combat",
			when: '{"kind":"compare","op":"in","left":"$target.category","right":["boss","subboss"]}',
		},
		combat_and_on_damage_dealt: { on: "combat" },
		before_attack_once_per_game: {
			on: "before_attack",
			limit: "once_per_game",
		},
		on_take_attack_damage: {
			on: "on_take_damage",
			when: '{"kind":"compare","op":"eq","left":"$damage.source","right":"attack"}',
		},
		on_take_damage: { on: "on_take_damage" },
		on_destroy_creature_with_attack: {
			on: "on_destroy_creature",
			when: '{"kind":"compare","op":"eq","left":"$kill.source","right":"attack"}',
		},
		on_enter_play: { on: "on_enter_play" },
		while_in_play: { on: "passive" },
		on_destroyed: { on: "on_destroyed" },
		first_damage_each_round: {
			on: "on_take_damage",
			when: '{"kind":"compare","op":"eq","left":"$round.first_damage","right":true}',
			limit: "once_per_round",
		},
		on_enter_room: { on: "on_enter_room" },
		on_first_targeted: { on: "on_targeted", limit: "once_per_combat" },
		on_first_target_chosen_in_room: {
			on: "on_target_chosen",
			limit: "once_per_room",
		},
		on_first_target_chosen_by_creature: {
			on: "on_target_chosen",
			limit: "once_per_combat",
		},
		while_room_active: { on: "passive" },
		while_room_active_first_combat: {
			on: "passive",
			when: '{"kind":"compare","op":"eq","left":"$room.combat_count","right":0}',
		},
		first_round_in_room: {
			on: "on_round_start",
			when: '{"kind":"compare","op":"eq","left":"$room.round_count","right":1}',
		},
		first_hero_lose_combat_in_room: {
			on: "on_lose_combat",
			limit: "once_per_room",
		},
		on_hero_lose_combat_in_room: { on: "on_lose_combat" },
		before_first_combat_in_room: {
			on: "before_combat",
			limit: "once_per_room",
		},
		before_combat: { on: "before_combat" },
		on_first_creature_destroyed_in_room: {
			on: "on_creature_destroyed",
			limit: "once_per_room",
		},
		after_each_combat_round_if_purple: {
			on: "after_combat_round",
			when: '{"kind":"compare","op":"gte","left":"$dungeon.level","right":4}',
		},
		while_active: { on: "passive" },
		heroes_attacking_self: { on: "passive" },
		on_deal_damage: { on: "on_deal_damage" },
		once_per_combat_instead_of_attack: {
			on: "on_use",
			limit: "once_per_combat",
		},
		on_purple_effect_damage_taken: {
			on: "on_take_damage",
			when: '{"kind":"compare","op":"eq","left":"$damage.type","right":"purple"}',
		},
		when_half_life_or_less: {
			on: "passive",
			when: '{"kind":"compare","op":"lte","left":"$self.currentLife","right":{"op":"div","args":["$self.maxLife",2]}}',
		},
		on_flee_or_leave_play: { on: "on_leave_play" },
		first_item_effect_received: {
			on: "on_item_used_against",
			limit: "once_per_combat",
		},
		on_reveal_paths: { on: "on_reveal_paths" },
		on_dungeon_discard: { on: "on_dungeon_discard" },
		room_passive: { on: "passive" },
		on_room_reveal: { on: "on_room_reveal" },
		combat: { on: "combat" },
		on_enter_combat: { on: "on_enter_combat" },
	};
	return map[trigger] ?? { on: trigger };
}

// ── DSL/Script decision ──────────────────────────────────────────────────────
const DECISION = {
	skill_crimson_fury: {
		path: "script",
		reason:
			"Self-damage + bonusNextAttack com duração condicional; interações entre dois estados que DSL não modela limpo.",
	},
	skill_last_light_healing: {
		path: "dsl",
		reason: "apply_heal simples com target.",
	},
	skill_bastion_guard: {
		path: "dsl",
		reason: "add_modifier damage_reduction on_damage_taken.",
	},
	skill_rift_rune: {
		path: "script",
		reason:
			"Interativo (pendingDiceSelection); jogador escolhe dado — requer fluxo de pausa/continuação específico.",
	},
	skill_hunter_focus: {
		path: "dsl",
		reason: "add_modifier tohit passivo while_equipped.",
	},
	skill_living_ember: {
		path: "dsl",
		reason:
			"apply_damage simples (a variante condicional skill_living_ember_oil já é script).",
	},
	skill_living_ember_oil: {
		path: "script",
		reason: "Já migrada no patch-10. Condicional baseada em skill do alvo.",
	},
	skill_last_light_shield: {
		path: "script",
		reason:
			"Prevenção total de dano uma vez por rodada — requer interceptação no pipeline on_take_damage; DSL precisaria de kind novo 'prevent_damage'.",
	},
	skill_preserved_path: {
		path: "script",
		reason:
			"Interceptação do pipeline de descarte de dungeon; a lógica de cancelamento é fora do vocabulário DSL atual.",
	},
	skill_rekindled_forge: {
		path: "script",
		reason:
			"Recuperação de item descartado com equip imediato — manipulação de deck + state de item complexa.",
	},
	skill_rift_second_chance: {
		path: "script",
		reason:
			"reroll interativo de qualquer dado (não filtrado por valor); requer pendingDiceSelection.",
	},
	skill_perfect_rune: {
		path: "script",
		reason: "diceFix interativo — pendingDiceSelection.",
	},
	skill_last_light_miracle: {
		path: "dsl",
		reason: "choose_one: apply_heal 2 OU add_modifier bonusNextAttack 2.",
	},
	skill_piercing_strike: {
		path: "dsl",
		reason:
			"apply_damage 1 a outra criatura quando destruir com ataque — splash_damage, DSL pura.",
	},
	skill_forge_spoils: {
		path: "script",
		reason: "draw N / keep 1 com SKILL_CHOICE e manipulação do deck de itens.",
	},
	skill_prey_mark: {
		path: "script",
		reason:
			"Marcar presa requer seleção interativa e persistência em combat.prey — estado específico além de add_modifier.",
	},
	skill_return_rite: {
		path: "script",
		reason:
			"Custo de vida + recover dungeon; custo condicional por skill_id não cabe em DSL atual.",
	},
	skill_final_dawn_light: {
		path: "dsl",
		reason:
			"add_modifier tohit+damage com trigger.when = dungeon red ou purple.",
	},
	skill_scorching_heat: {
		path: "dsl",
		reason:
			"add_modifier tohit_penalty para todos os heróis no first_roll_in_room.",
	},
	skill_crimson_chains: {
		path: "dsl",
		reason: "add_modifier flee_block com duration until_end_of_round.",
	},
	skill_sealed_door: {
		path: "dsl",
		reason: "add_modifier flee_block passivo durante primeiro combate da sala.",
	},
	skill_ruined_floor: {
		path: "dsl",
		reason:
			"discard_from dungeon 1 quando herói perde combate (once_per_room).",
	},
	skill_forge_smoke: {
		path: "dsl",
		reason: "add_modifier heal_block para todos os heróis na primeira rodada.",
	},
	skill_dark_tribute: {
		path: "dsl",
		reason:
			"choose_one: discard_from item OU discard_from dungeon antes do primeiro combate.",
	},
	skill_rift_evasion: {
		path: "script",
		reason:
			"Bloqueia primeiro efeito de item — requer interceptação no pipeline de uso de item.",
	},
	skill_chains_prison: {
		path: "dsl",
		reason:
			"add_modifier tohit_penalty -2 ao primeiro herói escolhido como alvo.",
	},
	skill_path_corruption: {
		path: "dsl",
		reason: "add_modifier discardDungeonLock passivo enquanto ativo.",
	},
	skill_lone_beast: {
		path: "dsl",
		reason: "add_modifier tohit+damage com trigger.when = alone in room.",
	},
	skill_treacherous_attack: {
		path: "dsl",
		reason: "apply_damage ao herói com menos vida no on_enter_combat.",
	},
	skill_cowardly_flee: {
		path: "dsl",
		reason: "add_modifier no_reward na criatura-fonte ao sair de jogo.",
	},
	skill_gelatinous_body: {
		path: "dsl",
		reason: "add_modifier tohit_penalty passivo para heróis atacantes.",
	},
	skill_hidden_flame_presence: {
		path: "dsl",
		reason:
			"add_modifier tohit para outra criatura com trigger.when = another creature in room.",
	},
	skill_pack_courage: {
		path: "dsl",
		reason:
			"add_modifier tohit self com trigger.when = another creature in room.",
	},
	skill_illuminate_path: {
		path: "script",
		reason:
			"Revela cartas do deck com SKILL_CHOICE informacional; manipulação de deck de dungeon.",
	},
	skill_path_safeguard: {
		path: "dsl",
		reason:
			"prevent discard_from dungeon uma vez (add_modifier dungeon_discard_prevention).",
	},
	skill_life_drain: {
		path: "dsl",
		reason: "add_trigger on_deal_damage → apply_heal self.",
	},
	skill_opportunity_shot: {
		path: "script",
		reason:
			"'ao invés de combater' requer lógica de substituição de ação de combate — fora do vocabulário DSL.",
	},
	skill_last_light_ward: {
		path: "dsl",
		reason:
			"add_modifier purple_damage_reduction com trigger.when = on_take_damage purple.",
	},
	skill_protective_veil: {
		path: "script",
		reason:
			"Interceptação de targeting — requer consumir proteção no pipeline de escolha de alvo.",
	},
	skill_focus_deflection: {
		path: "script",
		reason:
			"Redirect de alvo de combate ou +tohit — SKILL_CHOICE com estado de pairs.",
	},
	skill_minor_rune: {
		path: "script",
		reason:
			"Reroll interativo de dado com valor 1 — pendingDiceSelection com filter.",
	},
	power_greater_last_light_miracle: {
		path: "dsl",
		reason: "choose_one: apply_full_heal OU prevent_destroy (survive).",
	},
	power_unbreakable_bastion_guard: {
		path: "dsl",
		reason:
			"add_modifier damage_reduction 1 para todos os heróis until_end_of_round.",
	},
	power_restored_path: {
		path: "dsl",
		reason: "move_card dungeon discard → deck (recover_dungeon).",
	},
	power_supreme_rift_rune: {
		path: "script",
		reason:
			"choose_one com dois alvos distintos (dado aliado → 6 OU dado inimigo → 1) — pendingDiceSelection com duas opções assimétricas.",
	},
	power_mighty_crimson_fury: {
		path: "script",
		reason:
			"Reage ao uso de outra skill (skill_crimson_fury) e muda sua duração — estado de skill-watching sem paralelo em DSL.",
	},
	power_last_light_oath: {
		path: "dsl",
		reason:
			"choose_one: apply_heal 5 todos os heróis OU add_modifier bonusNextAttack 5.",
	},
	power_deep_veil_echo: {
		path: "script",
		reason:
			"Sistema de tokens com 3 opções de gasto — complexidade além de choose_one simples.",
	},
	power_hunter_execution: {
		path: "script",
		reason:
			"Condição de presa + fix dado azul + bônus de dano condicional — lógica em voo sobre o estado de rolagem.",
	},
	purple_raging_flames: {
		path: "dsl",
		reason: "apply_damage 1 a todos os heróis on_enter_play.",
	},
	purple_forge_chains: {
		path: "dsl",
		reason: "add_modifier flee_block passivo while_in_play.",
	},
	purple_ruin_ashes: {
		path: "dsl",
		reason: "discard_from dungeon 1 on_destroyed.",
	},
	purple_crimson_plate: {
		path: "dsl",
		reason:
			"add_modifier prevent_first_damage por rodada (duration: once_per_round).",
	},
	purple_ash_protection: {
		path: "dsl",
		reason: "add_modifier damage_reduction on_take_damage (self).",
	},
	purple_dark_awakening: {
		path: "dsl",
		reason: "add_modifier dungeonLevel +1 on_enter_play.",
	},
	purple_deadly_awakening: {
		path: "dsl",
		reason: "add_modifier dungeonLevel +1 on_destroyed.",
	},
	purple_ember_blood: {
		path: "dsl",
		reason: "add_trigger on_take_damage → apply_damage 1 ao atacante.",
	},
	purple_depths_seal: {
		path: "dsl",
		reason: "add_modifier block_action powers while_in_play.",
	},
	purple_dark_tribute: {
		path: "dsl",
		reason:
			"choose_one before_combat: discard_from item OU discard_from dungeon.",
	},
	purple_blood_tribute: {
		path: "dsl",
		reason:
			"choose_one before_combat: discard_from item OU apply_damage 3 a herói escolhido.",
	},
	purple_veil_retaliation: {
		path: "dsl",
		reason: "add_trigger on_hit_received → apply_damage value ao atacante.",
	},
	purple_healing_rupture: {
		path: "dsl",
		reason: "add_modifier heal_block (next heal only) on_enter_room.",
	},
	purple_ancient_veil_prison: {
		path: "dsl",
		reason: "add_modifier tohit_penalty -value ao primeiro herói alvo.",
	},
	purple_deep_veil_seal: {
		path: "dsl",
		reason: "add_modifier block_action dungeon_level_reduction while_in_play.",
	},
	purple_crimson_shackles: {
		path: "dsl",
		reason:
			"add_modifier tohit_penalty -3 + add_modifier damage_penalty -3 ao primeiro herói alvo.",
	},
	item_skill_deadly_edge: {
		path: "dsl",
		reason:
			"add_modifier tohit + add_trigger on_beat_roll_by_4 → add_modifier damage. Condicional DSL pura.",
	},
	item_skill_block: {
		path: "dsl",
		reason: "add_modifier damage_reduction on_take_damage.",
	},
	item_skill_mystic_draw: {
		path: "script",
		reason: "Saque de carta de Artefato — manipulação de deck específico.",
	},
	item_skill_last_light_blade: {
		path: "dsl",
		reason:
			"add_modifier tohit sempre + add_modifier damage com trigger.when = target is boss or subboss.",
	},
	dungeon_skill_confinement: {
		path: "dsl",
		reason: "add_modifier flee_block passivo while_room_active.",
	},
	dungeon_skill_dead_torches: {
		path: "script",
		reason:
			"choose_one com condição especial 'ignorar se Tocha de Breu'; verifica estado de item no grupo.",
	},
	dungeon_skill_column_fall: {
		path: "dsl",
		reason:
			"apply_damage 1 a outra criatura quando primeira criatura da sala é destruída.",
	},
	dungeon_skill_uneven_floor: {
		path: "dsl",
		reason: "discard_from dungeon 1 em cada lose_combat nesta sala.",
	},
	dungeon_skill_forge_spoils: {
		path: "script",
		reason:
			"draw 2 / keep 1 do deck de itens com SKILL_CHOICE — mesmo padrão de skill_forge_spoils.",
	},
	dungeon_skill_rekindled_forge: {
		path: "script",
		reason:
			"Busca primeiro item equipável no deck — manipulação específica de deck.",
	},
	dungeon_skill_summon_guardian: {
		path: "script",
		reason:
			"Spawn de criatura especial junto com sala — lógica de reveal de inimigo.",
	},
	boss_skill_living_ash_throne: {
		path: "dsl",
		reason:
			"add_modifier prevent_first_damage por rodada para o boss (mesmo padrão de purple_crimson_plate).",
	},
	boss_skill_dark_forge_pressure: {
		path: "dsl",
		reason:
			"discard_from dungeon 1 after_combat_round com trigger.when = dungeon purple.",
	},
	boss_skill_azhakar_ascension: {
		path: "dsl",
		reason:
			"add_modifier tohit +2 com trigger.when = self.currentLife <= self.maxLife/2.",
	},
	item_skill_drain_life_and_deadly_edge: {
		path: "script",
		reason:
			"Combo de duas skills com lógicas assimétricas — melhor decompor em DSL quando vocabulário cobrir ambas.",
	},
	item_skill_block_and_last_light_ward: {
		path: "dsl",
		reason:
			"Dois add_modifier independentes: damage_reduction + purple_damage_reduction.",
	},
	item_skill_crimson_fury_mighty: {
		path: "script",
		reason:
			"Combo de skill_crimson_fury + once_per_game duration extension — reutiliza lógica de scripts individuais.",
	},
	dungeon_skill_subboss_room: { path: "dsl", reason: "noop explícito." },
	dungeon_skill_empty_room: { path: "dsl", reason: "noop explícito." },
	skill_forge_awakening: {
		path: "dsl",
		reason: "add_modifier dungeonLevel +value on_use.",
	},
	skill_charred_plate: {
		path: "dsl",
		reason:
			"add_modifier damage_reduction on_take_attack_damage (self/creature).",
	},
};

// ── Bug notes ────────────────────────────────────────────────────────────────
const BUGS = {
	skill_living_ember:
		"Nenhum bug (skill genérica sem condicional). A variante skill_living_ember_oil tinha bug de parseNumber('2/3')→null, corrigido no patch-10.",
	skill_piercing_strike:
		"BUG: type='direct_damage' mas comportamento esperado é splash (outra criatura da mesma sala). handler direct_damage aplica dano ao alvo ctx, não a outra criatura. Deveria usar splash_damage.",
	skill_rift_second_chance:
		"BUG: handleReroll filtra dados com valor 1 (como skill_minor_rune). skill_rift_second_chance deveria rerolar qualquer dado.",
	power_mighty_crimson_fury:
		"BUG: handler adiciona temporaryEffects com id 'furia-rubra-duracao' mas damage_bonus handler não consulta essa flag. Duração até fim do combate nunca funciona.",
	skill_last_light_shield:
		"BUG: handlePreventDamage apenas loga — nenhuma prevenção real de dano ocorre.",
	power_hunter_execution:
		"BUG: handler adiciona +1 em bonusNextAttack mas não transforma dado azul em 6. Metade do efeito está faltando.",
	purple_ember_blood:
		"BUG: type='damage_reflect' não registrado. Efeito nunca dispara.",
	purple_veil_retaliation:
		"BUG: type='damage_reflect' não registrado. Efeito nunca dispara.",
	purple_depths_seal:
		"BUG: type='powerBlock' não registrado. Poderes once_per_game funcionam mesmo com esta criatura em jogo.",
	purple_deep_veil_seal:
		"BUG: type='dungeonLock' não registrado. Heróis podem reduzir nível da masmorra normalmente.",
	purple_crimson_shackles:
		"BUG: type='tohit_damage_penalty' não registrado. Penalty nunca aplicada.",
	purple_blood_tribute:
		"BUG: type='item_or_damage' não registrado. Tributo nunca cobrado.",
	dungeon_skill_dead_torches:
		"BUG: type='item_or_tohit_penalty' não registrado. Penalidade nunca aplicada.",
	dungeon_skill_rekindled_forge:
		"BUG: type='drawSpecificItem' não registrado. Item nunca sacado.",
	item_skill_mystic_draw:
		"BUG: type='drawArtifact' não registrado. Artefato nunca sacado.",
	item_skill_drain_life_and_deadly_edge:
		"BUG: type='tohit_damage_heal' não registrado. Skill inteira nunca funciona.",
	item_skill_block_and_last_light_ward:
		"BUG: type='armor_purple_damage_reduction' não registrado. Skill nunca funciona.",
	item_skill_crimson_fury_mighty:
		"BUG: type='self_damage_for_damage_until_end_of_combat' não registrado. Skill nunca funciona.",
	skill_rekindled_forge:
		"BUG: type='recover_item' não registrado. Habilidade nunca executa.",
	skill_opportunity_shot:
		"BUG: 'ao invés de combater' não implementado — handler aplica dano direto mas não impede o combate normal. Herói pode fazer ambos.",
	skill_charred_plate:
		"BUG: handleArmor aplica damageReduction a TODOS os heróis ativos, não à criatura-fonte. Criatura não recebe redução.",
	purple_ash_protection:
		"BUG: handleArmor aplica damageReduction a todos os heróis. Proteção da criatura nunca funciona.",
	purple_crimson_plate:
		"BUG: handleArmor aplica damageReduction a todos os heróis. Criatura não é protegida.",
	boss_skill_living_ash_throne:
		"BUG: handleArmor aplica damageReduction a todos os heróis ativos. Boss não recebe a redução de dano.",
	item_skill_deadly_edge:
		"BUG: type='tohit_damage', handleTohitDamage aplica bônus de dano incondicionalmente. A condição 'vencer por 4 ou mais' não é verificada.",
	item_skill_last_light_blade:
		"BUG: trigger='combat_vs_boss_or_subboss' mas handleTohitDamage não verifica o tipo do alvo — bônus de dano é aplicado contra qualquer inimigo.",
	power_deep_veil_echo:
		"BUG: handleToken concede 1 Eco mas não há implementação de gasto do Eco (3 opções da label).",
	skill_last_light_ward:
		"BUG: handlePurpleDamageReduction armazena valor em flags com cast para boolean. Código consumidor pode não ler corretamente. Trigger 'on_purple_effect_damage_taken' pode não estar wired.",
	skill_scorching_heat:
		"BUG: handleTohitPenalty usa ctx.sourceHeroId mas skill de criatura que penaliza TODOS os heróis não tem sourceHeroId. Penalty nunca aplicada.",
	dungeon_skill_summon_guardian:
		"NÃO IMPLEMENTADO: type='roomSpecial'. Spawn tratado implicitamente por handleSpawnEnemies, sem lógica do guardião especial.",
	skill_forge_smoke:
		"RISCO: handleHealBlock usa ctx.targetHeroIds para escolher alvos. Skill de sala passiva pode não ter targetHeroIds populado.",
	purple_healing_rupture:
		"RISCO: mesmo problema de skill_forge_smoke — targetHeroIds pode estar vazio.",
};

// ── Spec generator ───────────────────────────────────────────────────────────
function handlerName(type) {
	return type ?? "???";
}

function triggerText(t) {
	const d = decomposeTrigger(t);
	const lines = [`- \`on\`: \`${d.on}\``];
	if (d.when) lines.push(`- \`when\`: ${d.when}`);
	if (d.limit) lines.push(`- \`limit\`: \`${d.limit}\``);
	if (d.duration) lines.push(`- (duração implícita: ${d.duration})`);
	return lines.join("\n");
}

function testCases(skill) {
	const id = skill.id;
	const dec = DECISION[id];
	const t = skill.trigger;

	// Generic tests based on handler type
	const cases = [];
	switch (skill.type) {
		case "damage_bonus":
			cases.push(
				"Ativo com cost=2: herói paga 2 vida, registra +6 em bonusNextAttack.",
			);
			cases.push("Cost=0 ou null: state inalterado.");
			break;
		case "heal":
			cases.push(
				`Cura ${skill.usesVariable ? "N" : "valor-fixo"} de vida em herói-alvo: currentLife aumenta.`,
			);
			cases.push("Herói com healBlocked=true: cura ignorada, log emitido.");
			break;
		case "armor":
			if (
				skill.category === "habilidade" ||
				skill.category === "habilidade_item"
			) {
				cases.push("Reduz dano sofrido pelo portador em value pontos.");
			} else {
				cases.push(
					"Reduz dano sofrido pela criatura-fonte em value pontos. (bug atual: aplica a heróis)",
				);
			}
			cases.push("Sem state.combat: state inalterado.");
			break;
		case "direct_damage":
			cases.push("targetEnemyIds preenchido: inimigo sofre value de dano.");
			cases.push("Sem alvo explícito: herói com menor vida sofre dano.");
			break;
		case "discardDungeon":
			cases.push("Deck com cartas: N cartas descartadas da pilha.");
			cases.push("Deck vazio: state inalterado.");
			break;
		case "flee_block":
			cases.push("Após disparar: state.flags.fleeBlocked = true.");
			break;
		case "dungeonLevel":
			cases.push("Despertar avança N níveis (max 4).");
			cases.push("Despertar já em 4: permanece em 4.");
			break;
		case "tohit":
			cases.push(
				"Bônus passivo coletado em collectHeroBonuses: +value no total de acerto.",
			);
			break;
		case "tohit_penalty":
			cases.push(
				"Após disparar: combat.tohitPenaltyByHero[heroId] aumenta em |value|.",
			);
			break;
		case "tohit_damage":
			cases.push(`Bônus de acerto e dano registrado em bonusNextAttack.`);
			if (t && t.includes("if_dungeon"))
				cases.push("Dungeon nível < 3 (amarelo): não dispara.");
			if (t && t.includes("alone"))
				cases.push("Com 2+ criaturas na sala: não dispara.");
			break;
		case "heal_or_damage_bonus":
			cases.push(
				"choice='damage': bônus de dano registrado em bonusNextAttack.",
			);
			cases.push("choice='heal': todos heróis recebem cura.");
			break;
		case "heal_or_survive":
			cases.push("choice='survive': herói fica com 1 de vida.");
			cases.push("choice='full': herói curado totalmente.");
			break;
		case "diceFix":
			cases.push(
				"combat.pendingDiceSelection configurado com action='set_to', setToValue=6.",
			);
			break;
		case "reroll":
			cases.push(
				"dado com valor 1 presente: pendingDiceSelection configurado.",
			);
			cases.push("Nenhum dado com valor 1: log 'nenhum dado' retornado.");
			break;
		case "item_or_discardDungeon":
		case "item_or_damage":
			cases.push(
				"Grupo tem item e dungeon: SKILL_CHOICE aberto com ambas opções.",
			);
			cases.push("Grupo sem item: apenas opção dungeon.");
			break;
		case "reward":
			cases.push("Após disparar: enemy.noReward = true.");
			break;
		case "noop":
		case "room":
			cases.push("Sempre: state inalterado (noop explícito).");
			break;
		default:
			cases.push(
				"Estado pós-execução reflete o comportamento descrito na label.",
			);
			cases.push("Input inválido / sem alvo: state inalterado.");
	}
	return cases.map((c, i) => `${i + 1}. ${c}`).join("\n");
}

function generateSpec(skill) {
	const id = skill.id;
	const dec = DECISION[id] ?? {
		path: "script",
		reason: "Complexidade não mapeada — requer análise detalhada.",
	};
	const bug = BUGS[id] ?? null;
	const handlerDesc =
		HANDLER_DESC[skill.type] ??
		`Handler '${skill.type}' — sem descrição mapeada.`;
	const trig = triggerText(skill.trigger);
	const usedByStr =
		(skill.usedBy ?? [])
			.map(
				(u) =>
					`  - ${u.cardId} (${u.cardType}, field=${u.field}, value=${JSON.stringify(u.value)})`,
			)
			.join("\n") || "  - (nenhum)";

	return `# ${id} — ${skill.name}

## Origem
- **type**: \`${skill.type}\`
- **trigger**: \`${skill.trigger}\`
- **target**: \`${skill.target}\`
- **value/defaultValue**: \`${JSON.stringify(skill.defaultValue)}\`
- **category**: \`${skill.category}\`
- **usesVariable**: ${skill.usesVariable}
- **Handler atual**: ${handlerDesc}
- **usedBy**:
${usedByStr}
- **Label template**: _${skill.labelTemplate}_

## Trigger decomposto
${trig}

## Comportamento esperado
${skill.textTemplate}

${bug ? `## ⚠️ Bug / Gap identificado\n${bug}\n` : ""}
## Decisão: ${dec.path === "dsl" ? "**DSL**" : "**Script**"}
${dec.reason}

## Casos de teste
${testCases(skill)}
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
let written = 0;
for (const skill of skills) {
	const spec = generateSpec(skill);
	fs.writeFileSync(path.join(OUT_DIR, `${skill.id}.md`), spec, "utf8");
	written++;
}

console.log(`✓ ${written} specs gravadas em tools/skill-port/specs/`);
