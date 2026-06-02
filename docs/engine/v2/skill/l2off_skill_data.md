# Referência — `skilldata.txt` (sua build de L2OFF)

Documento gerado a partir do seu próprio `skilldata.txt` (28.911 skills). Reflete a sintaxe e os efeitos **realmente usados** na sua build, não a genérica.

---

## A taxonomia dos prefixos de efeito

A descoberta principal: os prefixos representam **quando o efeito dispara + onde aplica**, não "ativo vs passivo".

| Prefixo | Quando | Onde | Usado por | Total |
|---|---|---|---|---|
| `i_` | **Instantâneo** — uma vez quando o cast resolve | Lista de alvos | Skills ativas (A1/A3) | **89** |
| `p_` | **Persistente** — ativo enquanto o abnormal durar | Modifica stats do alvo | Buffs / debuffs (A2), passivas (P) | **110** |
| `c_` | **Contínuo no caster** — tick periódico | Sempre no próprio dono | Toggles (T) | **6** |
| `t_` | **Tick no alvo** — DoT periódico | Sempre no alvo | Debuffs com dano contínuo | **4** |

### Exemplos de prova

**Toggle `s_fist_fury` (Fist Fury):**
```
operate_type=T
effect={{c_hp;-13;2};{p_attack_speed;{all};25;per}}
```
→ Dreno: -13 HP no **caster** a cada 2s (`c_hp`). Buff: +25% atk speed em qualquer arma (`p_attack_speed`).

**Debuff `s_quest_fatal_poison`:**
```
operate_type=A2
effect={{t_hp_fatal;-20;5};{p_block_move}}
abnormal_time=4200
```
→ DoT no **alvo**: -20 HP a cada 5s (`t_hp_fatal`). Persistente: bloqueia movimento (`p_block_move`).

**Backstab `s_backstab1`:**
```
operate_type=A1
effect={{i_backstab;1107;300;2000};{i_death2;4;1}}
```
→ Efeito monolítico: `i_backstab` já encapsula dano + bônus por trás + crit típico de dagger. O "bleed" do Backstab clássico, **se existe nessa build, está embutido dentro de `i_backstab`** — não há um `t_bleed` separado. `i_death2` é um efeito secundário do conjunto `attr_death`.

### A família dagger usa primitivas genéricas, não monolíticos por skill

Cruzando Mortal Blow, Deadly Blow, Backstab, Lethal Blow e Lethal Shot:

| Skill (top level) | Efeito | Power | Param 2 | Param 3 |
|---|---|---:|---:|---:|
| Mortal Blow | `i_fatal_blow` | 977 | 200 | **0** |
| Deadly Blow | `i_fatal_blow` | 5479 | 200 | **0** |
| Lethal Blow | `i_fatal_blow` | 5773 | 200 | **1000** |
| Backstab | `i_backstab` | 5479 | 300 | 2000 |
| Lethal Shot | `i_p_attack_over_hit` | 5132 | 1000 | — |

Descoberta importante: **não existe `i_lethal_blow`, `i_mortal_blow` nem `i_deadly_blow` separados.** A NCSoft fez um efeito genérico `i_fatal_blow` que cobre toda a família de "golpes de dagger" e parametrizou a diferença:

- **Param 1 (power)** — magnitude do dano base.
- **Param 2 (~200)** — bônus de crítico ou multiplicador (estável em 200 nas três skills `i_fatal_blow`).
- **Param 3 (lethal chance)** — chance de instakill. `0` nas skills "comuns", `1000` no Lethal Blow. O `1000` aparece também no Lethal Shot (segundo parâmetro do `i_p_attack_over_hit`), o que confirma a hipótese: **é a chance da skill matar instantâneo**, em escala provável de basis points. A descrição oficial do Lethal Blow ("a potentially deadly attack") corrobora.

`i_backstab` permanece como efeito próprio (não genérico) porque tem mecânica de posicionamento que `i_fatal_blow` não cobre — o terceiro parâmetro `2000` ali é provavelmente o bônus de dano por estar atrás do alvo, e não a chance de lethal.

**Implicação para modernização:** os efeitos primitivos são mais genuinamente reutilizáveis do que o catálogo bruto sugere. Boa parte do que parecem "monolíticos por skill" é na verdade uma única primitiva parametrizada de formas diferentes. Isso facilita a engenharia reversa e o mapeamento para handlers no engine novo.

