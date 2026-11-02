# Sistema de expansões

Cada expansão é uma pasta com um JSON de cartas, uma ficha opcional de chefe em boss.json e as imagens WebP correspondentes. O mesmo motor de regras atende todas as expansões. Não há módulos separados.

## Criar um novo pacote

1. Crie a pasta `assets/expansions/<id>/`.
2. Crie `expansion.json` com `id`, `name`, `version`, `boss: "boss.json"` e `cards` (sem o chefe).\n3. Crie `boss.json` com `card` (ficha do boss) e `skills` (definições exclusivas).
4. Salve todas as imagens WebP diretamente em `images/`, sem subpastas por categoria.
5. Registre o ID em `assets/expansions/config.json` e marque `enabled: true`.
6. Rode `npm run build` e `npm test` antes de promover a alteração.

## Exemplo de config.json

```json
{ "version": 1, "expansions": [
  { "id": "fornalha-sombria", "enabled": true },
  { "id": "floresta", "enabled": true }
] }
```

## Exemplo de expansion.json

```json
{
  "id": "floresta",
  "name": "A Floresta",
  "version": "1.0.0",
  "cards": [
    {
      "id": "creature_forest_wolf",
      "type": "creature",
      "name": "Lobo da Floresta",
      "image": "images/LoboDaFloresta.webp",
      "diceByColor": [1, 1, 2, 2, 3],
      "life": [2, 3, 4, 5, 6],
      "hitBonus": [2, 3, 5, 7, 10],
      "damage": 2, "xp": 1, "reward": 1,
      "rewardType": "item",
      "skills": [{ "skillId": "skill_lone_beast" }]
    }
  ]
}
```

**Atributos apenas ilustrativos**, não representam balanceamento oficial. Os tipos e regras são os mesmos de `src/core/data/cardTypes.ts`.

Os IDs das cartas são globais e devem ser únicos. O campo `name` é um nome padrão; traduções existentes têm precedência. O campo `image` é opcional e precisa apontar para `images/<arquivo>.webp` no próprio pacote, sem subpastas. Opcionalmente o JSON pode trazer `skills` e `abilities` para novas definições, preservando os contratos do motor.

## Fornalha Sombria

Os 80 registros mecânicos foram migrados de `src/data/cards.yaml` para `assets/expansions/fornalha-sombria/expansion.json`, conservando os IDs, atributos e referências de habilidades. 78 imagens WebP ficam diretamente na pasta `images/` do próprio pacote. Duas salas especiais não tinham arte com nome correspondente e permanecem sem imagem específica: `subboss_room_jailer_chamber` e `subboss_room_cracked_abyss_chamber`.

Os YAMLs legados de cartas, habilidades e os catálogos de tradução permanecem no repositório para referência e compatibilidade, mas **a lista de cartas em jogo agora vem dos pacotes habilitados**. A pasta `assets/webp/cards/` continua temporariamente por causa do pipeline de otimização existente; imagens servidas ao jogador são lidas dos pacotes de expansão.

## Chefe isolado por expansão

O boss fica em `boss.json` do próprio pacote, com `card` contendo `id`, `type: "boss"`, `dice`, `lifeBase`, `hitBonusBase`, `damage`, `accessCondition`, `scaling`, `artifactBonus` e referências `skills[]`. As definições dessas habilidades são declaradas em `boss.json.skills[]`, com IDs únicos. O catálogo combinado registra o chefe sem misturar as cartas das expansões na partida. O chefe de Azhakar exige ao menos três artefatos; com `artifact_ancient_ember_heart` no grupo, sua Vida-base passa de 20 para 16, antes da escala por Despertar.
