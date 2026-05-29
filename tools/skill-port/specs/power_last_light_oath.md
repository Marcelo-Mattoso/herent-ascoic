# power_last_light_oath — Juramento da Última Luz

## Origem
- **type**: `heal_or_damage_bonus`
- **trigger**: `once_per_game`
- **target**: `heroes_or_self_next_attack`
- **value/defaultValue**: `"5/5"`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Escolha via `ctx.value`: 'damage' → adiciona bonusNextAttack; default → cura todos os heróis ativos.
- **usedBy**:
  - hero_last_light_paladin (hero, field=power, value="5/5")
- **Label template**: _Juramento da Última Luz: uma vez por jogo, escolha: cure 5 de vida de todos os heróis ou cause +5 de dano sagrado no próximo ataque deste herói._

## Trigger decomposto
- `on`: `on_use`
- `limit`: `once_per_game`

## Comportamento esperado
uma vez por jogo, escolha: cure 5 de vida de todos os heróis ou cause +5 de dano sagrado no próximo ataque deste herói.


## Decisão: **DSL**
choose_one: apply_heal 5 todos os heróis OU add_modifier bonusNextAttack 5.

## Casos de teste
1. choice='damage': bônus de dano registrado em bonusNextAttack.
2. choice='heal': todos heróis recebem cura.
