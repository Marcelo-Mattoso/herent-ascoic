# skill_treacherous_attack — Ataque Traiçoeiro

## Origem
- **type**: `direct_damage`
- **trigger**: `on_enter_combat`
- **target**: `lowest_life_hero`
- **value/defaultValue**: `1`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Causa `value` de dano via applyDamage. Resolve alvos: targetEnemyIds → heroId menor vida → targetHeroIds. parseNumber falha em '2/3'.
- **usedBy**:
  - creature_ancient_pillar_spider (creature, field=effect, value=2)
  - creature_low_fire_salamander (creature, field=effect, value=1)
- **Label template**: _Ataque Traiçoeiro ({value}): ao entrar em combate, causa {value} dano ao herói com menos vida._

## Trigger decomposto
- `on`: `on_enter_combat`

## Comportamento esperado
ao entrar em combate, causa {value} dano ao herói com menos vida.


## Decisão: **DSL**
apply_damage ao herói com menos vida no on_enter_combat.

## Casos de teste
1. targetEnemyIds preenchido: inimigo sofre value de dano.
2. Sem alvo explícito: herói com menor vida sofre dano.
