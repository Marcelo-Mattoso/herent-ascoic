# skill_piercing_strike — Golpe Trespassante

## Origem
- **type**: `direct_damage`
- **trigger**: `on_destroy_creature_with_attack`
- **target**: `other_creature_in_same_room`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Causa `value` de dano via applyDamage. Resolve alvos: targetEnemyIds → heroId menor vida → targetHeroIds. parseNumber falha em '2/3'.
- **usedBy**:
  - (nenhum)
- **Label template**: _Golpe Trespassante: quando destruir uma criatura com um ataque, cause 1 de dano direto a outra criatura da mesma sala._

## Trigger decomposto
- `on`: `on_destroy_creature`
- `when`: {"kind":"compare","op":"eq","left":"$kill.source","right":"attack"}

## Comportamento esperado
quando destruir uma criatura com um ataque, cause 1 de dano direto a outra criatura da mesma sala.

## ⚠️ Bug / Gap identificado
BUG: type='direct_damage' mas comportamento esperado é splash (outra criatura da mesma sala). handler direct_damage aplica dano ao alvo ctx, não a outra criatura. Deveria usar splash_damage.

## Decisão: **DSL**
apply_damage 1 a outra criatura quando destruir com ataque — splash_damage, DSL pura.

## Casos de teste
1. targetEnemyIds preenchido: inimigo sofre value de dano.
2. Sem alvo explícito: herói com menor vida sofre dano.
