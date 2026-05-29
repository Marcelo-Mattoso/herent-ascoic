# skill_last_light_miracle — Milagre da Última Luz

## Origem
- **type**: `heal_or_damage_bonus`
- **trigger**: `once_per_room`
- **target**: `ally_or_next_attack`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Escolha via `ctx.value`: 'damage' → adiciona bonusNextAttack; default → cura todos os heróis ativos.
- **usedBy**:
  - (nenhum)
- **Label template**: _Milagre da Última Luz: uma vez por sala, escolha: cure 2 de vida de um aliado ou cause +2 de dano no próximo ataque contra uma criatura._

## Trigger decomposto
- `on`: `on_use`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, escolha: cure 2 de vida de um aliado ou cause +2 de dano no próximo ataque contra uma criatura.


## Decisão: **DSL**
choose_one: apply_heal 2 OU add_modifier bonusNextAttack 2.

## Casos de teste
1. choice='damage': bônus de dano registrado em bonusNextAttack.
2. choice='heal': todos heróis recebem cura.
