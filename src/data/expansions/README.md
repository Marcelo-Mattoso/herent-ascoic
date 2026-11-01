# Adicionar uma expansão

1. Crie `src/data/expansions/<id>/cards.json`. O `<id>` deve ser simples, em letras minúsculas e hífens.
2. Coloque as imagens WebP em `assets/webp/cards/<id>/`, cada uma com o nome `<id-da-carta>.webp`.
3. Adicione `{ id: "<id>", name: "Nome da Expansão", enabled: true }` a `src/config/expansions.ts`. Para jogar só com a expansão nova, desabilite `fornalha-sombria` no mesmo arquivo.

O JSON contém **somente cartas**. `name` e outros textos de exibição ficam na própria entrada, junto com as estatísticas. O carregador os separa dos dados mecânicos. Textos de novas cartas usam esse valor em todos os idiomas até existir uma tradução no catálogo geral. IDs de cartas precisam ser únicos entre as expansões habilitadas.

```json
{
  "cards": [
    {
      "id": "hero_example_guardian",
      "type": "hero",
      "name": "Guardião de Exemplo",
      "diceByColor": [1, 1, 2, 2, 3],
      "life": [9, 11, 13, 15, 17],
      "hitBonus": [4, 5, 7, 10, 14],
      "damage": 2,
      "skills": [{ "skillId": "skill_bastion_guard", "params": { "value": 3 } }]
    },
    {
      "id": "room_example_hall",
      "type": "room",
      "name": "Salão de Exemplo",
      "exits": 2,
      "enemiesByPlayers": [1, 2, 3, 4],
      "reward": 1,
      "rewardType": "item",
      "skills": []
    }
  ]
}
```

Use os campos de estatísticas de cada `type` documentados em [`../README.md`](../README.md). Toda carta precisa de `skills`, mesmo quando vazia. `skillId` deve apontar para uma habilidade já existente em `src/data/skills.yaml`. Cartas que usam o formato `grants` podem referenciar `abilityId` de `src/data/abilities.yaml`; o comportamento continua no catálogo global. O JSON da expansão não aceita definições de habilidade.

Cada expansão independente precisa oferecer cartas suficientes para jogar, incluindo pelo menos um herói, sala, criatura, item e chefe. Se várias expansões estiverem habilitadas, os seus baralhos são combinados e o primeiro chefe habilitado será usado.

Para um chefe, inclua `lifeBase`, `hitBonusBase`, `damage`, `diceCount` e `accessCondition`. Os campos opcionais `awakeningLifePerLevel`, `awakeningHitBonusPerLevel` e `artifactLifeRule` controlam os ajustes de vida e acerto. Exemplo de condição: `"accessCondition": { "type": "group_artifacts_gte", "value": 2 }`. Para liberar o chefe sem requisito, use `{ "type": "always" }`. Efeitos especiais do chefe são referências em `skills` ao catálogo global.
