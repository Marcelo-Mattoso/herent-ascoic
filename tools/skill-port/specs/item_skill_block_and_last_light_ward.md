# item_skill_block_and_last_light_ward — Bloqueio e Resguardo da Última Luz

## Origem
- **type**: `armor_purple_damage_reduction`
- **trigger**: `on_take_damage`
- **target**: `self`
- **value/defaultValue**: `"3/2"`
- **category**: `habilidade_item`
- **usesVariable**: true
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - item_forge_magic_armor (item, field=effect, value="3/2")
- **Label template**: _Bloqueio e Resguardo da Última Luz ({value}): reduza em {value} o dano sofrido por este herói. Contra efeitos Roxos, reduza 2 de dano adicional._

## Trigger decomposto
- `on`: `on_take_damage`

## Comportamento esperado
reduza em {value} o dano sofrido por este herói. Contra efeitos Roxos, reduza 2 de dano adicional.

## ⚠️ Bug / Gap identificado
BUG: type='armor_purple_damage_reduction' não registrado. Skill nunca funciona.

## Decisão: **DSL**
Dois add_modifier independentes: damage_reduction + purple_damage_reduction.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
