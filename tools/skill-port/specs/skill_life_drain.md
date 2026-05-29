# skill_life_drain — Drenar Vida

## Origem
- **type**: `heal`
- **trigger**: `on_deal_damage`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Cura `value` de vida em `ctx.targetHeroIds` (fallback: herói-fonte). Checa `hero.healBlocked` antes.
- **usedBy**:
  - (nenhum)
- **Label template**: _Drenar Vida ({value}): cure do herói portador o equivalente a {value}, apenas se ele causar dano._

## Trigger decomposto
- `on`: `on_deal_damage`

## Comportamento esperado
cure do herói portador o equivalente a {value}, apenas se ele causar dano.


## Decisão: **DSL**
add_trigger on_deal_damage → apply_heal self.

## Casos de teste
1. Cura N de vida em herói-alvo: currentLife aumenta.
2. Herói com healBlocked=true: cura ignorada, log emitido.