---

## Estrutura de um bloco de skill

```
skill_begin
    skill_name = [s_haste1]   /* nome legível */
    skill_id   = 1086
    level      = 1
    operate_type = A2
    magic_level  = 44
    effect       = { {p_attack_speed;{all};15;per} }
    is_magic     = 1
    mp_consume1  = 8        /* MP cobrado no início do cast */
    mp_consume2  = 31       /* MP cobrado ao resolver o cast */
    cast_range      = 400
    effective_range = 900
    skill_hit_time         = 4
    skill_cool_time        = 0
    skill_hit_cancel_time  = 0.5
    reuse_delay  = 6
    activate_rate = -1      /* -1 = sempre aplica (típico de buff) */
    lv_bonus_rate = 0
    basic_property = none   /* stat de resist; none = sem save */
    abnormal_time = 3600
    abnormal_lv   = 1
    abnormal_type = attack_time_down
    attribute     = attr_none
    effect_point  = 418     /* positivo = benéfico */
    target_type   = self
    affect_scope  = party
    affect_range  = 1000
    affect_object = friend
    affect_limit  = {0;0}
    next_action   = none
    debuff        = 0
    ride_state    = {@ride_none;@ride_wind;@ride_star;@ride_twilight}
skill_end
```

Cada **nível** de skill é um bloco próprio. Skill com 30 níveis = 30 `skill_begin … skill_end`.

---

## Campos básicos

| Campo | Função |
|---|---|
| `skill_id`, `level` | Identificadores. |
| `skill_name` | Nome interno entre colchetes. |
| `magic_level` | Nível pra eficiência total. `-1` = sem requisito. |
| `mp_consume1` | MP cobrado no início do cast (perdido se interromper). |
| `mp_consume2` | MP cobrado ao resolver o cast (o "principal"). |
| `cast_range` | Alcance pra começar o cast. |
| `effective_range` | Alcance em que o efeito ainda resolve se o alvo se move. |
| `skill_hit_time` | Tempo de cast (segundos). |
| `skill_cool_time` | Tempo "preso" depois do hit. |
| `skill_hit_cancel_time` | Janela em que o cast pode ser cancelado por dano. |
| `reuse_delay` | Cooldown. |
| `activate_rate` | Chance base de aplicar; `-1` = sempre aplica. |
| `lv_bonus_rate` | Fator de penalidade por diferença de nível. |
| `basic_property` | Stat do alvo usado no save (`men`, `con`, `wit`, `none`). |
| `abnormal_time` | Duração dos efeitos persistentes (em segundos). |
| `abnormal_lv` | "Força" pra empilhamento/sobrescrita. |
| `abnormal_type` | Slot do abnormal — define conflitos com outros buffs/debuffs. |
| `attribute` | Trait do dano/CC pra cálculo de resistência (não é "condição"!). |
| `effect_point` | "Peso" da skill; positivo = benéfico, negativo = hostil. |
| `next_action` | Ação automática após o cast (`attack`, `none`, `sit`, `fake_death`…). |
| `debuff` | `1` força tratar como debuff. |
| `ride_state` | Estados de montaria em que a skill pode ser usada. |

---

## `operate_type` (uso real na sua build)

| Valor | Significado | Ocorrências |
|---|---|---:|
| `A2` | Ativa com duração / buff / debuff | 14.335 |
| `A1` | Ativa instantânea, sem duração | 10.380 |
| `P`  | Passiva (sempre ativa enquanto aprendida) | 3.452 |
| `A3` | Ativa com efeito contínuo (toggle-like) | 403 |
| `T`  | Toggle (liga/desliga, drena recurso) | 330 |

`A4` e `A5` **não existem** na sua build — só os 5 acima.

---

## `target_type` (uso real)

