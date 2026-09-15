# Auditoria de Durações — 88 Skills

> **Atualizada em 2026-09-15.** A tabela detalhada abaixo é o snapshot
> histórico pré-patch-23; ela foi preservada para rastreabilidade, mas não deve
> ser lida como o estado atual de cada linha. `skills.yaml`, o reducer e os
> testes são a fonte de verdade para o comportamento presente.

## Estado atual

Os buracos históricos de duração B1–B7 e PD-1–PD-6 foram fechados pelos
patches 23 e 25. Em particular, passivos são instalados no setup/spawn,
modificadores e blocos expiram nos ticks corretos, cooldowns usam guards por
escopo e `once` é consumido após o ataque.

Desde a auditoria original, o motor também ganhou o contrato
`TRIGGER_EVENT_EMITTERS` e um teste catálogo → emissor. Todo `evt_*` declarado
em `skills.yaml` precisa ter um fluxo real que abra `resolveSkillWindow`.
`evt_damage_dealt`, `evt_hit`, `evt_destroy`, `evt_kill` e `evt_leave_play`
passaram a ter ponte explícita; os quatro primeiros são emitidos pelo sistema
de dano e fuga do herói é emitida pelo combate.

### Pendências reais

| Id | Estado | Impacto | Próxima ação |
|---|---|---|---|
| P1 | Aberto | `skill_cowardly_flee` só faz sentido quando uma **criatura** deixa o jogo. Hoje há emissor para fuga de herói, mas não existe transição de fuga de criatura. | Implementar a ação/efeito de retirada de criatura e emitir `evt_leave_play` com `sourceEnemyId`. |
| P2 | Aberto | Um trigger pós-dano que pede decisão pode pausar `applyDamage` depois da derrota e antes da limpeza final da entidade ECS. | Adicionar uma continuação `damage_pipeline` a `PendingSkillWindow`, para retomar a limpeza após decidir/recusar o trigger. |
| P3 | Documentação histórica | A linha de `skill_prey_mark` na tabela antiga diz `op_triggered` / `evt_combat_start`; o catálogo atual a define como `op_active`, sem trigger. | Tratar o YAML atual como decisão vigente; atualizar a tabela histórica somente se ela deixar de ser necessária como registro. |

### Skills órfãs: suportadas para a próxima expansão

Há 23 skills válidas no catálogo sem `SkillRef` em `cards.yaml`. Elas **não são
implementações mortas**: continuam cobertas pelo schema, pelo harness que
executa as 88 skills e pelo contrato de emissor quando reativas. Devem
permanecer funcionais até serem ligadas às cartas da expansão.

`skill_last_light_shield`, `skill_rekindled_forge`,
`skill_rift_second_chance`, `skill_perfect_rune`,
`skill_last_light_miracle`, `skill_piercing_strike`, `skill_forge_spoils`,
`skill_scorching_heat`, `skill_crimson_chains`, `skill_choking_ashes`,
`skill_forge_awakening`, `skill_sealed_door`, `skill_ruined_floor`,
`skill_forge_smoke`, `skill_dark_tribute`, `skill_chains_prison`,
`skill_life_drain`, `skill_last_light_ward`, `purple_raging_flames`,
`purple_forge_chains`, `purple_crimson_plate`, `purple_dark_awakening` e
`purple_depths_seal`.

### Harness de execução

O teste de cobertura roda as 88 skills e não encontra skill sem implementação
ou exceção. As entradas classificadas como `no-effect` são cenários que a
fixture genérica não ativa; não devem ser promovidas a defeito sem teste de
integração específico.

Gerado originalmente em 2026-06-03. Fonte da verdade atual:
`src/data/skills.yaml` + `src/data/skills.locale.pt-BR.yaml` + reducer.

## Buracos de referência (histórico)

