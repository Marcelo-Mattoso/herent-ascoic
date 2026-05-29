# item_skill_mystic_draw — Saque Místico

## Origem
- **type**: `drawArtifact`
- **trigger**: `on_use`
- **target**: `artifact_deck`
- **value/defaultValue**: `1`
- **category**: `habilidade_item`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - item_ancient_iron_key (item, field=effect, value=1)
  - item_torn_depths_map (item, field=effect, value=1)
  - item_hidden_forge_chest (item, field=effect, value=1)
- **Label template**: _Saque Místico: saque 1 carta de Artefato da pilha de artefatos._

## Trigger decomposto
- `on`: `on_use`

## Comportamento esperado
saque 1 carta de Artefato da pilha de artefatos.

## ⚠️ Bug / Gap identificado
BUG: type='drawArtifact' não registrado. Artefato nunca sacado.

## Decisão: **Script**
Saque de carta de Artefato — manipulação de deck específico.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
