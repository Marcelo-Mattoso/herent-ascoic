# skill_last_light_ward — Resguardo da Última Luz

## Origem
- **type**: `purple_damage_reduction`
- **trigger**: `on_purple_effect_damage_taken`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Armazena redução em `state.flags['purpleDmgReduction::heroId']` com cast questionável para boolean.
- **usedBy**:
  - (nenhum)
- **Label template**: _Resguardo da Última Luz ({value}): contra efeitos Roxos, reduza {value} o dano recebido._

## Trigger decomposto
- `on`: `on_take_damage`
- `when`: {"kind":"compare","op":"eq","left":"$damage.type","right":"purple"}

## Comportamento esperado
contra efeitos Roxos, reduza {value} o dano recebido.

## ⚠️ Bug / Gap identificado
BUG: handlePurpleDamageReduction armazena valor em flags com cast para boolean. Código consumidor pode não ler corretamente. Trigger 'on_purple_effect_damage_taken' pode não estar wired.

## Decisão: **DSL**
add_modifier purple_damage_reduction com trigger.when = on_take_damage purple.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
