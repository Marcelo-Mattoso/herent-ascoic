# skill_forge_smoke — Fumaça da Fornalha

## Origem
- **type**: `healBlock`
- **trigger**: `first_round_in_room`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Alias de heal_block.
- **usedBy**:
  - (nenhum)
- **Label template**: _Fumaça da Fornalha: na primeira rodada desta sala, os heróis não podem usar efeitos de cura._

## Trigger decomposto
- `on`: `on_round_start`
- `when`: {"kind":"compare","op":"eq","left":"$room.round_count","right":1}

## Comportamento esperado
na primeira rodada desta sala, os heróis não podem usar efeitos de cura.

## ⚠️ Bug / Gap identificado
RISCO: handleHealBlock usa ctx.targetHeroIds para escolher alvos. Skill de sala passiva pode não ter targetHeroIds populado.

## Decisão: **DSL**
add_modifier heal_block para todos os heróis na primeira rodada.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
