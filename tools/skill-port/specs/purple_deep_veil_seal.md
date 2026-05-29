# purple_deep_veil_seal — Selo do Véu Profundo

## Origem
- **type**: `dungeonLock`
- **trigger**: `while_in_play`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - creature_old_chains_knight (creature, field=purpleEffect, value=null)
- **Label template**: _Selo do Véu Profundo: enquanto estiver em jogo, heróis não podem reduzir o nível da masmorra._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
enquanto estiver em jogo, heróis não podem reduzir o nível da masmorra.

## ⚠️ Bug / Gap identificado
BUG: type='dungeonLock' não registrado. Heróis podem reduzir nível da masmorra normalmente.

## Decisão: **DSL**
add_modifier block_action dungeon_level_reduction while_in_play.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
