# skill_chains_prison — Prisão das Correntes

## Origem
- **type**: `tohit_penalty`
- **trigger**: `on_first_target_chosen_in_room`
- **target**: `target_hero`
- **value/defaultValue**: `-2`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Soma `value` em `combat.tohitPenaltyByHero[heroId]`. BUG: `ctx.sourceHeroId` pode ser undefined em skills de criatura.
- **usedBy**:
  - (nenhum)
- **Label template**: _Prisão das Correntes: o primeiro herói escolhido como alvo nesta sala recebe -2 no total da próxima rolagem._

## Trigger decomposto
- `on`: `on_target_chosen`
- `limit`: `once_per_room`

## Comportamento esperado
o primeiro herói escolhido como alvo nesta sala recebe -2 no total da próxima rolagem.


## Decisão: **DSL**
add_modifier tohit_penalty -2 ao primeiro herói escolhido como alvo.

## Casos de teste
1. Após disparar: combat.tohitPenaltyByHero[heroId] aumenta em |value|.
