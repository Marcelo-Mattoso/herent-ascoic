# power_restored_path — Caminho Restaurado

## Origem
- **type**: `recoverDungeon`
- **trigger**: `once_per_game`
- **target**: `dungeon`
- **value/defaultValue**: `1`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Recupera `count` cartas do descarte de dungeon embaralhando no deck. Se skill_id='skill_return_rite', cobra 3 de vida.
- **usedBy**:
  - hero_rift_rogue (hero, field=power, value=1)
  - item_return_potion (item, field=effect, value=1)
- **Label template**: _Caminho Restaurado: recupere 1 carta da pilha de descarte da dungeon e embaralhe no deck da dungeon._

## Trigger decomposto
- `on`: `on_use`
- `limit`: `once_per_game`

## Comportamento esperado
recupere 1 carta da pilha de descarte da dungeon e embaralhe no deck da dungeon.


## Decisão: **DSL**
move_card dungeon discard → deck (recover_dungeon).

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
