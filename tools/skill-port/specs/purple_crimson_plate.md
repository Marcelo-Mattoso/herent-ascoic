# purple_crimson_plate — Couraça Rubra

## Origem
- **type**: `armor`
- **trigger**: `first_damage_each_round`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.
- **usedBy**:
  - (nenhum)
- **Label template**: _Couraça Rubra: o primeiro dano que esta criatura sofreria em cada rodada é ignorado._

## Trigger decomposto
- `on`: `on_take_damage`
- `when`: {"kind":"compare","op":"eq","left":"$round.first_damage","right":true}
- `limit`: `once_per_round`

## Comportamento esperado
o primeiro dano que esta criatura sofreria em cada rodada é ignorado.

## ⚠️ Bug / Gap identificado
BUG: handleArmor aplica damageReduction a todos os heróis. Criatura não é protegida.

## Decisão: **DSL**
add_modifier prevent_first_damage por rodada (duration: once_per_round).

## Casos de teste
1. Reduz dano sofrido pela criatura-fonte em value pontos. (bug atual: aplica a heróis)
2. Sem state.combat: state inalterado.
