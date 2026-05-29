# purple_raging_flames — Chamas Vorazes

## Origem
- **type**: `direct_damage`
- **trigger**: `on_enter_play`
- **target**: `all_heroes`
- **value/defaultValue**: `1`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Causa `value` de dano via applyDamage. Resolve alvos: targetEnemyIds → heroId menor vida → targetHeroIds. parseNumber falha em '2/3'.
- **usedBy**:
  - (nenhum)
- **Label template**: _Chamas Vorazes: ao entrar em jogo, cause 1 de dano direto a todos os heróis._

## Trigger decomposto
- `on`: `on_enter_play`

## Comportamento esperado
ao entrar em jogo, cause 1 de dano direto a todos os heróis.


## Decisão: **DSL**
apply_damage 1 a todos os heróis on_enter_play.

## Casos de teste
1. targetEnemyIds preenchido: inimigo sofre value de dano.
2. Sem alvo explícito: herói com menor vida sofre dano.
