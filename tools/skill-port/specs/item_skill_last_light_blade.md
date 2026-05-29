# item_skill_last_light_blade — Lâmina da Última Luz

## Origem
- **type**: `tohit_damage`
- **trigger**: `combat_vs_boss_or_subboss`
- **target**: `self`
- **value/defaultValue**: `"2/2"`
- **category**: `habilidade_item`
- **usesVariable**: false
- **Handler atual**: Parseia valor 'X/Y' ou número simples. Adiciona entrada em `combat.bonusNextAttack` do herói-fonte. Checa triggers compostos via `ctx.triggeredBy`.
- **usedBy**:
  - item_last_light_sword (item, field=effect, value="2/2")
- **Label template**: _Lâmina da Última Luz: receba +2 no total de bônus da rolagem. Contra chefes e subchefes, cause +2 de dano ao acertar._

## Trigger decomposto
- `on`: `combat`
- `when`: {"kind":"compare","op":"in","left":"$target.category","right":["boss","subboss"]}

## Comportamento esperado
receba +2 no total de bônus da rolagem. Contra chefes e subchefes, cause +2 de dano ao acertar.

## ⚠️ Bug / Gap identificado
BUG: trigger='combat_vs_boss_or_subboss' mas handleTohitDamage não verifica o tipo do alvo — bônus de dano é aplicado contra qualquer inimigo.

## Decisão: **DSL**
add_modifier tohit sempre + add_modifier damage com trigger.when = target is boss or subboss.

## Casos de teste
1. Bônus de acerto e dano registrado em bonusNextAttack.
