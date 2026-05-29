# skill_rift_rune — Runa das Fendas

## Origem
- **type**: `dice_modification`
- **trigger**: `after_roll`
- **target**: `ally_die`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Apenas loga que a habilidade está disponível. A efetivação ocorre quando o jogador age via USE_SKILL — handler aqui é informacional.
- **usedBy**:
  - hero_crimson_rune_mage (hero, field=skill, value=1)
- **Label template**: _Runa das Fendas ({value}): depois de rolar, altere o resultado de 1 dado aliado em até {value}, sem passar de 6 nem ficar abaixo de 1._

## Trigger decomposto
- `on`: `after_roll`

## Comportamento esperado
depois de rolar, altere o resultado de 1 dado aliado em até {value}, sem passar de 6 nem ficar abaixo de 1.


## Decisão: **Script**
Interativo (pendingDiceSelection); jogador escolhe dado — requer fluxo de pausa/continuação específico.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
