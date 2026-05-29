# boss_skill_living_ash_throne — Trono de Cinzas Vivas

## Origem
- **type**: `armor`
- **trigger**: `first_damage_each_round`
- **target**: `boss`
- **value/defaultValue**: `1`
- **category**: `habilidade_chefe`
- **usesVariable**: false
- **Handler atual**: Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.
- **usedBy**:
  - boss_azhakar (boss, field=abilities, value=1)
- **Label template**: _Trono de Cinzas Vivas (1): o primeiro dano que Azhakar sofre em cada rodada é reduzido em 1._

## Trigger decomposto
- `on`: `on_take_damage`
- `when`: {"kind":"compare","op":"eq","left":"$round.first_damage","right":true}
- `limit`: `once_per_round`

## Comportamento esperado
o primeiro dano que Azhakar sofre em cada rodada é reduzido em 1.

## ⚠️ Bug / Gap identificado
BUG: handleArmor aplica damageReduction a todos os heróis ativos. Boss não recebe a redução de dano.

## Decisão: **DSL**
add_modifier prevent_first_damage por rodada para o boss (mesmo padrão de purple_crimson_plate).

## Casos de teste
1. Reduz dano sofrido pela criatura-fonte em value pontos. (bug atual: aplica a heróis)
2. Sem state.combat: state inalterado.
