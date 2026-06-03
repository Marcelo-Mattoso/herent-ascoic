# Tabela de mapeamento: trigger string legado → vocabulário v2

Patch-21 Lote B. Cada linha: `trigger_legado` → `operate_type` + `trigger.event?` + `cooldown?` + `conditions?`

## op_passive (sem trigger, sem cooldown)

| Legado | operate_type |
|--------|-------------|
| while_equipped | op_passive |
| while_in_play | op_passive |
| while_active | op_passive |
| while_room_active | op_passive |
| while_room_active_first_combat | op_passive |
| room_passive | op_passive |

## op_active (sem trigger)

| Legado | operate_type | cooldown |
|--------|-------------|---------|
| on_use | op_active | — |
| until_end_of_round | op_active_buff | — |
| once_per_room | op_active | room/1 |
| once_per_combat | op_active | combat/1 |
| once_per_game | op_active | game/1 |
| once_per_game_until_end_of_round | op_active_buff | game/1 |
| once_per_combat_instead_of_attack | op_active | combat/1 |

## op_triggered — sem cooldown, sem condição

| Legado | trigger.event |
|--------|-------------|
| before_attack | evt_attack_declared |
| combat | evt_attack_declared |
| combat_and_on_damage_dealt | evt_attack_declared |
| after_roll | evt_roll |
| on_damage_taken | evt_damage_taken |
| on_take_damage | evt_damage_taken |
| on_take_attack_damage | evt_damage_taken |
| on_purple_effect_damage_taken | evt_damage_taken |
| on_hit_received | evt_hit |
| on_deal_damage | evt_damage_dealt |
| on_destroy_creature_with_attack | evt_kill |
| start_of_combat | evt_combat_start |
| on_enter_combat | evt_combat_start |
| before_combat | evt_combat_start |
| on_room_reveal | evt_room_reveal |
| on_reveal_paths | evt_room_reveal |
| on_enter_room | evt_room_enter |
| on_win_room | evt_room_leave |
| on_flee_or_leave_play | evt_leave_play |
| on_dungeon_discard | evt_dungeon_discard |
| on_enter_play | evt_enter_play |
| on_destroyed | evt_destroy |
| on_hero_lose_combat_in_room | evt_combat_end |

## op_triggered — com cooldown

| Legado | trigger.event | cooldown |
|--------|-------------|---------|
| once_per_round_on_damage_taken | evt_damage_taken | round/1 |
| once_per_room_on_dungeon_discard | evt_dungeon_discard | room/1 |
| once_per_room_after_roll | evt_roll | room/1 |
| once_per_room_on_targeted_by_effect | evt_targeted | room/1 |
| once_per_room_on_targeted | evt_targeted | room/1 |
| once_per_room_on_extra_dungeon_discard | evt_dungeon_discard | room/1 |
| once_per_game_after_any_roll | evt_roll | game/1 |
| once_per_game_on_defeat_creature | evt_kill | game/1 |
| once_per_game_after_roll_vs_prey | evt_roll | game/1 |
| once_per_game_on_use_furia_rubra | evt_damage_dealt | game/1 |
| first_roll_in_room | evt_roll | room/1 |
| before_first_combat_in_room | evt_combat_start | room/1 |
| first_hero_lose_combat_in_room | evt_combat_end | room/1 |
| first_item_effect_received | evt_targeted | room/1 |
| on_first_creature_destroyed_in_room | evt_kill | room/1 |
| on_first_targeted | evt_targeted | room/1 |
| on_first_target_chosen_in_room | evt_targeted | room/1 |
| on_first_target_chosen_by_creature | evt_targeted | room/1 |
| first_damage_each_round | evt_damage_taken | round/1 |
| before_attack_once_per_game | evt_attack_declared | game/1 |

## op_triggered — com condições

| Legado | trigger.event | conditions |
|--------|-------------|-----------|
| first_round_in_room | evt_round_start | compare eq $round 1 |
| combat_if_dungeon_red_or_purple | evt_combat_start | compare gte $dungeon.level 3 |
| combat_if_alone_in_room | evt_combat_start | compare eq $room.enemy_count 1 |
| combat_if_another_creature_in_room | evt_combat_start | compare gt $room.enemy_count 1 |
| when_half_life_or_less | evt_damage_taken | has_condition $self half_life_or_less |
| after_each_combat_round_if_purple | evt_round_end | compare gte $dungeon.level 3 |
| combat_vs_boss_or_subboss | evt_combat_start | has_condition $enemy boss_or_subboss |
