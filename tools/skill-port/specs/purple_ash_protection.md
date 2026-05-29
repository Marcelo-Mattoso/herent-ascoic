# purple_ash_protection — Proteção das Cinzas

## Origem
- **type**: `armor`
- **trigger**: `on_take_damage`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: true
- **Handler atual**: Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.
- **usedBy**:
  - creature_broken_gates_watcher (creature, field=purpleEffect, value=1)
  - creature_catacomb_skeleton (creature, field=purpleEffect, value=2)
  - creature_dead_torch_sentinel (creature, field=purpleEffect, value=2)
- **Label template**: _Proteção das Cinzas ({value}): esta criatura reduz em {value} todo dano que sofreria._

## Trigger decomposto
- `on`: `on_take_damage`

## Comportamento esperado
esta criatura reduz em {value} todo dano que sofreria.

## ⚠️ Bug / Gap identificado
BUG: handleArmor aplica damageReduction a todos os heróis. Proteção da criatura nunca funciona.

## Decisão: **DSL**
add_modifier damage_reduction on_take_damage (self).

## Casos de teste
1. Reduz dano sofrido pela criatura-fonte em value pontos. (bug atual: aplica a heróis)
2. Sem state.combat: state inalterado.
