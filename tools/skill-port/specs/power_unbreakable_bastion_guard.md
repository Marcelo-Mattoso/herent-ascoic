# power_unbreakable_bastion_guard — Guarda Inquebrável do Bastião

## Origem
- **type**: `armor`
- **trigger**: `once_per_game_until_end_of_round`
- **target**: `heroes`
- **value/defaultValue**: `1`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.
- **usedBy**:
  - hero_broken_bastion_warrior (hero, field=power, value=1)
- **Label template**: _Guarda Inquebrável do Bastião: até o fim da rodada, todo dano sofrido pelos heróis é reduzido em 1._

## Trigger decomposto
- `on`: `on_use`
- `when`: always
- `limit`: `once_per_game`
- (duração implícita: until_end_of_round)

## Comportamento esperado
até o fim da rodada, todo dano sofrido pelos heróis é reduzido em 1.


## Decisão: **DSL**
add_modifier damage_reduction 1 para todos os heróis until_end_of_round.

## Casos de teste
1. Reduz dano sofrido pela criatura-fonte em value pontos. (bug atual: aplica a heróis)
2. Sem state.combat: state inalterado.
