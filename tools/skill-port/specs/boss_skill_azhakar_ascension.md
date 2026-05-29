# boss_skill_azhakar_ascension — Ascensão de Azhakar

## Origem
- **type**: `tohit`
- **trigger**: `when_half_life_or_less`
- **target**: `boss`
- **value/defaultValue**: `2`
- **category**: `habilidade_chefe`
- **usesVariable**: false
- **Handler atual**: Handler vazio — devolve state inalterado. Bônus passivo coletado por `collectHeroBonuses` em outra parte da engine.
- **usedBy**:
  - boss_azhakar (boss, field=abilities, value=2)
- **Label template**: _Ascensão de Azhakar (2): quando Azhakar chegar à metade da vida ou menos, recebe +2 no Bônus de Acerto._

## Trigger decomposto
- `on`: `passive`
- `when`: {"kind":"compare","op":"lte","left":"$self.currentLife","right":{"op":"div","args":["$self.maxLife",2]}}

## Comportamento esperado
quando Azhakar chegar à metade da vida ou menos, recebe +2 no Bônus de Acerto.


## Decisão: **DSL**
add_modifier tohit +2 com trigger.when = self.currentLife <= self.maxLife/2.

## Casos de teste
1. Bônus passivo coletado em collectHeroBonuses: +value no total de acerto.
