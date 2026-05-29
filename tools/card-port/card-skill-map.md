# Card→Skill Map (Patch-13 Fase 0)

Decisão **usedBy**: opção **(a)** — derivar em runtime, remover de skills.json.

Chave de params: `value` (compat com DSL `$value`).

---

### `hero_eternal_rest_cleric` (hero)
  - `skill` → `skill_last_light_healing`  params: { value: 3 }
  - `power` → `power_greater_last_light_miracle`  params: { value: "full/1" }

### `hero_broken_bastion_warrior` (hero)
  - `skill` → `skill_bastion_guard`  params: { value: 3 }
  - `power` → `power_unbreakable_bastion_guard`  params: { value: 1 }

### `hero_rift_rogue` (hero)
  - `skill` → `skill_preserved_path`  params: —
  - `power` → `power_restored_path`  params: { value: 1 }

### `hero_crimson_rune_mage` (hero)
  - `skill` → `skill_rift_rune`  params: { value: 1 }
  - `power` → `power_supreme_rift_rune`  params: { value: "6/1" }

### `hero_crimson_barbarian` (hero)
  - `skill` → `skill_crimson_fury`  params: { value: 2 }
  - `power` → `power_mighty_crimson_fury`  params: —

### `hero_last_light_paladin` (hero)
  - `skill` → `skill_final_dawn_light`  params: { value: "2/2" }
  - `power` → `power_last_light_oath`  params: { value: "5/5" }

### `hero_deep_veil_necromancer` (hero)
  - `skill` → `skill_return_rite`  params: { value: 1 }
  - `power` → `power_deep_veil_echo`  params: { value: "1/3/2/2" }

### `hero_broken_veil_hunter` (hero)
  - `skill` → `skill_prey_mark`  params: { value: 1 }
  - `power` → `power_hunter_execution`  params: { value: "6/1" }

### `creature_deep_rift_rat` (creature)
  - `effect` → `skill_lone_beast`  params: { value: "1/1" }
  - `purpleEffect` → `skill_treacherous_attack`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_dark_cave_goblin` (creature)
  - `effect` → `skill_cowardly_flee`  params: —
  - `purpleEffect` → `purple_dark_tribute`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_wet_stone_slime` (creature)
  - `effect` → `skill_gelatinous_body`  params: { value: -1 }
  - `purpleEffect` → `purple_veil_retaliation`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_black_ceiling_bat` (creature)
  - `effect` → `skill_rift_evasion`  params: —
  - `purpleEffect` → `purple_healing_rupture`  params: — ⚠ requiresAwakening:true

### `creature_ancient_pillar_spider` (creature)
  - `effect` → `skill_treacherous_attack`  params: { value: 2 }
  - `purpleEffect` → `purple_ancient_veil_prison`  params: { value: -2 } ⚠ requiresAwakening:true

### `creature_broken_gates_watcher` (creature)
  - `effect` → `skill_charred_plate`  params: { value: 1 }
  - `purpleEffect` → `purple_ash_protection`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_hidden_flame_cultist` (creature)
  - `effect` → `skill_hidden_flame_presence`  params: { value: 2 }
  - `purpleEffect` → `purple_deadly_awakening`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_catacomb_skeleton` (creature)
  - `effect` → `purple_dark_tribute`  params: { value: 1 }
  - `purpleEffect` → `purple_ash_protection`  params: { value: 2 } ⚠ requiresAwakening:true

### `creature_dead_passage_thief` (creature)
  - `effect` → `purple_dark_tribute`  params: { value: 1 }
  - `purpleEffect` → `purple_ruin_ashes`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_old_chains_knight` (creature)
  - `effect` → `skill_lone_beast`  params: { value: "2/2" }
  - `purpleEffect` → `purple_deep_veil_seal`  params: — ⚠ requiresAwakening:true

### `creature_low_fire_salamander` (creature)
  - `effect` → `skill_treacherous_attack`  params: { value: 1 }
  - `purpleEffect` → `purple_ember_blood`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_ruined_hall_ogre` (creature)
  - `effect` → `skill_lone_beast`  params: { value: "2/2" }
  - `purpleEffect` → `purple_deadly_awakening`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_low_ember_kobold` (creature)
  - `effect` → `skill_pack_courage`  params: { value: 1 }
  - `purpleEffect` → `purple_blood_tribute`  params: { value: 3 } ⚠ requiresAwakening:true

### `creature_hot_ash_worm` (creature)
  - `effect` → `skill_charred_plate`  params: { value: 1 }
  - `purpleEffect` → `purple_veil_retaliation`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_blazing_skull` (creature)
  - `effect` → `skill_rift_evasion`  params: —
  - `purpleEffect` → `purple_ruin_ashes`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_dead_torch_sentinel` (creature)
  - `effect` → `skill_charred_plate`  params: { value: 1 }
  - `purpleEffect` → `purple_ash_protection`  params: { value: 2 } ⚠ requiresAwakening:true