| Id | Descrição curta |
|---|---|
| B1 | `once` e `once_per_round` mapeiam para ECS Duration sem tick que consume/decremente |
| B2 | `while_in_play` / `passive` → `permanent` sem expiry atrelado à remoção da entidade-fonte |
| B3 | `op_passive` skills não são instaladas (installPassive não é chamado) |
| B4 | op_triggered com cooldown: TriggerComponent removido por consumeAfterFire e não reinstalado ao reset do scope |
| B5 | Trigger + `while_in_play` empilha modifiers a cada disparo sem dedup | **✅ patch-25 Lote A** |
| B6 | `evt_room_leave` mapeia para `CombatEnded` (semanticamente errado) | ✅ patch-23 |
| B7 | `evt_enter_play` mapeia para `CombatStarted` (não cobre spawn mid-combat) | ✅ patch-23 |
| PD-1 | `p_block` sem `duration` declarada (flee/heal com escopo "até fim da rodada") | **✅ patch-25 Lote B+C** |
| PD-2 | `p_block` com escopo "sala" / "1º combate" sem mecanismo de reset | **✅ patch-25 Lote C** (while_in_play no YAML; sourceEntityId via avaliador pendente) |
| PD-3 | `p_block` atrelado à presença da criatura (while_source_in_play) | **✅ patch-25 Lote B+C** |
| PD-4 | `p_block` com semântica "próxima X" / "1×/jogo" | **✅ patch-25 Lote B+C** (once em purple_healing_rupture) |
| PD-5 | trigger sem cooldown declarado mas label promete "1×" | **✅ patch-25 Lote C** (skill_path_safeguard) |
| PD-6 | `duration: passive` ambíguo (texto = permanente) | **✅ patch-25 Lote D** (renomeado para `permanent`) |

---

## Tabela completa (88 skills, snapshot histórico pré-patch-23)

