# power_supreme_rift_rune — Runa Suprema das Fendas

## Origem
- **type**: `diceFix`
- **trigger**: `once_per_game_after_any_roll`
- **target**: `ally_or_enemy_die`
- **value/defaultValue**: `"6/1"`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Configura `combat.pendingDiceSelection` com `action: 'set_to'`, `setToValue: 6`. Interativo — jogador escolhe dado.
- **usedBy**:
  - hero_crimson_rune_mage (hero, field=power, value="6/1")
  - artifact_lost_forge_hammer (artifact, field=effect, value="6/1")
- **Label template**: _Runa Suprema das Fendas: depois de qualquer rolagem, transforme 1 dado aliado em 6 ou 1 dado inimigo em 1._

## Trigger decomposto
- `on`: `after_roll`
- `limit`: `once_per_game`

## Comportamento esperado
depois de qualquer rolagem, transforme 1 dado aliado em 6 ou 1 dado inimigo em 1.


## Decisão: **Script**
choose_one com dois alvos distintos (dado aliado → 6 OU dado inimigo → 1) — pendingDiceSelection com duas opções assimétricas.

## Casos de teste
1. combat.pendingDiceSelection configurado com action='set_to', setToValue=6.
