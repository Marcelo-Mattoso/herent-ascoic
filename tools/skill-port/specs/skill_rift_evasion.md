# skill_rift_evasion — Evasão das Fendas

## Origem
- **type**: `itemControl`
- **trigger**: `first_item_effect_received`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Seta `combat.itemControlByEnemy[enemyId] = true` (bloqueia próximo item). Usa oncePer.combat.
- **usedBy**:
  - creature_black_ceiling_bat (creature, field=effect, value=null)
  - creature_blazing_skull (creature, field=effect, value=null)
- **Label template**: _Evasão das Fendas: esta criatura ignora o primeiro efeito de item usado contra ela._

## Trigger decomposto
- `on`: `on_item_used_against`
- `limit`: `once_per_combat`

## Comportamento esperado
esta criatura ignora o primeiro efeito de item usado contra ela.


## Decisão: **Script**
Bloqueia primeiro efeito de item — requer interceptação no pipeline de uso de item.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
