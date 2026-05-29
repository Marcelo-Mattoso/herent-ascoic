# dungeon_skill_forge_spoils — Espólios da Fornalha

## Origem
- **type**: `drawItem`
- **trigger**: `on_win_room`
- **target**: `item_deck`
- **value/defaultValue**: `"2/1"`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: Saca N cartas do deck de itens, abre SKILL_CHOICE para escolher 1. Continuação: adiciona item às pendingRewards.
- **usedBy**:
  - room_abandoned_cell (room, field=effect, value="2/1")
- **Label template**: _Espólios da Fornalha: ao vencer esta sala, olhe as 2 cartas do topo do deck de Itens, fique com 1 e descarte a outra. Isso substitui o passo de saque e descarte de dungeon._

## Trigger decomposto
- `on`: `on_win_room`

## Comportamento esperado
ao vencer esta sala, olhe as 2 cartas do topo do deck de Itens, fique com 1 e descarte a outra. Isso substitui o passo de saque e descarte de dungeon.


## Decisão: **Script**
draw 2 / keep 1 do deck de itens com SKILL_CHOICE — mesmo padrão de skill_forge_spoils.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