| # | id | category | operate_type | label (pt-BR resumido) | duration(efeito) | trigger | buracos | recomendação |
|---|---|---|---|---|---|---|---|---|
| 1 | skill_crimson_fury | hero_skill | op_triggered | Fúria Rubra: sofre dano para bônus no próximo ataque | once | evt_attack_declared | B1 | chamar tickModifierDurations("once_consumed") após o ataque |
| 2 | skill_last_light_healing | hero_skill | op_active | Cura da Última Luz: cura X de vida | — | — | ok | — |
| 3 | skill_bastion_guard | hero_skill | op_triggered | Guarda do Bastião: reduz X dano sofrido | once | evt_damage_taken | B1 | idem B1 |
| 4 | skill_rift_rune | hero_skill | op_triggered | Runa das Fendas: altera dado em até X | — | evt_roll | ok | — |
| 5 | skill_hunter_focus | hero_skill | op_passive (script) | Foco do Caçador: +X Bônus de Acerto enquanto equipado | — | — | B3 | installPassive não chama (script-only) |
| 6 | skill_living_ember | hero_skill | op_active | Brasa Viva: X dano direto | — | — | ok | — |
| 7 | skill_living_ember_oil | item_skill | op_active | Brasa Viva (Condicional): 2/3 dano direto | — | — | ok | — |
| 8 | skill_last_light_shield | hero_skill | op_triggered | Escudo da Última Luz: impede dano (1×/rodada) | — | evt_damage_taken | B4 | TriggerComponent removido; round never reinstala |
| 9 | skill_preserved_path | hero_skill | op_triggered | Caminho Preservado: previne descarte dungeon (1×/sala) | — | evt_dungeon_discard | B4 | idem, scope: room |
| 10 | skill_rekindled_forge | hero_skill | op_triggered (script) | Forja Reacesa: ao vencer sala, recupera item | — | evt_room_leave | B6 | evt_room_leave → CombatEnded errado; introduzir RoomLeft |
| 11 | skill_rift_second_chance | hero_skill | op_active | Segunda Chance: 1×/combate rerola dado | — | — | ok | op_active, cooldown via oncePer |
| 12 | skill_perfect_rune | hero_skill | op_triggered | Runa Perfeita: 1×/sala, dado → 6 | — | evt_roll | B4 | scope: room |
| 13 | skill_last_light_miracle | hero_skill | op_active | Milagre da Última Luz: 1×/sala, cura 2 OU +2 dano | once (opção dano) | — | B1 | once no modifier da opção dano; op_active sem trigger |
| 14 | skill_piercing_strike | hero_skill | op_triggered (script) | Golpe Trespassante: ao destruir criatura, 1 dano em outra | — | evt_kill | ok | script ok |
| 15 | skill_forge_spoils | hero_skill | op_triggered | Espólios da Fornalha: ao vencer sala, olha 2 itens | — | evt_room_leave | B6 | evt_room_leave → CombatEnded errado |
| 16 | skill_prey_mark | hero_skill | op_triggered | Marca da Presa: início combate, +X acerto vs presa | until_end_of_combat | evt_combat_start | ok | — |
| 17 | skill_return_rite | hero_skill | op_active | Rito de Retorno: 1×/sala, paga 3 vida, recupera dungeon | — | — | ok | op_active |
| 18 | skill_final_dawn_light | hero_skill | op_triggered | Luz da Aurora Final: +2 acerto/dano vs nível Roxo+ | until_end_of_combat | evt_combat_start | ok | condition garante disparo correto |
| 19 | skill_scorching_heat | hero_skill | op_triggered | Calor Escaldante: 1×/sala, −X na 1ª rolagem | once | evt_roll | B1, B4 | once não consumido + trigger removido sem reinstalo |
| 20 | skill_crimson_chains | hero_skill | op_active_buff | Correntes Rubras: até fim da rodada, herói não foge | — (p_block sem duration) | — | PD | p_block flee sem duration; label diz "até fim da rodada" → adicionar duration: until_end_of_round |
| 21 | skill_choking_ashes | hero_skill | op_active | Cinzas Sufocantes: X dano ao herói com menos vida | — | — | ok | — |
| 22 | skill_charred_plate | hero_skill | op_triggered | Couraça Carbonizada: reduz X dano sofrido | while_in_play | evt_damage_taken | B2, B5 | empilha modifier a cada dano; converter para op_passive |
| 23 | skill_forge_awakening | hero_skill | op_active | Despertar da Fornalha: avança dungeon X níveis | — | — | ok | — |
| 24 | skill_sealed_door | hero_skill | op_passive | Porta Selada: heróis não fogem no 1º combate | — (p_block) | — | B3, PD | installPassive não chama; p_block precisa de lógica de escopo de sala |
| 25 | skill_ruined_floor | hero_skill | op_triggered | Chão em Ruína: 1×/sala, perda de combate → +1 descarte | — | evt_combat_end | B4 | scope: room |
| 26 | skill_forge_smoke | hero_skill | op_triggered | Fumaça da Fornalha: 1ª rodada, heróis não curam | — (p_block sem duration) | evt_round_start | PD | p_block heal sem expiry; condition round==1 ok, mas bloqueio não expira |
| 27 | skill_dark_tribute | hero_skill | op_triggered | Tributo Sombrio: 1×/sala, grupo descarta item ou dungeon | — | evt_combat_start | B4 | scope: room |
| 28 | skill_rift_evasion | hero_skill | op_triggered (script) | Evasão das Fendas: 1×/sala, ignora 1º efeito de item | — | evt_targeted | B4 | scope: room |
| 29 | skill_chains_prison | hero_skill | op_triggered | Prisão das Correntes: 1×/sala, 1º alvo −2 na rolagem | once | evt_targeted | B1, B4 | once sem consumo + trigger removido |
| 30 | skill_path_corruption | hero_skill | op_passive | Corrupção de Caminho: heróis não podem impedir descarte | — (p_block) | — | B3, PD | installPassive não chama; p_block sem escopo de limpeza |
| 31 | skill_lone_beast | hero_skill | op_triggered | Fera Solitária: sozinho → +X acerto/dano | until_end_of_combat | evt_combat_start | ok | condition ok |
| 32 | skill_treacherous_attack | hero_skill | op_triggered | Ataque Traiçoeiro: ao entrar em combate, X dano ao herói | — | evt_combat_start | ok | — |
| 33 | skill_cowardly_flee | hero_skill | op_triggered | Fuga Covarde: ao fugir, sem recompensa | — | evt_leave_play | ok | — |
| 34 | skill_gelatinous_body | hero_skill | op_passive | Corpo Gelatinoso: heróis −X no acerto contra esta criatura | while_in_play | — | B3, B2 | installPassive não chama; while_in_play permanente sem tracking de source |
| 35 | skill_hidden_flame_presence | hero_skill | op_triggered | Presença da Chama Oculta: outra criatura +X acerto | until_end_of_combat | evt_combat_start | ok | — |
| 36 | skill_pack_courage | hero_skill | op_triggered | Coragem de Bando: +X acerto se outra criatura presente | until_end_of_combat | evt_combat_start | ok | — |
| 37 | skill_illuminate_path | hero_skill | op_triggered | Iluminar o Caminho: ao revelar sala, olha dungeon | — | evt_room_reveal | ok | — |
| 38 | skill_path_safeguard | hero_skill | op_triggered | Salvaguarda de Caminho: previne descarte dungeon | — | evt_dungeon_discard | PD | sem cooldown → previne TODOS os descartes; provavelmente deve ter cooldown: round |
| 39 | skill_life_drain | hero_skill | op_triggered | Drenar Vida: ao causar dano, cura X | — | evt_damage_dealt | ok | — |
| 40 | skill_opportunity_shot | hero_skill | op_active (script) | Tiro de Oportunidade: 1×/combate, causa dano direto | — | — | ok | op_active, cooldown via oncePer |
| 41 | skill_last_light_ward | hero_skill | op_triggered | Resguardo da Última Luz: −X dano Roxo sofrido | while_in_play | evt_damage_taken | B2, B5 | empilha modifier a cada dano; converter para op_passive |
| 42 | skill_protective_veil | hero_skill | op_triggered | Véu Protetor: 1×/sala, ignora 1º efeito que te escolha | — | evt_targeted | B4 | scope: room |
| 43 | skill_rift_light_step | hero_skill | op_triggered | Passo Leve: 1×/sala, ignora 1º descarte extra | — | evt_dungeon_discard | B4 | scope: room |
| 44 | skill_minor_rune | hero_skill | op_triggered | Runa Menor: 1×/sala, rerola dado com valor 1 | — | evt_roll | B4 | scope: room |
| 45 | skill_focus_deflection | hero_skill | op_triggered (script) | Desvio de Foco: 1×/sala, troca alvo ou +2 acerto | — | evt_targeted | B4 | scope: room |
| 46 | power_greater_last_light_miracle | hero_power | op_active | Milagre Maior: 1×/jogo, cura total ou sobrevive com 1 | — | — | ok | op_active, game scope via oncePer |
| 47 | power_unbreakable_bastion_guard | hero_power | op_active_buff | Guarda Inquebrável: 1×/jogo, −1 dano a todos até fim da rodada | until_end_of_round | — | ok | duration correto; tick ok |
| 48 | power_restored_path | hero_power | op_active | Caminho Restaurado: 1×/jogo, recupera carta dungeon | — | — | ok | — |
| 49 | power_supreme_rift_rune | hero_power | op_triggered | Runa Suprema: 1×/jogo, dado → 6 ou inimigo → 1 | — | evt_roll | ok | scope: game = remoção permanente, intencional |
| 50 | power_mighty_crimson_fury | hero_power | op_triggered | Fúria Rubra Poderosa: 1×/jogo, bônus dano até fim combate | until_end_of_combat | evt_damage_dealt | ok | scope: game ok |
| 51 | power_last_light_oath | hero_power | op_active | Juramento: 1×/jogo, cura 5 todos ou +5 dano sagrado | once (opção dano) | — | B1 | once no modifier da opção +5; nunca consumido |
| 52 | power_deep_veil_echo | hero_power | op_triggered (script) | Eco Profundo: 1×/jogo, ao destruir criatura, guarda Eco | — | evt_kill | ok | game scope |
| 53 | power_hunter_execution | hero_power | op_triggered | Execução do Caçador: 1×/jogo, dado → 6 + +1 dano vs presa | once | evt_roll | B1 | once não consumido (game scope remove TriggerComponent, ok); modifier once nunca consumido |
| 54 | purple_raging_flames | monster_purple | op_triggered | Chamas Vorazes: ao entrar em jogo, 1 dano a todos | — | evt_enter_play | B7 | evt_enter_play → CombatStarted; não cobre spawn mid-combat |
| 55 | purple_forge_chains | monster_purple | op_passive | Correntes da Fornalha: criatura em jogo → heróis não fogem | — (p_block) | — | B3, PD | installPassive não chama; p_block flee precisa de escopo de entidade |
| 56 | purple_ruin_ashes | monster_purple | op_triggered | Cinzas da Ruína: ao ser destruída, descarta dungeon | — | evt_destroy | ok | — |
| 57 | purple_crimson_plate | monster_purple | op_triggered | Couraça Rubra: 1º dano por rodada ignorado | — | evt_damage_taken | B4 | scope: round, trigger removido |
| 58 | purple_ash_protection | monster_purple | op_triggered | Proteção das Cinzas: −X todo dano sofrido | while_in_play | evt_damage_taken | B2, B5 | empilha modifier a cada dano; converter para op_passive (redução sempre presente) |
| 59 | purple_dark_awakening | monster_purple | op_triggered | Despertar Sombrio: ao entrar em jogo, +1 despertar | — | evt_enter_play | B7 | idem purple_raging_flames |
| 60 | purple_deadly_awakening | monster_purple | op_triggered | Despertar Mortal: ao ser destruída, +1 despertar | — | evt_destroy | ok | — |
| 61 | purple_ember_blood | monster_purple | op_triggered | Sangue em Brasa: ao sofrer dano, herói agressor sofre 1 | — | evt_damage_taken | ok | — |
| 62 | purple_depths_seal | monster_purple | op_passive | Selo das Profundezas: heróis não usam poderes 1×/jogo | — (p_block) | — | B3, PD | installPassive não chama; p_block power_use |
| 63 | purple_dark_tribute | monster_purple | op_triggered | Tributo Sombrio: pré-combate, descarta item ou dungeon | — | evt_combat_start | ok | — |
| 64 | purple_blood_tribute | monster_purple | op_triggered | Tributo de Sangue: pré-combate, descarta item ou 3 dano | — | evt_combat_start | ok | — |
| 65 | purple_veil_retaliation | monster_purple | op_triggered | Retaliação do Véu: ao ser acertada, herói sofre X dano | — | evt_hit | ok | — |
| 66 | purple_healing_rupture | monster_purple | op_triggered | Ruptura da Cura: ao entrar na sala, anula próxima cura | — (p_block sem duration) | evt_room_enter | PD | p_block heal sem duration; label diz "próxima cura" → needs duration: once |
| 67 | purple_ancient_veil_prison | monster_purple | op_triggered | Prisão do Véu Antigo: 1×/sala, 1º alvo −X acerto | once | evt_targeted | B1, B4 | once não consumido + trigger removido |
| 68 | purple_deep_veil_seal | monster_purple | op_passive | Selo do Véu Profundo: heróis não reduzem nível dungeon | — (p_block) | — | B3, PD | installPassive não chama; p_block dungeon_level_reduction |
| 69 | purple_crimson_shackles | monster_purple | op_triggered | Grilhões Rubros: 1×/sala, 1º alvo −3 acerto e −3 dano | once × 2 | evt_targeted | B1, B4 | idem |
| 70 | item_skill_deadly_edge | item_skill | op_triggered | Fio Mortal: +X acerto, se ganhar por 4+ então +X dano | once × 2 | evt_attack_declared | B1 | once não consumido (mas op_triggered sem cooldown → ok para lógica; ainda B1 no ECS) |
| 71 | item_skill_block | item_skill | op_triggered | Bloqueio: −X dano sofrido | while_in_play | evt_damage_taken | B2, B5 | empilha modifier; deve ser op_passive (enquanto item equipado) |
| 72 | item_skill_mystic_draw | item_skill | op_active | Saque Místico: saca carta de artefato | — | — | ok | — |
| 73 | item_skill_last_light_blade | item_skill | op_triggered | Lâmina da Última Luz: +2 acerto/dano vs chefe/subchefe | until_end_of_combat | evt_combat_start | ok | — |
| 74 | dungeon_skill_confinement | dungeon_skill | op_passive | Confinamento: criaturas/heróis não fogem | — (p_block) | — | B3, PD | installPassive não chama; p_block flee de sala |
| 75 | dungeon_skill_dead_torches | dungeon_skill | op_triggered | Tochas Mortas: 1×/sala, descarta item ou −1 acerto | until_end_of_combat | evt_combat_start | B4 | scope: room |
| 76 | dungeon_skill_column_fall | dungeon_skill | op_triggered | Queda de Coluna: 1ª criatura destruída → 1 dano em outra | — | evt_kill | B4 | scope: room |
| 77 | dungeon_skill_uneven_floor | dungeon_skill | op_triggered | Piso Irregular: herói perde combate → +1 descarte | — | evt_combat_end | ok | — |
| 78 | dungeon_skill_forge_spoils | dungeon_skill | op_triggered | Espólios da Fornalha: ao vencer sala, olha 2 itens | — | evt_room_leave | B6 | evt_room_leave → CombatEnded errado |
| 79 | dungeon_skill_rekindled_forge | dungeon_skill | op_triggered (script) | Forja Reacesa: ao vencer sala, busca item equipável | — | evt_room_leave | B6 | idem |
| 80 | dungeon_skill_summon_guardian | dungeon_skill | op_triggered (script) | Invocar Guardião: ao revelar sala, adiciona subchefe | — | evt_room_reveal | ok | — |
| 81 | boss_skill_living_ash_throne | boss_skill | op_triggered | Trono de Cinzas Vivas: 1º dano/rodada reduzido em 1 | once | evt_damage_taken | B1, B4 | once não consumido + scope: round |
| 82 | boss_skill_dark_forge_pressure | boss_skill | op_triggered | Pressão da Fornalha: pós rodada, nível Roxo → descarte | — | evt_round_end | ok | — |
| 83 | boss_skill_azhakar_ascension | boss_skill | op_triggered | Ascensão de Azhakar: meia vida → +2 Bônus de Acerto perm. | passive | evt_damage_taken | PD | duration: passive → permanent; condition impede re-disparo, mas "passive" como duration é ambíguo; considerar permanent explícito |
| 84 | item_skill_drain_life_and_deadly_edge | item_skill | op_triggered | Drenar Vida e Fio Mortal: +X acerto, +X dano se ganhar por 4+, cura 1 | once × 2 | evt_attack_declared | B1 | idem item_skill_deadly_edge |
| 85 | item_skill_block_and_last_light_ward | item_skill | op_triggered | Bloqueio e Resguardo: −X dano físico, −2 dano Roxo | while_in_play × 2 | evt_damage_taken | B2, B5 | idem item_skill_block |
| 86 | item_skill_crimson_fury_mighty | item_skill | op_triggered | Fúria Rubra Poderosa: 1×/jogo, bônus +6 até fim combate | until_end_of_combat | evt_attack_declared | ok | scope: game = remoção permanente, intencional |
| 87 | dungeon_skill_subboss_room | dungeon_skill | op_passive | Sala do Subchefe: sala especial | — (i_noop) | — | ok | noop, sem efeito real |
| 88 | dungeon_skill_empty_room | dungeon_skill | op_passive | Sala Vazia: sem efeito | — (i_noop) | — | ok | noop, sem efeito real |

