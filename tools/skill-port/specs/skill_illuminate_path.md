# skill_illuminate_path — Iluminar o Caminho

## Origem
- **type**: `dungeon`
- **trigger**: `on_reveal_paths`
- **target**: `dungeon`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Revela N cartas do topo do deck de dungeon via SKILL_CHOICE (informacional). Continuação: noop.
- **usedBy**:
  - item_pitch_torch (item, field=effect, value=1)
  - item_safe_path_charm (item, field=effect, value=null)
  - item_narrow_exit_cloak (item, field=effect, value=null)
- **Label template**: _Iluminar o Caminho: ao revelar novos caminhos, olhe as cartas de dungeon antes de escolher o caminho. Depois, descarte normalmente seguindo o curso normal de jogo._

## Trigger decomposto
- `on`: `on_reveal_paths`

## Comportamento esperado
ao revelar novos caminhos, olhe as cartas de dungeon antes de escolher o caminho. Depois, descarte normalmente seguindo o curso normal de jogo.


## Decisão: **Script**
Revela cartas do deck com SKILL_CHOICE informacional; manipulação de deck de dungeon.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
