# purple_ember_blood — Sangue em Brasa

## Origem
- **type**: `damage_reflect`
- **trigger**: `on_take_damage`
- **target**: `attacking_hero`
- **value/defaultValue**: `1`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - creature_low_fire_salamander (creature, field=purpleEffect, value=1)
- **Label template**: _Sangue em Brasa: sempre que esta criatura sofrer dano, o herói que causou esse dano sofre 1 dano direto._

## Trigger decomposto
- `on`: `on_take_damage`

## Comportamento esperado
sempre que esta criatura sofrer dano, o herói que causou esse dano sofre 1 dano direto.

## ⚠️ Bug / Gap identificado
BUG: type='damage_reflect' não registrado. Efeito nunca dispara.

## Decisão: **DSL**
add_trigger on_take_damage → apply_damage 1 ao atacante.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
