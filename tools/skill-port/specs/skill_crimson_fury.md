# skill_crimson_fury — Fúria Rubra

## Origem
- **type**: `damage_bonus`
- **trigger**: `before_attack`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Cobra `value` de vida do herói-fonte (applyDamageMin1) e registra `value*3` em `combat.bonusNextAttack`. Mutação direta de state.
- **usedBy**:
  - hero_crimson_barbarian (hero, field=skill, value=2)
  - item_fury_potion (item, field=effect, value=2)
- **Label template**: _Fúria Rubra ({value}): este personagem sofre {value} de dano para causar dano adicional igual a 3 vezes o valor sofrido no próximo ataque._

## Trigger decomposto
- `on`: `before_attack`

## Comportamento esperado
este personagem sofre {value} de dano para causar dano adicional igual a 3 vezes o valor sofrido no próximo ataque.


## Decisão: **Script**
Self-damage + bonusNextAttack com duração condicional; interações entre dois estados que DSL não modela limpo.

## Casos de teste
1. Ativo com cost=2: herói paga 2 vida, registra +6 em bonusNextAttack.
2. Cost=0 ou null: state inalterado.
