# purple_veil_retaliation — Retaliação do Véu

## Origem
- **type**: `damage_reflect`
- **trigger**: `on_hit_received`
- **target**: `attacking_hero`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: true
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - creature_wet_stone_slime (creature, field=purpleEffect, value=1)
  - creature_hot_ash_worm (creature, field=purpleEffect, value=1)
- **Label template**: _Retaliação do Véu ({value}): sempre que esta criatura for acertada por um herói, esse herói sofre {value} de dano._

## Trigger decomposto
- `on`: `on_hit_received`

## Comportamento esperado
sempre que esta criatura for acertada por um herói, esse herói sofre {value} de dano.

## ⚠️ Bug / Gap identificado
BUG: type='damage_reflect' não registrado. Efeito nunca dispara.

## Decisão: **DSL**
add_trigger on_hit_received → apply_damage value ao atacante.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