| Valor | Significado | Ocorrências |
|---|---|---:|
| `self` | O próprio caster | 10.100 |
| `enemy` | Inimigo (válido em condições normais de PvP/PvE) | 7.147 |
| `enemy_only` | Estritamente inimigos (mais restritivo) | 4.182 |
| `target` | Alvo selecionado (aliado ou inimigo) | 2.337 |
| `summon` | Pet / servitor | 724 |
| `none` | Sem alvo (passivas, toggles) | 438 |
| `npc_body` | Corpo de NPC morto (Spoil, Sweep, etc.) | 428 |
| `door_treasure` | Portas e baús | 41 |
| `pc_body` | Corpo de player morto (Resurrection) | 24 |
| `item` | Itens (Enchant Weapon/Armor) | 20 |
| `others` | Todos exceto o caster | 5 |
| `wyvern_target` | Especial wyvern | 1 |
| `holything` | Take Castle Flag / Fortress | 1 |

### Lógica por trás
O `target_type` é uma **tag declarativa** mapeada pra um enum interno no binário. Quando a skill é usada, o servidor faz um `switch` em cima do enum e cada `case` retorna a lista de alvos. **Você não cria valores novos sem patchar o `.exe`.**

---

## Escopo da área

### `affect_scope` (forma do efeito)

| Valor | Significado | Ocorrências |
|---|---|---:|
| `single` | Atinge só o alvo direto | 15.669 |
| `party` | Membros da party | 4.461 |
| `point_blank` | Círculo ao redor do caster | 1.988 |
| `range` | Círculo ao redor do alvo | 1.737 |
| `pledge` | Membros do clã | 724 |
| `fan` | Cone frontal | 394 |
| `none` | Sem área | 117 |
| `square_pb` | Quadrado ao redor do caster | 6 |
| `dead_pledge` | Membros mortos do clã (Mass Res Clan) | 6 |
| `square` | Quadrado ao redor do alvo | 4 |

### `affect_object` (filtro de alvos)

| Valor | Significado | Ocorrências |
|---|---|---:|
| `friend` | Aliados | 5.237 |
| `not_friend` | Não-aliados | 3.867 |
| `undead_real_enemy` | Undead inimigos | 307 |
| `clan` | Membros do clã | 46 |

### `affect_limit = {min;max}`
Número mínimo e máximo de alvos atingidos. `{0;0}` = sem limite.

### `affect_range`
Raio do efeito (em unidades de jogo).

---

## `is_magic` — categoria de cast

| Valor | Significado |
|---|---|
| `0` | Físico — interrompido por stun, não por silence. |
| `1` | Mágico — interrompido por silence, escala com cast speed mágico. |
| `2` | Estático — não interrompível, não acelerável. |

---

## `basic_property` — stat de resistência

| Valor | Significado | Ocorrências |
|---|---|---:|
| `none` | Sem save (buffs, dano puro) | 8.551 |
| `men` | Resiste com MEN (debuffs mágicos) | 3.743 |
| `con` | Resiste com CON (debuffs físicos) | 1.581 |
| `wit` | Resiste com WIT (cancel, mute…) | 879 |

---

## Padrões de parâmetros dos efeitos

### `i_*` — instantâneos

```
{i_m_attack; power}                       ← dano mágico
{i_heal; amount}                          ← cura plana
{i_p_attack; power; over_hit_flag}        ← dano físico
{i_p_attack_over_hit; power; over_hit}    ← dano físico com over-hit
{i_fatal_blow; power; crit_bonus; lethal_chance}  ← família dagger genérica
{i_backstab; power; crit_bonus; behind_bonus}     ← variante com posicionamento
{i_hp_drain; power; vamp_percent}         ← dreno HP
{i_dispel_by_slot; abnormal_type; qtde}   ← remove buff específico
{i_dispel_by_slot_probability; type; chance} ← remove com chance
```

### `p_*` — persistentes (modificadores de stat)

Forma geral:
```
{p_<stat>; {filtro}; valor; modo}
```
Onde `modo` é:
- `per` — percentual (`+15 per` = +15%).
- `diff` — diferença plana (`+50 diff` = +50 absoluto).

E `{filtro}` é uma sub-lista (entre chaves) com restrições (ex: `{all}`, `{sword;dagger;bow}`).

Exemplos:
```
{p_attack_speed; {all}; 15; per}         ← +15% atk speed em qualquer arma
{p_speed; {all}; 33; diff}               ← +33 de speed plano
{p_physical_attack; {all}; 25; per}      ← +25% p.atk
```

### `c_*` — tick no caster

