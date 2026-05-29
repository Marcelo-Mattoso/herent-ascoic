# item_skill_block — Bloqueio

## Origem
- **type**: `armor`
- **trigger**: `on_take_damage`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade_item`
- **usesVariable**: true
- **Handler atual**: Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.
- **usedBy**:
  - item_cracked_shield (item, field=effect, value=2)
  - item_reinforced_leather_armor (item, field=effect, value=1)
  - item_ancient_metal_armor (item, field=effect, value=2)
  - item_stoneskin_potion (item, field=effect, value=3)
  - item_warm_blood_charm (item, field=effect, value=10)
- **Label template**: _Bloqueio ({value}): reduza em {value} o dano sofrido por este herói._

## Trigger decomposto
- `on`: `on_take_damage`

## Comportamento esperado
reduza em {value} o dano sofrido por este herói.


## Decisão: **DSL**
add_modifier damage_reduction on_take_damage.

## Casos de teste
1. Reduz dano sofrido pelo portador em value pontos.
2. Sem state.combat: state inalterado.
