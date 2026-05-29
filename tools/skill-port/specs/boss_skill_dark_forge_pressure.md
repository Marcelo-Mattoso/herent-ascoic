# boss_skill_dark_forge_pressure — Pressão da Fornalha Sombria

## Origem
- **type**: `discardDungeon`
- **trigger**: `after_each_combat_round_if_purple`
- **target**: `dungeon`
- **value/defaultValue**: `1`
- **category**: `habilidade_chefe`
- **usesVariable**: false
- **Handler atual**: Descarta N cartas do deck de dungeon via discardFromDungeonDeck.
- **usedBy**:
  - boss_azhakar (boss, field=abilities, value=1)
- **Label template**: _Pressão da Fornalha Sombria (1): após cada rodada de combate, se o Despertar da Masmorra estiver em nível Roxo, descarte a carta do topo do deck de dungeon._

## Trigger decomposto
- `on`: `after_combat_round`
- `when`: {"kind":"compare","op":"gte","left":"$dungeon.level","right":4}

## Comportamento esperado
após cada rodada de combate, se o Despertar da Masmorra estiver em nível Roxo, descarte a carta do topo do deck de dungeon.


## Decisão: **DSL**
discard_from dungeon 1 after_combat_round com trigger.when = dungeon purple.

## Casos de teste
1. Deck com cartas: N cartas descartadas da pilha.
2. Deck vazio: state inalterado.
