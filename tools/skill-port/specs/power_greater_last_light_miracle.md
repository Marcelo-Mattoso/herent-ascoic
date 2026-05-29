# power_greater_last_light_miracle — Milagre Maior da Última Luz

## Origem
- **type**: `heal_or_survive`
- **trigger**: `once_per_game`
- **target**: `hero`
- **value/defaultValue**: `"full/1"`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Escolha via `ctx.value`: 'survive' → applySurvive (deixa com 1 vida); default → applyFullHeal.
- **usedBy**:
  - hero_eternal_rest_cleric (hero, field=power, value="full/1")
  - item_last_defense_charm (item, field=effect, value="full/1")
  - artifact_last_vigil_brazier (artifact, field=effect, value="full/1")
- **Label template**: _Milagre Maior da Última Luz: cure totalmente 1 herói ou impeça que ele seja destruído, deixando-o com 1 de vida._

## Trigger decomposto
- `on`: `on_use`
- `limit`: `once_per_game`

## Comportamento esperado
cure totalmente 1 herói ou impeça que ele seja destruído, deixando-o com 1 de vida.


## Decisão: **DSL**
choose_one: apply_full_heal OU prevent_destroy (survive).

## Casos de teste
1. choice='survive': herói fica com 1 de vida.
2. choice='full': herói curado totalmente.