### `creature_forge_acolyte` (creature)
  - `effect` → `skill_hidden_flame_presence`  params: { value: 2 }
  - `purpleEffect` → `purple_ruin_ashes`  params: { value: 1 } ⚠ requiresAwakening:true

### `creature_broken_chains_brute` (creature)
  - `effect` → `skill_path_corruption`  params: —
  - `purpleEffect` → `purple_deadly_awakening`  params: { value: 1 } ⚠ requiresAwakening:true

### `subboss_crimson_dungeon_jailer` (subboss)
  - `effect` → `skill_path_corruption`  params: —
  - `purpleEffect` → `purple_crimson_shackles`  params: { value: "-3/-3" } ⚠ requiresAwakening:true

### `subboss_cracked_abyss_guardian` (subboss)
  - `effect` → `purple_dark_tribute`  params: { value: 1 }
  - `purpleEffect` → `purple_deadly_awakening`  params: { value: 1 } ⚠ requiresAwakening:true

### `item_pitch_torch` (item)
  - `effect` → `skill_illuminate_path`  params: { value: 1 }

### `item_worn_explorer_rope` (item)
  - `effect` → `skill_preserved_path`  params: —

### `item_rusty_dagger` (item)
  - `effect` → `item_skill_deadly_edge`  params: { value: 1 }

### `item_cracked_shield` (item)
  - `effect` → `item_skill_block`  params: { value: 2 }

### `item_lesser_vigor_potion` (item)
  - `effect` → `skill_last_light_healing`  params: { value: 2 }

### `item_incendiary_oil_flask` (item)
  - `effect` → `skill_living_ember_oil`  params: { value: "item_incendiary_oil_flask.livingEmber" }

### `item_ancient_iron_key` (item)
  - `effect` → `item_skill_mystic_draw`  params: { value: 1 }

### `item_tunnel_hood` (item)
  - `effect` → `skill_focus_deflection`  params: { value: 2 }

### `item_light_stone_boots` (item)
  - `effect` → `skill_rift_light_step`  params: —

### `item_crimson_rune_staff` (item)
  - `effect` → `skill_minor_rune`  params: { value: 1 }

### `item_last_light_sword` (item)
  - `effect` → `item_skill_last_light_blade`  params: { value: "2/2" }

### `item_deep_veil_scythe` (item)
  - `effect` → `item_skill_drain_life_and_deadly_edge`  params: { value: "1/1" }

### `item_ruined_hall_axe` (item)
  - `effect` → `item_skill_deadly_edge`  params: { value: 3 }

### `item_broken_stone_hammer` (item)
  - `effect` → `item_skill_deadly_edge`  params: { value: 2 }

### `item_rift_bow` (item)
  - `effect` → `skill_opportunity_shot`  params: —

### `item_reinforced_leather_armor` (item)
  - `effect` → `item_skill_block`  params: { value: 1 }

### `item_ancient_metal_armor` (item)
  - `effect` → `item_skill_block`  params: { value: 2 }

### `item_forge_magic_armor` (item)
  - `effect` → `item_skill_block_and_last_light_ward`  params: { value: "3/2" }

### `item_broken_veil_cloak` (item)
  - `effect` → `skill_protective_veil`  params: —

### `item_fury_potion` (item)
  - `effect` → `skill_crimson_fury`  params: { value: 2 }

### `item_precision_potion` (item)
  - `effect` → `skill_hunter_focus`  params: { value: 4 }

### `item_stoneskin_potion` (item)
  - `effect` → `item_skill_block`  params: { value: 3 }

### `item_return_potion` (item)
  - `effect` → `power_restored_path`  params: { value: 1 }

### `item_living_ember_potion` (item)
  - `effect` → `skill_living_ember`  params: { value: 3 }

### `item_greater_vigor_potion` (item)
  - `effect` → `skill_last_light_healing`  params: { value: 4 }

### `item_silent_dungeon_charm` (item)
  - `effect` → `skill_path_safeguard`  params: —

### `item_low_flame_charm` (item)
  - `effect` → `skill_hunter_focus`  params: { value: 2 }

### `item_warm_blood_charm` (item)
  - `effect` → `item_skill_block`  params: { value: 10 }

### `item_safe_path_charm` (item)
  - `effect` → `skill_illuminate_path`  params: —

### `item_last_defense_charm` (item)
  - `effect` → `power_greater_last_light_miracle`  params: { value: "full/1" }

### `item_last_chord_lute` (item)
  - `effect` → `skill_protective_veil`  params: —

### `item_narrow_exit_cloak` (item)
  - `effect` → `skill_illuminate_path`  params: —

### `item_torn_depths_map` (item)
  - `effect` → `item_skill_mystic_draw`  params: { value: 1 }

### `item_hidden_forge_chest` (item)
  - `effect` → `item_skill_mystic_draw`  params: { value: 1 }

### `artifact_crimson_jailer_chain` (artifact)
  - `effect` → `skill_preserved_path`  params: —

### `artifact_ancient_ember_heart` (artifact)
  - `effect` → `item_skill_deadly_edge`  params: { value: 1 }

