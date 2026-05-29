# power_mighty_crimson_fury — Fúria Rubra Poderosa

## Origem
- **type**: `damage_bonus_duration`
- **trigger**: `once_per_game_on_use_furia_rubra`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Adiciona `temporaryEffects` com id 'furia-rubra-duracao'. BUG: `damage_bonus` handler não checa essa flag — duração extra não funciona.
- **usedBy**:
  - hero_crimson_barbarian (hero, field=power, value=null)
- **Label template**: _Fúria Rubra Poderosa: ao usar Fúria Rubra, o dano adicional dura até o fim do combate._

## Trigger decomposto
- `on`: `on_use_skill:skill_crimson_fury`
- `limit`: `once_per_game`

## Comportamento esperado
ao usar Fúria Rubra, o dano adicional dura até o fim do combate.

## ⚠️ Bug / Gap identificado
BUG: handler adiciona temporaryEffects com id 'furia-rubra-duracao' mas damage_bonus handler não consulta essa flag. Duração até fim do combate nunca funciona.

## Decisão: **Script**
Reage ao uso de outra skill (skill_crimson_fury) e muda sua duração — estado de skill-watching sem paralelo em DSL.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