```
{c_hp; valor; tick_segundos}    ← ex: {c_hp;-13;2} = -13 HP a cada 2s
{c_mp; valor; tick_segundos}    ← ex: {c_mp;-1;5}  = -1 MP a cada 5s
```

### `t_*` — tick no alvo (DoT/HoT)

```
{t_hp; valor; tick_segundos}    ← ex: {t_hp;-18;5}  = DoT de 18 a cada 5s
{t_mp; valor; tick_segundos}
{t_hp_fatal; valor; tick_segundos} ← pode matar (não trava em 1 HP)
```

---


# Catálogo completo dos 209 efeitos

Todos os efeitos `i_*`, `p_*`, `c_*`, `t_*` encontrados na sua build, categorizados por função. A coluna "Usos" mostra em quantos blocos de skill cada efeito aparece — efeitos com 1-5 usos são geralmente "monolíticos" hardcoded pra uma skill específica.

## Dano (instantâneo)

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_m_attack` | 2718 | `{i_m_attack;26}` |
| `i_p_attack_over_hit` | 1774 | `{i_p_attack_over_hit;25;0}` |
| `i_p_attack` | 1315 | `{i_p_attack;1;0}` |
| `i_energy_attack` | 855 | `{i_energy_attack;143;2000}` |
| `i_hp_drain` | 706 | `{i_hp_drain;20;20}` |
| `i_death2` | 491 | `{i_death2;4;1}` |
| `i_fatal_blow` | 398 | `{i_fatal_blow;73;200;0}` |
| `i_m_attack_over_hit` | 180 | `{i_m_attack_over_hit;39}` |
| `i_mana_burn` | 175 | `{i_mana_burn;117;90}` |
| `i_death_link` | 118 | `{i_death_link;68}` |
| `i_physical_attack_hp_link` | 76 | `{i_physical_attack_hp_link;2908}` |
| `i_m_attack_by_dist` | 13 | `{i_m_attack_by_dist;33}` |

## Cura (instantânea)

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_heal` | 1200 | `{i_heal;143}` |
| `i_summon_heal_cubic` | 8 | `{i_summon_heal_cubic;1}` |

