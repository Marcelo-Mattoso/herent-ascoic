# skill_protective_veil — Véu Protetor

## Origem
- **type**: `targetProtection`
- **trigger**: `once_per_room_on_targeted_by_effect`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Seta `combat.targetProtectionByHero[heroId] = true`. Consumido por consumeTargetProtection.
- **usedBy**:
  - item_broken_veil_cloak (item, field=effect, value=null)
  - item_last_chord_lute (item, field=effect, value=null)
- **Label template**: _Véu Protetor: uma vez por sala, ignore o primeiro efeito que escolheria este herói como alvo._

## Trigger decomposto
- `on`: `on_targeted_by_effect`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, ignore o primeiro efeito que escolheria este herói como alvo.


## Decisão: **Script**
Interceptação de targeting — requer consumir proteção no pipeline de escolha de alvo.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
