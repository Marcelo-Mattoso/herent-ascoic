# purple_crimson_shackles — Grilhões Rubros

## Origem
- **type**: `tohit_damage_penalty`
- **trigger**: `on_first_target_chosen_by_creature`
- **target**: `target_hero`
- **value/defaultValue**: `"-3/-3"`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - subboss_crimson_dungeon_jailer (subboss, field=purpleEffect, value="-3/-3")
- **Label template**: _Grilhões Rubros: o primeiro herói escolhido como alvo por esta criatura recebe -3 no total da próxima rolagem de ataque e causa -3 de dano se acertar._

## Trigger decomposto
- `on`: `on_target_chosen`
- `limit`: `once_per_combat`

## Comportamento esperado
o primeiro herói escolhido como alvo por esta criatura recebe -3 no total da próxima rolagem de ataque e causa -3 de dano se acertar.

## ⚠️ Bug / Gap identificado
BUG: type='tohit_damage_penalty' não registrado. Penalty nunca aplicada.

## Decisão: **DSL**
add_modifier tohit_penalty -3 + add_modifier damage_penalty -3 ao primeiro herói alvo.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
