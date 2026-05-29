# dungeon_skill_summon_guardian — Invocar Guardião

## Origem
- **type**: `roomSpecial`
- **trigger**: `on_room_reveal`
- **target**: `special_creature`
- **value/defaultValue**: `null`
- **category**: `habilidade_dungeon`
- **usesVariable**: true
- **Handler atual**: NÃO REGISTRADO (intencional — spawn tratado via handleSpawnEnemies).
- **usedBy**:
  - room_jailer_room (room, field=effect, value="Carcereiro da Masmorra Rubra")
  - room_cracked_abyss (room, field=effect, value="Guardião do Abismo Rachado")
- **Label template**: _Invocar Guardião ({value}): revele o {value} junto com os inimigos da sala. Enquanto ele estiver em jogo, o grupo não pode impedir descarte de dungeon por efeitos de herói ou item. Caso o {value} seja derrotado, remova esta carta do jogo._

## Trigger decomposto
- `on`: `on_room_reveal`

## Comportamento esperado
revele o {value} junto com os inimigos da sala. Enquanto ele estiver em jogo, o grupo não pode impedir descarte de dungeon por efeitos de herói ou item. Caso o {value} seja derrotado, remova esta carta do jogo.

## ⚠️ Bug / Gap identificado
NÃO IMPLEMENTADO: type='roomSpecial'. Spawn tratado implicitamente por handleSpawnEnemies, sem lógica do guardião especial.

## Decisão: **Script**
Spawn de criatura especial junto com sala — lógica de reveal de inimigo.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
