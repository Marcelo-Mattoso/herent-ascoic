# purple_healing_rupture — Ruptura da Cura

## Origem
- **type**: `healBlock`
- **trigger**: `on_enter_room`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Alias de heal_block.
- **usedBy**:
  - creature_black_ceiling_bat (creature, field=purpleEffect, value=null)
- **Label template**: _Ruptura da Cura: ao entrar nesta sala, anule o próximo efeito de cura usado pelos heróis._

## Trigger decomposto
- `on`: `on_enter_room`

## Comportamento esperado
ao entrar nesta sala, anule o próximo efeito de cura usado pelos heróis.

## ⚠️ Bug / Gap identificado
RISCO: mesmo problema de skill_forge_smoke — targetHeroIds pode estar vazio.

## Decisão: **DSL**
add_modifier heal_block (next heal only) on_enter_room.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
