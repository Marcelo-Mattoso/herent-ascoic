# skill_forge_spoils — Espólios da Fornalha

## Origem
- **type**: `drawItem`
- **trigger**: `on_win_room`
- **target**: `item_deck`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Saca N cartas do deck de itens, abre SKILL_CHOICE para escolher 1. Continuação: adiciona item às pendingRewards.
- **usedBy**:
  - (nenhum)
- **Label template**: _Espólios da Fornalha: ao vencer esta sala, olhe as 2 cartas do topo do deck de Itens, fique com 1 e descarte a outra; isso substitui o passo de saque e descarte de dungeon._

## Trigger decomposto
- `on`: `on_win_room`

## Comportamento esperado
ao vencer esta sala, olhe as 2 cartas do topo do deck de Itens, fique com 1 e descarte a outra; isso substitui o passo de saque e descarte de dungeon.


## Decisão: **Script**
draw N / keep 1 com SKILL_CHOICE e manipulação do deck de itens.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
