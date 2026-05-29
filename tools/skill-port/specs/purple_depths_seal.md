# purple_depths_seal — Selo das Profundezas

## Origem
- **type**: `powerBlock`
- **trigger**: `while_in_play`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - (nenhum)
- **Label template**: _Selo das Profundezas: enquanto esta criatura estiver em jogo, heróis não podem usar poderes uma vez por jogo._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
enquanto esta criatura estiver em jogo, heróis não podem usar poderes uma vez por jogo.

## ⚠️ Bug / Gap identificado
BUG: type='powerBlock' não registrado. Poderes once_per_game funcionam mesmo com esta criatura em jogo.

## Decisão: **DSL**
add_modifier block_action powers while_in_play.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
