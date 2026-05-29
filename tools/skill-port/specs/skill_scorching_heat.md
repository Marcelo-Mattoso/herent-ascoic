# skill_scorching_heat — Calor Escaldante

## Origem
- **type**: `tohit_penalty`
- **trigger**: `first_roll_in_room`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Soma `value` em `combat.tohitPenaltyByHero[heroId]`. BUG: `ctx.sourceHeroId` pode ser undefined em skills de criatura.
- **usedBy**:
  - (nenhum)
- **Label template**: _Calor Escaldante ({value}): os heróis recebem -{value} no total da primeira rolagem feita nesta sala._

## Trigger decomposto
- `on`: `first_roll_in_room`

## Comportamento esperado
os heróis recebem -{value} no total da primeira rolagem feita nesta sala.

## ⚠️ Bug / Gap identificado
BUG: handleTohitPenalty usa ctx.sourceHeroId mas skill de criatura que penaliza TODOS os heróis não tem sourceHeroId. Penalty nunca aplicada.

## Decisão: **DSL**
add_modifier tohit_penalty para todos os heróis no first_roll_in_room.

## Casos de teste
1. Após disparar: combat.tohitPenaltyByHero[heroId] aumenta em |value|.
