# dungeon_skill_rekindled_forge — Forja Reacesa

## Origem
- **type**: `drawSpecificItem`
- **trigger**: `on_win_room`
- **target**: `item_deck_or_discard`
- **value/defaultValue**: `1`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - room_ruined_forge (room, field=effect, value=null)
- **Label template**: _Forja Reacesa: ao vencer esta sala, busque pelo primeiro Item [Equipável] na pilha de itens e equipe ele em um herói._

## Trigger decomposto
- `on`: `on_win_room`

## Comportamento esperado
ao vencer esta sala, busque pelo primeiro Item [Equipável] na pilha de itens e equipe ele em um herói.

## ⚠️ Bug / Gap identificado
BUG: type='drawSpecificItem' não registrado. Item nunca sacado.

## Decisão: **Script**
Busca primeiro item equipável no deck — manipulação específica de deck.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
