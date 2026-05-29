# skill_choking_ashes — Cinzas Sufocantes

## Origem
- **type**: `direct_damage`
- **trigger**: `on_use`
- **target**: `lowest_life_hero`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Causa `value` de dano via applyDamage. Resolve alvos: targetEnemyIds → heroId menor vida → targetHeroIds. parseNumber falha em '2/3'.
- **usedBy**:
  - (nenhum)
- **Label template**: _Cinzas Sufocantes ({value}): cause {value} de dano direto ao herói com menos vida._

## Trigger decomposto
- `on`: `on_use`

## Comportamento esperado
cause {value} de dano direto ao herói com menos vida.


## Decisão: **Script**
Complexidade não mapeada — requer análise detalhada.

## Casos de teste
1. targetEnemyIds preenchido: inimigo sofre value de dano.
2. Sem alvo explícito: herói com menor vida sofre dano.
