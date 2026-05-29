# purple_deadly_awakening — Despertar Mortal

## Origem
- **type**: `dungeonLevel`
- **trigger**: `on_destroyed`
- **target**: `dungeon`
- **value/defaultValue**: `1`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Incrementa `state.despertar` em `value` (máx 4).
- **usedBy**:
  - creature_hidden_flame_cultist (creature, field=purpleEffect, value=1)
  - creature_ruined_hall_ogre (creature, field=purpleEffect, value=1)
  - creature_broken_chains_brute (creature, field=purpleEffect, value=1)
  - subboss_cracked_abyss_guardian (subboss, field=purpleEffect, value=1)
- **Label template**: _Despertar Mortal: quando esta criatura for destruída, aumente o Despertar da Masmorra em 1 nível._

## Trigger decomposto
- `on`: `on_destroyed`

## Comportamento esperado
quando esta criatura for destruída, aumente o Despertar da Masmorra em 1 nível.


## Decisão: **DSL**
add_modifier dungeonLevel +1 on_destroyed.

## Casos de teste
1. Despertar avança N níveis (max 4).
2. Despertar já em 4: permanece em 4.
