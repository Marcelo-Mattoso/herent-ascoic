# skill_opportunity_shot — Tiro de Oportunidade

## Origem
- **type**: `directDamage`
- **trigger**: `once_per_combat_instead_of_attack`
- **target**: `creature`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Alias de direct_damage. Mesmo comportamento.
- **usedBy**:
  - item_rift_bow (item, field=effect, value=null)
- **Label template**: _Tiro de Oportunidade: uma vez por combate, ao invés de combater, cause o seu dano direto na criatura._

## Trigger decomposto
- `on`: `on_use`
- `limit`: `once_per_combat`

## Comportamento esperado
uma vez por combate, ao invés de combater, cause o seu dano direto na criatura.

## ⚠️ Bug / Gap identificado
BUG: 'ao invés de combater' não implementado — handler aplica dano direto mas não impede o combate normal. Herói pode fazer ambos.

## Decisão: **Script**
'ao invés de combater' requer lógica de substituição de ação de combate — fora do vocabulário DSL.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
