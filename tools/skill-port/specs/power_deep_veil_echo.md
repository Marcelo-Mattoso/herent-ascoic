# power_deep_veil_echo — Eco Profundo do Véu

## Origem
- **type**: `token`
- **trigger**: `once_per_game_on_defeat_creature`
- **target**: `self`
- **value/defaultValue**: `"1/3/2/2"`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Concede 1 Eco em `combat.ecoTokens[heroId]`. Sem implementação de gasto do Eco.
- **usedBy**:
  - hero_deep_veil_necromancer (hero, field=power, value="1/3/2/2")
- **Label template**: _Eco Profundo do Véu: uma vez por jogo, ao derrotar uma criatura, guarde 1 Eco maior. Gaste esse Eco para receber +3 no total de acerto, reduzir 2 de dano sofrido ou olhar as 2 cartas do topo do deck de inimigos._

## Trigger decomposto
- `on`: `on_defeat_creature`
- `limit`: `once_per_game`

## Comportamento esperado
uma vez por jogo, ao derrotar uma criatura, guarde 1 Eco maior. Gaste esse Eco para receber +3 no total de acerto, reduzir 2 de dano sofrido ou olhar as 2 cartas do topo do deck de inimigos.

## ⚠️ Bug / Gap identificado
BUG: handleToken concede 1 Eco mas não há implementação de gasto do Eco (3 opções da label).

## Decisão: **Script**
Sistema de tokens com 3 opções de gasto — complexidade além de choose_one simples.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
