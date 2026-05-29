# skill_rekindled_forge — Forja Reacesa

## Origem
- **type**: `recover_item`
- **trigger**: `on_win_room`
- **target**: `group`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Skill nunca executa.
- **usedBy**:
  - (nenhum)
- **Label template**: _Forja Reacesa: ao vencer esta sala, o grupo pode recuperar 1 item descartado e equipá-lo imediatamente em um herói._

## Trigger decomposto
- `on`: `on_win_room`

## Comportamento esperado
ao vencer esta sala, o grupo pode recuperar 1 item descartado e equipá-lo imediatamente em um herói.

## ⚠️ Bug / Gap identificado
BUG: type='recover_item' não registrado. Habilidade nunca executa.

## Decisão: **Script**
Recuperação de item descartado com equip imediato — manipulação de deck + state de item complexa.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
