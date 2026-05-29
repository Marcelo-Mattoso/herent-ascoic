# skill_living_ember — Brasa Viva

## Origem
- **type**: `direct_damage`
- **trigger**: `on_use`
- **target**: `creature_in_play`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Causa `value` de dano via applyDamage. Resolve alvos: targetEnemyIds → heroId menor vida → targetHeroIds. parseNumber falha em '2/3'.
- **usedBy**:
  - item_living_ember_potion (item, field=effect, value=3)
- **Label template**: _Brasa Viva ({value}): cause {value} de dano direto a uma criatura em jogo._

## Trigger decomposto
- `on`: `on_use`

## Comportamento esperado
cause {value} de dano direto a uma criatura em jogo.

## ⚠️ Bug / Gap identificado
Nenhum bug (skill genérica sem condicional). A variante skill_living_ember_oil tinha bug de parseNumber('2/3')→null, corrigido no patch-10.

## Decisão: **DSL**
apply_damage simples (a variante condicional skill_living_ember_oil já é script).

## Casos de teste
1. targetEnemyIds preenchido: inimigo sofre value de dano.
2. Sem alvo explícito: herói com menor vida sofre dano.
