# skill_prey_mark — Marca da Presa

## Origem
- **type**: `mark_and_tohit`
- **trigger**: `start_of_combat`
- **target**: `creature_in_room`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Define `combat.prey` (auto-seleciona se único inimigo). Com múltiplos inimigos, pede seleção do jogador.
- **usedBy**:
  - hero_broken_veil_hunter (hero, field=skill, value=1)
- **Label template**: _Marca da Presa ({value}): no início de cada combate, escolha 1 criatura da sala como Presa. Contra ela, receba +{value} no acerto._

## Trigger decomposto
- `on`: `start_of_combat`

## Comportamento esperado
no início de cada combate, escolha 1 criatura da sala como Presa. Contra ela, receba +{value} no acerto.


## Decisão: **Script**
Marcar presa requer seleção interativa e persistência em combat.prey — estado específico além de add_modifier.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
