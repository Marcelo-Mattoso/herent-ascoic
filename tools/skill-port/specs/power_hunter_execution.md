# power_hunter_execution — Execução do Caçador

## Origem
- **type**: `diceFix_damage`
- **trigger**: `once_per_game_after_roll_vs_prey`
- **target**: `blue_die_and_self`
- **value/defaultValue**: `"6/1"`
- **category**: `poder_heroi`
- **usesVariable**: false
- **Handler atual**: Verifica se alvo atual é a presa. Adiciona +1 em bonusNextAttack. BUG: não fixa o dado em 6 — só adiciona bônus de dano.
- **usedBy**:
  - hero_broken_veil_hunter (hero, field=power, value="6/1")
- **Label template**: _Execução do Caçador: uma vez por jogo, depois de rolar contra sua Presa, transforme 1 dado azul em 6 e cause +1 de dano se acertar._

## Trigger decomposto
- `on`: `after_roll`
- `when`: target_is_prey
- `limit`: `once_per_game`

## Comportamento esperado
uma vez por jogo, depois de rolar contra sua Presa, transforme 1 dado azul em 6 e cause +1 de dano se acertar.

## ⚠️ Bug / Gap identificado
BUG: handler adiciona +1 em bonusNextAttack mas não transforma dado azul em 6. Metade do efeito está faltando.

## Decisão: **Script**
Condição de presa + fix dado azul + bônus de dano condicional — lógica em voo sobre o estado de rolagem.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
