# item_skill_drain_life_and_deadly_edge — Drenar Vida e Fio Mortal

## Origem
- **type**: `tohit_damage_heal`
- **trigger**: `combat_and_on_damage_dealt`
- **target**: `self`
- **value/defaultValue**: `"1/1"`
- **category**: `habilidade_item`
- **usesVariable**: true
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - item_deep_veil_scythe (item, field=effect, value="1/1")
- **Label template**: _Drenar Vida e Fio Mortal ({value}): receba +{value} no total da rolagem. Se vencer a rolagem por 4 ou mais, cause +{value} de dano. Cure 1 de vida deste herói apenas se ele causar dano._

## Trigger decomposto
- `on`: `combat`

## Comportamento esperado
receba +{value} no total da rolagem. Se vencer a rolagem por 4 ou mais, cause +{value} de dano. Cure 1 de vida deste herói apenas se ele causar dano.

## ⚠️ Bug / Gap identificado
BUG: type='tohit_damage_heal' não registrado. Skill inteira nunca funciona.

## Decisão: **Script**
Combo de duas skills com lógicas assimétricas — melhor decompor em DSL quando vocabulário cobrir ambas.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
