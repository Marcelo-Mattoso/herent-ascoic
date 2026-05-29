# skill_path_safeguard — Salvaguarda de Caminho

## Origem
- **type**: `discardDungeon_prevention`
- **trigger**: `on_dungeon_discard`
- **target**: `dungeon`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Registra disponibilidade (log). A prevenção real é verificada no momento do descarte pela lógica de dungeon.
- **usedBy**:
  - item_silent_dungeon_charm (item, field=effect, value=null)
- **Label template**: _Salvaguarda de Caminho: previna o descarte de dungeon dessa rodada._

## Trigger decomposto
- `on`: `on_dungeon_discard`

## Comportamento esperado
previna o descarte de dungeon dessa rodada.


## Decisão: **DSL**
prevent discard_from dungeon uma vez (add_modifier dungeon_discard_prevention).

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
