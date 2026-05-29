# dungeon_skill_dead_torches — Tochas Mortas

## Origem
- **type**: `item_or_tohit_penalty`
- **trigger**: `before_first_combat_in_room`
- **target**: `heroes`
- **value/defaultValue**: `"-1/1"`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - room_dead_torches_passage (room, field=effect, value="-1/1")
- **Label template**: _Tochas Mortas: antes do primeiro combate nesta sala, os heróis devem escolher: descartar 1 item ou sofrer -1 no total da rolagem de acerto de cada herói nesta sala. Se o grupo usar Tocha de Breu, ignore este efeito._

## Trigger decomposto
- `on`: `before_combat`
- `limit`: `once_per_room`

## Comportamento esperado
antes do primeiro combate nesta sala, os heróis devem escolher: descartar 1 item ou sofrer -1 no total da rolagem de acerto de cada herói nesta sala. Se o grupo usar Tocha de Breu, ignore este efeito.

## ⚠️ Bug / Gap identificado
BUG: type='item_or_tohit_penalty' não registrado. Penalidade nunca aplicada.

## Decisão: **Script**
choose_one com condição especial 'ignorar se Tocha de Breu'; verifica estado de item no grupo.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