## Cura / Reviver

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_restoration_random` | 234 | `{i_restoration_random;{{{{[mithril_arrow];700}}` |
| `i_restoration` | 37 | `{i_restoration;[adv_cp_potion];20}` |
| `i_resurrection` | 30 | `{i_resurrection;0}` |
| `i_remove_death_penalty` | 7 | `{i_remove_death_penalty}` |
| `i_rebalance_hp` | 1 | `{i_rebalance_hp}` |

## Modificação de recurso (HP/MP/CP)

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_cp` | 223 | `{i_cp;-7;per}` |
| `i_mp_by_level` | 208 | `{i_mp_by_level;49}` |
| `i_hp_by_level_self` | 181 | `{i_hp_by_level_self;260}` |
| `i_hp_per_max` | 147 | `{i_hp_per_max;10}` |
| `i_mp` | 59 | `{i_mp;-16;diff}` |
| `i_mp_by_level_self` | 30 | `{i_mp_by_level_self;1}` |
| `i_hp` | 27 | `{i_hp;435;diff}` |
| `i_mp_per_max` | 21 | `{i_mp_per_max;1}` |
| `i_hp_self` | 6 | `{i_hp_self;-11.98}` |

## Tick no alvo (DoT/regen contínuo)

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `t_hp` | 1224 | `{t_hp;-18;5}` |
| `t_mp` | 68 | `{t_mp;-4;5}` |
| `t_hate_master` | 10 | `{t_hate_master;10;1}` |
| `t_hp_fatal` | 2 | `{t_hp_fatal;-20;5}` |

## Tick no caster (toggle drain/regen)

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `c_mp_by_level` | 256 | `{c_mp_by_level;-0.2;5}` |
| `c_mp` | 24 | `{c_mp;-1;5}` |
| `c_hp` | 4 | `{c_hp;-13;2}` |
| `c_rest` | 1 | `{c_rest;-1;3}` |
| `c_fake_death` | 1 | `{c_fake_death;-10;5}` |
| `c_chameleon_rest` | 1 | `{c_chameleon_rest;-2;5}` |

## Dispel / Cancel

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_dispel_by_slot_probability` | 454 | `{i_dispel_by_slot_probability;attack_time_down;40}` |
| `i_dispel_by_slot` | 426 | `{i_dispel_by_slot;poison;3}` |
| `i_target_cancel_chance` | 329 | `{i_target_cancel_chance;50}` |
| `p_reduce_cancel` | 141 | `{p_reduce_cancel;-18;diff}` |
| `p_resist_dispel_by_category` | 139 | `{p_resist_dispel_by_category;slot_buff;-30;per}` |
| `i_dispel_all` | 45 | `{i_dispel_all}` |
| `i_dispel_by_category` | 20 | `{i_dispel_by_category;slot_buff;5}` |
| `i_target_cancel` | 13 | `{i_target_cancel}` |

## Invocação

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_summon` | 859 | `{i_summon;[cat_the_cat_a];70;[crystal_d];0}` |
| `i_summon_debuff_cubic` | 20 | `{i_summon_debuff_cubic;1}` |
| `i_summon_water_dot_cubic` | 18 | `{i_summon_water_dot_cubic;1}` |
| `i_summon_dd_cubic` | 16 | `{i_summon_dd_cubic;1}` |
| `i_summon_shock_cubic` | 9 | `{i_summon_shock_cubic;1}` |
| `i_summon_paralyze_cubic` | 9 | `{i_summon_paralyze_cubic;1}` |
| `i_summon_drain_cubic` | 7 | `{i_summon_drain_cubic;1}` |
| `i_summon_poison_cubic` | 6 | `{i_summon_poison_cubic;1}` |
| `i_summon_npc` | 4 | `{i_summon_npc;[small_baby_gourd];1}` |
| `i_summon_spirit_shot` | 2 | `{i_summon_spirit_shot;100;40;1.0}` |
| `i_summon_soul_shot` | 1 | `{i_summon_soul_shot;100}` |
| `i_summon_pet` | 1 | `{i_summon_pet}` |

## Aggro / Controle de IA

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_target_me` | 485 | `{i_target_me}` |
| `i_run_away` | 369 | `{i_run_away;30;20}` |
| `i_add_hate` | 104 | `{i_add_hate;-132}` |
| `i_delete_hate` | 51 | `{i_delete_hate;40}` |
| `i_randomize_hate` | 38 | `{i_randomize_hate;80}` |
| `i_delete_hate_of_me` | 37 | `{i_delete_hate_of_me;50}` |
| `i_confuse` | 31 | `{i_confuse;20;20}` |
| `i_escape` | 21 | `{i_escape;town}` |
| `i_distrust` | 15 | `{i_distrust;20;20}` |
| `i_fly_away` | 2 | `{i_fly_away}` |

## Coleta / Pesca / Manor

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_spoil` | 141 | `{i_spoil}` |
| `i_sweeper` | 62 | `{i_sweeper}` |
| `i_fishing_reeling` | 27 | `{i_fishing_reeling;0.66}` |
| `i_fishing_pumping` | 27 | `{i_fishing_pumping;0.66}` |
| `i_fishing_shot` | 6 | `{i_fishing_shot;100}` |
| `i_sowing` | 3 | `{i_sowing}` |
| `i_harvesting` | 1 | `{i_harvesting}` |
| `i_fishing_cast` | 1 | `{i_fishing_cast}` |

## Utilitário de mundo

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_register_siege_golem` | 93 | `{i_register_siege_golem}` |
| `i_save_position` | 80 | `{i_save_position}` |
| `i_give_contribution` | 41 | `{i_give_contribution;10}` |
| `i_teleport` | 27 | `{i_teleport;-84200;244566;-3728}` |
| `i_unlock` | 24 | `{i_unlock;30;0;0}` |
| `i_install_camp_ex` | 1 | `{i_install_camp_ex}` |
| `i_install_camp` | 1 | `{i_install_camp}` |
| `i_holything_possess` | 1 | `{i_holything_possess}` |

## Utilitário de jogador

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_consume_body` | 428 | `{i_consume_body}` |
| `i_remove_m_power` | 23 | `{i_remove_m_power}` |
| `i_focus_energy` | 17 | `{i_focus_energy;1}` |
| `i_align_direction` | 16 | `{i_align_direction}` |
| `i_spirit_shot` | 12 | `{i_spirit_shot;100;40;1.0}` |
| `i_enchant_weapon` | 10 | `{i_enchant_weapon}` |
| `i_enchant_armor` | 10 | `{i_enchant_armor}` |
| `i_transmit_m_power` | 7 | `{i_transmit_m_power;H}` |
| `i_change_hair_style` | 7 | `{i_change_hair_style;0}` |
| `i_soul_shot` | 6 | `{i_soul_shot;100}` |
| `i_food_for_pet` | 5 | `{i_food_for_pet;100;100;0}` |
| `i_change_hair_color` | 4 | `{i_change_hair_color;0}` |
| `i_change_face` | 3 | `{i_change_face;0}` |
| `i_open_dwarf_recipebook` | 1 | `{i_open_dwarf_recipebook}` |
| `i_open_common_recipebook` | 1 | `{i_open_common_recipebook}` |

## Stat: Combate

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `p_speed` | 1499 | `{p_speed;{all};20;diff}` |
| `p_hit` | 863 | `{p_hit;{all};2;diff}` |
| `p_avoid` | 724 | `{p_avoid;{all};2;diff}` |
| `p_magic_speed` | 717 | `{p_magic_speed;{all};15;per}` |
| `p_critical_damage` | 471 | `{p_critical_damage;30;per}` |
| `p_critical_rate` | 440 | `{p_critical_rate;20;per}` |
| `p_pvp_magical_skill_dmg_bonus` | 237 | `{p_pvp_magical_skill_dmg_bonus;-50;per}` |
| `p_shield_defence_rate` | 215 | `{p_shield_defence_rate;30}` |
| `p_physical_shield_defence` | 162 | `{p_physical_shield_defence;60;per}` |
| `p_magic_critical_rate` | 95 | `{p_magic_critical_rate;200;per}` |
| `p_hit_number` | 83 | `{p_hit_number;5;diff}` |
| `p_area_damage` | 72 | `{p_area_damage;-40;per}` |
| `p_avoid_agro` | 67 | `{p_avoid_agro;70}` |
| `p_physical_shield_defence_angle_all` | 32 | `{p_physical_shield_defence_angle_all}` |
| `p_passive` | 28 | `{p_passive}` |
| `p_avoid_rate_by_hp2` | 25 | `{p_avoid_rate_by_hp2;7.63;diff}` |
| `p_2h_sword_bonus` | 25 | `{p_2h_sword_bonus;7;per;2;diff}` |
| `p_2h_blunt_bonus` | 25 | `{p_2h_blunt_bonus;7;per;2;diff}` |
| `p_critical_rate_position_bonus` | 21 | `{p_critical_rate_position_bonus;back;20;per}` |
| `p_critical_damage_by_weapon` | 16 | `{p_critical_damage_by_weapon;{fist;dualfist};20;per}` |
| `p_pvp_physical_skill_dmg_bonus` | 11 | `{p_pvp_physical_skill_dmg_bonus;5;per}` |
| `p_critical_rate_by_hp2` | 9 | `{p_critical_rate_by_hp2;10;diff}` |
| `p_critical_damage_position` | 8 | `{p_critical_damage_position;back;20;per}` |
| `p_critical_rate_by_weapon` | 7 | `{p_critical_rate_by_weapon;{sword;pole};3.3;diff}` |
| `p_physical_polarm_target_single` | 5 | `{p_physical_polarm_target_single}` |
| `p_pledge_speed` | 3 | `{p_pledge_speed;{count};3;diff}` |
| `p_pledge_shield_defence_rate` | 3 | `{p_pledge_shield_defence_rate;{viscount};10;per}` |
| `p_pledge_physical_shield_defence` | 3 | `{p_pledge_physical_shield_defence;{baron};10;per}` |
| `p_pledge_hit` | 3 | `{p_pledge_hit;{baron};1;diff}` |
| `p_pledge_avoid` | 3 | `{p_pledge_avoid;{baron};2;diff}` |
| `p_avoid_by_move_mode` | 3 | `{p_avoid_by_move_mode;run;4;diff}` |
| `p_skill_critical` | 2 | `{p_skill_critical;str}` |
| `p_physical_armor_hit` | 2 | `{p_physical_armor_hit;{armor_light};2;diff}` |
| `p_skill_critical_probability` | 1 | `{p_skill_critical_probability;1000;per}` |
| `p_hit_at_night` | 1 | `{p_hit_at_night;3;diff}` |
| `p_critical_rate_by_hp1` | 1 | `{p_critical_rate_by_hp1;30;diff}` |

## Stat: Ataque

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `p_physical_attack` | 1851 | `{p_physical_attack;{all};5;per}` |
| `p_attack_speed` | 1098 | `{p_attack_speed;{all};5;per}` |
| `p_magical_attack` | 656 | `{p_magical_attack;{all};55;per}` |
| `p_vampiric_attack` | 235 | `{p_vampiric_attack;5}` |
| `p_attack_attribute` | 148 | `{p_attack_attribute;attr_holy}` |
| `p_fatal_blow_rate` | 141 | `{p_fatal_blow_rate;60;per}` |
| `p_pvp_physical_attack_dmg_bonus` | 106 | `{p_pvp_physical_attack_dmg_bonus;5;per}` |
| `p_attack_speed_by_weapon` | 84 | `{p_attack_speed_by_weapon;{bow};8;per}` |
| `p_attack_range` | 79 | `{p_attack_range;{bow};200;diff}` |
| `p_attack_speed_by_hp2` | 20 | `{p_attack_speed_by_hp2;13;per}` |
| `p_physical_attack_by_hp1` | 14 | `{p_physical_attack_by_hp1;32.9;diff}` |
| `p_pledge_physical_attack` | 3 | `{p_pledge_physical_attack;{knight};3;per}` |
| `p_pledge_magical_attack` | 3 | `{p_pledge_magical_attack;{viscount};3;per}` |
| `p_physical_attack_by_hp2` | 1 | `{p_physical_attack_by_hp2;43;per}` |

## Stat: Defesa

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `p_defence_attribute` | 3364 | `{p_defence_attribute;attr_hold;-20}` |
| `p_physical_defence` | 1795 | `{p_physical_defence;{all};8;per}` |
| `p_magical_defence` | 1214 | `{p_magical_defence;{all};23;per}` |
| `p_damage_shield` | 389 | `{p_damage_shield;10}` |
| `p_pledge_defence_attribute` | 21 | `{p_pledge_defence_attribute;viscount;attr_water;-5}` |
| `p_reflect_skill` | 19 | `{p_reflect_skill;0;30}` |
| `p_transfer_damage_summon` | 5 | `{p_transfer_damage_summon;10}` |
| `p_pledge_physical_defence` | 3 | `{p_pledge_physical_defence;{knight};3;per}` |
| `p_pledge_magical_defence` | 3 | `{p_pledge_magical_defence;{heir};6;per}` |
| `p_self_resurrection` | 2 | `{p_self_resurrection;100}` |

## Stat: HP/MP/CP/Regen

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `p_max_hp` | 430 | `{p_max_hp;10;per}` |
| `p_hp_regen` | 251 | `{p_hp_regen;{all};10;per}` |
| `p_heal_effect` | 203 | `{p_heal_effect;-50;per}` |
| `p_magic_mp_cost` | 198 | `{p_magic_mp_cost;0;-10;per}` |
| `p_max_mp` | 189 | `{p_max_mp;10;per}` |
| `p_mp_regen` | 184 | `{p_mp_regen;{all};20;per}` |
| `p_mana_charge` | 139 | `{p_mana_charge;-49}` |
| `p_breath` | 78 | `{p_breath;400;per}` |
| `p_max_cp` | 75 | `{p_max_cp;10;diff}` |
| `p_mp_regen_by_move_mode` | 28 | `{p_mp_regen_by_move_mode;sit;0.9;diff}` |
| `p_hp_regen_by_move_mode` | 16 | `{p_hp_regen_by_move_mode;sit;1.9;diff}` |
| `p_physical_defence_by_hp1` | 11 | `{p_physical_defence_by_hp1;116.875;diff}` |
| `p_pledge_mp_regen` | 3 | `{p_pledge_mp_regen;{viscount};1;per}` |
| `p_pledge_max_mp` | 3 | `{p_pledge_max_mp;{viscount};6;per}` |
| `p_pledge_max_hp` | 3 | `{p_pledge_max_hp;{heir};3;per}` |
| `p_pledge_max_cp` | 3 | `{p_pledge_max_cp;{baron};6;per}` |
| `p_pledge_hp_regen` | 3 | `{p_pledge_hp_regen;{heir};3;per}` |
| `p_pledge_cp_regen` | 3 | `{p_pledge_cp_regen;{elder};3;per}` |

## Stat: Bloqueio / Resistência

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `p_block_act` | 1974 | `{p_block_act}` |
| `p_block_move` | 787 | `{p_block_move}` |
| `p_block_spell` | 244 | `{p_block_spell}` |
| `p_block_controll` | 80 | `{p_block_controll}` |
| `p_block_getdamage` | 78 | `{p_block_getdamage;block_hp}` |
| `p_block_buff` | 61 | `{p_block_buff}` |
| `p_block_skill_physical` | 42 | `{p_block_skill_physical}` |
| `p_block_debuff` | 42 | `{p_block_debuff}` |
| `p_resist_abnormal_by_category` | 20 | `{p_resist_abnormal_by_category;slot_debuff;-20;per}` |
| `p_block_icon_action` | 10 | `{p_block_icon_action}` |
| `p_preserve_abnormal` | 3 | `{p_preserve_abnormal}` |
| `p_abnormal_rate_limit` | 1 | `{p_abnormal_rate_limit}` |

## Stat: Clan / Pledge

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `p_pledge_reduce_exp_penalty` | 6 | `{p_pledge_reduce_exp_penalty;heir;pvp;1}` |

## Stat: Diversos / QoL

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `p_reuse_delay` | 179 | `{p_reuse_delay;1;-20;per}` |
| `p_fear` | 80 | `{p_fear}` |
| `p_weight_penalty` | 73 | `{p_weight_penalty;3000}` |
| `p_enlarge_storage` | 51 | `{p_enlarge_storage;inventory_normal;1}` |
| `p_fishing_mastery` | 27 | `{p_fishing_mastery;0.66}` |
| `p_weight_limit` | 25 | `{p_weight_limit;100;per}` |
| `p_safe_fall_height` | 12 | `{p_safe_fall_height;60;diff}` |
| `p_create_item` | 9 | `{p_create_item;1}` |
| `p_create_common_item` | 9 | `{p_create_common_item;1}` |
| `p_reduce_drop_penalty` | 7 | `{p_reduce_drop_penalty}` |
| `p_remove_equip_penalty` | 5 | `{p_remove_equip_penalty;d}` |
| `p_crystallize` | 5 | `{p_crystallize;d}` |
| `p_enlarge_buff_slots` | 4 | `{p_enlarge_buff_slots;1}` |
| `p_autocast_skill` | 4 | `{p_autocast_skill;5632513;60}` |
| `p_cubic_mastery` | 2 | `{p_cubic_mastery;2}` |
| `p_set_collected` | 1 | `{p_set_collected}` |
| `p_luck` | 1 | `{p_luck}` |

## Outros

| Efeito | Usos | Assinatura exemplo |
|---|---:|---|
| `i_backstab` | 97 | `{i_backstab;1107;300;2000}` |
| `i_sp` | 6 | `{i_sp;500;diff}` |


---

## Nota sobre fragmentação de dados

Nem tudo que aparece no tooltip de uma skill in-game vem do `skilldata.txt`. A fonte da verdade está espalhada por arquivos diferentes — isso é importante quando estiver fazendo engenharia reversa de uma skill.

| Informação | Onde mora |
|---|---|
| Power, MP cost, range, cast time, efeitos, alvos | `skilldata.txt` (este arquivo) |
| **SP cost** para aprender a skill | `skill_tree` / `pc_parameter` (outro arquivo) |
| Pré-requisitos por classe / nível | `skill_tree` |
| Nome traduzido, ícone, animação | `system/*.dat` (lado do client) |
| Descrição do tooltip | `system/skillgrp.dat` (lado do client) |

Exemplo: o tooltip do **Lethal Blow (1)** mostra `MP=85, Range=40, SP=12.500.000, Power=5773`. Os três primeiros valores vêm do `skilldata.txt`; o **SP cost** (12.5 milhões) é o preço pra aprender a skill no NPC trainer e vive no `skill_tree`, não aqui.

Quando comparar tooltip vs `skilldata.txt`, sempre conferir qual arquivo é a fonte de cada campo antes de concluir que algo está "errado".
