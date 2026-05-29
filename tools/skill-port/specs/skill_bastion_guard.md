# skill_bastion_guard — Guarda do Bastião

## Origem
- **type**: `armor`
- **trigger**: `on_damage_taken`
- **target**: `hero_or_ally`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.
- **usedBy**:
  - hero_broken_bastion_warrior (hero, field=skill, value=3)
- **Label template**: _Guarda do Bastião ({value}): reduza em {value} o dano que um herói ou aliado sofreria._

## Trigger decomposto
- `on`: `on_damage_taken`

## Comportamento esperado
reduza em {value} o dano que um herói ou aliado sofreria.


## Decisão: **DSL**
add_modifier damage_reduction on_damage_taken.

## Casos de teste
1. Reduz dano sofrido pelo portador em value pontos.
2. Sem state.combat: state inalterado.
