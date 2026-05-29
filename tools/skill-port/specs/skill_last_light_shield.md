# skill_last_light_shield — Escudo da Última Luz

## Origem
- **type**: `prevent_damage`
- **trigger**: `once_per_round_on_damage_taken`
- **target**: `hero`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Apenas loga. BUG: nenhuma prevenção real de dano acontece.
- **usedBy**:
  - (nenhum)
- **Label template**: _Escudo da Última Luz: uma vez por rodada, impeça todo o dano que um herói sofreria._

## Trigger decomposto
- `on`: `on_damage_taken`
- `limit`: `once_per_round`

## Comportamento esperado
uma vez por rodada, impeça todo o dano que um herói sofreria.

## ⚠️ Bug / Gap identificado
BUG: handlePreventDamage apenas loga — nenhuma prevenção real de dano ocorre.

## Decisão: **Script**
Prevenção total de dano uma vez por rodada — requer interceptação no pipeline on_take_damage; DSL precisaria de kind novo 'prevent_damage'.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
