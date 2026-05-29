# skill_living_ember_oil — Brasa Viva (Condicional)

## Origem
- **type**: `script`
- **trigger**: `on_use`
- **target**: `creature_in_play`
- **value/defaultValue**: `"item_incendiary_oil_flask.livingEmber"`
- **category**: `habilidade_item`
- **usesVariable**: false
- **Handler atual**: Delega para getScript(value).run(buildScriptCtx(state, ctx)).
- **usedBy**:
  - item_incendiary_oil_flask (item, field=effect, value="item_incendiary_oil_flask.livingEmber")
- **Label template**: _Brasa Viva (2/3): cause 2 de dano direto a uma criatura em jogo. Se a criatura tiver Corpo Gelatinoso, cause 3 de dano em vez de 2._

## Trigger decomposto
- `on`: `on_use`

## Comportamento esperado
cause 2 de dano direto a uma criatura em jogo. Se a criatura tiver Corpo Gelatinoso, cause 3 de dano em vez de 2.


## Decisão: **Script**
Já migrada no patch-10. Condicional baseada em skill do alvo.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
