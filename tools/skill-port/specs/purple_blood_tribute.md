# purple_blood_tribute — Tributo de Sangue

## Origem
- **type**: `item_or_damage`
- **trigger**: `before_combat`
- **target**: `group_or_chosen_hero`
- **value/defaultValue**: `3`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - creature_low_ember_kobold (creature, field=purpleEffect, value=3)
- **Label template**: _Tributo de Sangue: antes do combate, o grupo deve descartar 1 item ou sofrer 3 dano em um herói à escolha._

## Trigger decomposto
- `on`: `before_combat`

## Comportamento esperado
antes do combate, o grupo deve descartar 1 item ou sofrer 3 dano em um herói à escolha.

## ⚠️ Bug / Gap identificado
BUG: type='item_or_damage' não registrado. Tributo nunca cobrado.

## Decisão: **DSL**
choose_one before_combat: discard_from item OU apply_damage 3 a herói escolhido.

## Casos de teste
1. Grupo tem item e dungeon: SKILL_CHOICE aberto com ambas opções.
2. Grupo sem item: apenas opção dungeon.
