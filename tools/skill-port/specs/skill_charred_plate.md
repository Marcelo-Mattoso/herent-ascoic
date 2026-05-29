# skill_charred_plate — Couraça Carbonizada

## Origem
- **type**: `armor`
- **trigger**: `on_take_attack_damage`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Aplica `value` de damageReduction a todos os heróis ativos em `state.combat.damageReduction`. BUG: sempre afeta heróis, nunca a criatura-fonte.
- **usedBy**:
  - creature_broken_gates_watcher (creature, field=effect, value=1)
  - creature_hot_ash_worm (creature, field=effect, value=1)
  - creature_dead_torch_sentinel (creature, field=effect, value=1)
- **Label template**: _Couraça Carbonizada ({value}): esta criatura reduz em {value} o dano sofrido por ataques._

## Trigger decomposto
- `on`: `on_take_damage`
- `when`: {"kind":"compare","op":"eq","left":"$damage.source","right":"attack"}

## Comportamento esperado
esta criatura reduz em {value} o dano sofrido por ataques.

## ⚠️ Bug / Gap identificado
BUG: handleArmor aplica damageReduction a TODOS os heróis ativos, não à criatura-fonte. Criatura não recebe redução.

## Decisão: **DSL**
add_modifier damage_reduction on_take_attack_damage (self/creature).

## Casos de teste
1. Reduz dano sofrido pelo portador em value pontos.
2. Sem state.combat: state inalterado.
