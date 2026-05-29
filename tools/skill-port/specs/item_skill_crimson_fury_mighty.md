# item_skill_crimson_fury_mighty — Fúria Rubra e Fúria Rubra Poderosa

## Origem
- **type**: `self_damage_for_damage_until_end_of_combat`
- **trigger**: `before_attack_once_per_game`
- **target**: `self`
- **value/defaultValue**: `"2/poderosa"`
- **category**: `habilidade_item`
- **usesVariable**: true
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - artifact_first_fire_blade (artifact, field=effect, value="2/poderosa")
- **Label template**: _Fúria Rubra e Fúria Rubra Poderosa ({value}): este personagem sofre {value} de dano para causar +6 de dano. Uma vez por jogo, ao usar Fúria Rubra, o dano adicional dura até o fim do combate._

## Trigger decomposto
- `on`: `before_attack`
- `limit`: `once_per_game`

## Comportamento esperado
este personagem sofre {value} de dano para causar +6 de dano. Uma vez por jogo, ao usar Fúria Rubra, o dano adicional dura até o fim do combate.

## ⚠️ Bug / Gap identificado
BUG: type='self_damage_for_damage_until_end_of_combat' não registrado. Skill nunca funciona.

## Decisão: **Script**
Combo de skill_crimson_fury + once_per_game duration extension — reutiliza lógica de scripts individuais.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