---

## Resumo por buraco

| Buraco | Skills afetadas | Lote corretor |
|---|---|---|
| B1 | skill_crimson_fury, skill_bastion_guard, skill_scorching_heat, skill_chains_prison, skill_last_light_miracle (opção), power_last_light_oath (opção), power_hunter_execution, purple_ancient_veil_prison, purple_crimson_shackles, item_skill_deadly_edge, item_skill_drain_life_and_deadly_edge, boss_skill_living_ash_throne | Lote A |
| B2 | skill_charred_plate, skill_last_light_ward, skill_gelatinous_body, purple_ash_protection, item_skill_block, item_skill_block_and_last_light_ward | Lote B |
| B3 | skill_hunter_focus, skill_sealed_door, skill_path_corruption, skill_gelatinous_body, purple_forge_chains, purple_depths_seal, purple_deep_veil_seal, dungeon_skill_confinement | Lote C |
| B4 | skill_last_light_shield, skill_preserved_path, skill_perfect_rune, skill_scorching_heat, skill_ruined_floor, skill_dark_tribute, skill_rift_evasion, skill_chains_prison, skill_rift_light_step, skill_protective_veil, skill_focus_deflection, skill_minor_rune, purple_crimson_plate, purple_ancient_veil_prison, purple_crimson_shackles, dungeon_skill_dead_torches, dungeon_skill_column_fall, boss_skill_living_ash_throne | Lote D |
| B5 | skill_charred_plate, skill_last_light_ward, purple_ash_protection, item_skill_block, item_skill_block_and_last_light_ward | Lote E |
| B6 | skill_rekindled_forge, skill_forge_spoils, dungeon_skill_forge_spoils, dungeon_skill_rekindled_forge | Lote F |
| B7 | purple_raging_flames, purple_dark_awakening | Lote F |
| PD | skill_crimson_chains (p_block sem duration), skill_forge_smoke (p_block sem expiry), skill_sealed_door (p_block escopo sala), skill_path_corruption (idem), skill_path_safeguard (sem cooldown esperado), purple_forge_chains, purple_depths_seal, purple_deep_veil_seal, purple_healing_rupture (duration: once faltando), dungeon_skill_confinement, boss_skill_azhakar_ascension (passive ambíguo) | Decisão de design |

## Skills sem buraco (ok)

skill_last_light_healing, skill_rift_rune, skill_living_ember, skill_living_ember_oil, skill_rift_second_chance, skill_prey_mark, skill_return_rite, skill_final_dawn_light, skill_choking_ashes, skill_forge_awakening, skill_piercing_strike, skill_lone_beast, skill_treacherous_attack, skill_cowardly_flee, skill_hidden_flame_presence, skill_pack_courage, skill_illuminate_path, skill_life_drain, skill_opportunity_shot, power_greater_last_light_miracle, power_unbreakable_bastion_guard, power_restored_path, power_supreme_rift_rune, power_mighty_crimson_fury, power_deep_veil_echo, purple_ruin_ashes, purple_deadly_awakening, purple_ember_blood, purple_dark_tribute, purple_blood_tribute, purple_veil_retaliation, item_skill_mystic_draw, item_skill_last_light_blade, dungeon_skill_uneven_floor, dungeon_skill_summon_guardian, boss_skill_dark_forge_pressure, item_skill_crimson_fury_mighty, dungeon_skill_subboss_room, dungeon_skill_empty_room

(39 de 88 sem buraco estrutural)