### `artifact_lost_forge_hammer` (artifact)
  - `effect` → `power_supreme_rift_rune`  params: { value: "6/1" }

### `artifact_last_vigil_brazier` (artifact)
  - `effect` → `power_greater_last_light_miracle`  params: { value: "full/1" }

### `artifact_first_fire_blade` (artifact)
  - `effect` → `item_skill_crimson_fury_mighty`  params: { value: "2/poderosa" }

### `subboss_room_jailer_chamber` (subboss_room)
  - `effect` → `dungeon_skill_subboss_room`  params: —

### `subboss_room_cracked_abyss_chamber` (subboss_room)
  - `effect` → `dungeon_skill_subboss_room`  params: —

### `room_narrow_corridor` (room)
  - `effect` → `dungeon_skill_empty_room`  params: —

### `room_dungeon_room` (room)
  - `effect` → `dungeon_skill_empty_room`  params: —

### `room_crimson_chains_chamber` (room)
  - `effect` → `dungeon_skill_confinement`  params: —

### `room_dead_torches_passage` (room)
  - `effect` → `dungeon_skill_dead_torches`  params: { value: "-1/1" }

### `room_broken_columns_hall` (room)
  - `effect` → `dungeon_skill_column_fall`  params: { value: 1 }

### `room_depths_stairway` (room)
  - `effect` → `dungeon_skill_uneven_floor`  params: { value: 1 }

### `room_abandoned_cell` (room)
  - `effect` → `dungeon_skill_forge_spoils`  params: { value: "2/1" }

### `room_ruined_forge` (room)
  - `effect` → `dungeon_skill_rekindled_forge`  params: —

### `room_jailer_room` (room)
  - `effect` → `dungeon_skill_summon_guardian`  params: { value: "Carcereiro da Masmorra Rubra" }

### `room_cracked_abyss` (room)
  - `effect` → `dungeon_skill_summon_guardian`  params: { value: "Guardião do Abismo Rachado" }

---

## Divergências type/trigger/target (card vs skill)

- hero_rift_rogue::skill trigger card=once_per_room_on_dungeon_card_would_be_discarded skill=once_per_room_on_dungeon_discard
- hero_rift_rogue::skill type card=discardDungeon skill=discardDungeon_prevention
- hero_crimson_rune_mage::skill type card=dice_adjust skill=dice_modification
- hero_crimson_barbarian::power type card=skillEnhancement skill=damage_bonus_duration
- hero_last_light_paladin::power target card=heroes_or_next_attack skill=heroes_or_self_next_attack
- hero_broken_veil_hunter::skill type card=mark skill=mark_and_tohit
- hero_broken_veil_hunter::power trigger card=once_per_game_after_roll_against_prey skill=once_per_game_after_roll_vs_prey
- hero_broken_veil_hunter::power target card=blue_die skill=blue_die_and_self
- creature_wet_stone_slime::effect trigger card=combat_against_self skill=while_active
- creature_wet_stone_slime::effect target card=heroes skill=heroes_attacking_self
- creature_ancient_pillar_spider::purpleEffect trigger card=on_targeted_first_time skill=on_first_targeted
- creature_broken_chains_brute::effect trigger card=while_in_play skill=while_room_active
- subboss_crimson_dungeon_jailer::effect trigger card=while_in_play skill=while_room_active
- subboss_crimson_dungeon_jailer::purpleEffect trigger card=on_targeted_first_time skill=on_first_target_chosen_by_creature
- item_worn_explorer_rope::effect trigger card=on_use_when_dungeon_card_would_be_discarded skill=once_per_room_on_dungeon_discard
- item_worn_explorer_rope::effect type card=discardDungeon skill=discardDungeon_prevention
- item_incendiary_oil_flask::effect trigger card=before_combat_roll skill=on_use
- item_incendiary_oil_flask::effect target card=creature skill=creature_in_play
- item_tunnel_hood::effect type card=targetRedirect skill=targetRedirect_or_tohit
- item_light_stone_boots::effect trigger card=once_per_room skill=once_per_room_on_extra_dungeon_discard
- item_light_stone_boots::effect target card=dungeon skill=self
- item_light_stone_boots::effect type card=controlProtection skill=discardDungeon_prevention
- item_broken_veil_cloak::effect trigger card=once_per_room skill=once_per_room_on_targeted_by_effect
- item_precision_potion::effect trigger card=on_use skill=while_equipped
- item_living_ember_potion::effect target card=creature skill=creature_in_play
- item_silent_dungeon_charm::effect type card=discardDungeon skill=discardDungeon_prevention
- item_last_chord_lute::effect trigger card=once_per_room skill=once_per_room_on_targeted_by_effect
- artifact_crimson_jailer_chain::effect trigger card=once_per_room_on_dungeon_card_would_be_discarded skill=once_per_room_on_dungeon_discard
- artifact_crimson_jailer_chain::effect type card=discardDungeon skill=discardDungeon_prevention
- room_ruined_forge::effect target card=discarded_item skill=item_deck_or_discard
- room_ruined_forge::effect type card=recoverItem skill=drawSpecificItem
