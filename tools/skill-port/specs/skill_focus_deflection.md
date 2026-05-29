# skill_focus_deflection — Desvio de Foco

## Origem
- **type**: `targetRedirect_or_tohit`
- **trigger**: `once_per_room_on_targeted`
- **target**: `another_hero_or_self`
- **value/defaultValue**: `2`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: SKILL_CHOICE: 'redirect' → troca par de combate; 'tohit' → adiciona bônus em bonusNextAttack.
- **usedBy**:
  - item_tunnel_hood (item, field=effect, value=2)
- **Label template**: _Desvio de Foco: uma vez por sala, depois que uma criatura escolher este herói como alvo, você pode trocar o alvo para outro herói voluntário. Se não houver outro herói disponível, receba +2 no total de bônus de acerto._

## Trigger decomposto
- `on`: `on_targeted`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, depois que uma criatura escolher este herói como alvo, você pode trocar o alvo para outro herói voluntário. Se não houver outro herói disponível, receba +2 no total de bônus de acerto.


## Decisão: **Script**
Redirect de alvo de combate ou +tohit — SKILL_CHOICE com estado de pairs.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
