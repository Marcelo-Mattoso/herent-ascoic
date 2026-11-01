# Sistema de expansões

Cada expansão é uma pasta com um JSON de cartas e as imagens WebP correspondentes. O mesmo motor de regras atende todas as expansões. Não há módulos separados.

## Criar um novo pacote

1. Crie a pasta `assets/expansions/<id>/`.
2. Crie `expansion.json` com `id`, `name`, `version` e `cards`.
3. Salve as imagens nas subpastas de `images/` (heróis, criaturas, salas, itens, artefatos etc.).
4. Registre o ID em `assets/expansions/config.json` e marque `enabled: true`.
5. Rode `npm run build` e `npm test` antes de promover a alteração.

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
      "image": "images/creatures/LoboDaFloresta.webp",
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

Os IDs das cartas são globais e devem ser únicos. O campo `name` é um nome padrão; traduções existentes têm precedência. O campo `image` é opcional e precisa ser um caminho WebP dentro de `images/` no próprio pacote. Opcionalmente o JSON pode trazer `skills` e `abilities` para novas definições, preservando os contratos do motor.

## Fornalha Sombria

Os 80 registros mecânicos foram migrados de `src/data/cards.yaml` para `assets/expansions/fornalha-sombria/expansion.json`, conservando os IDs, atributos e referências de habilidades. 78 imagens WebP foram copiadas em subpastas do próprio pacote. Duas salas especiais não tinham arte com nome correspondente e permanecem sem imagem específica: `subboss_room_jailer_chamber` e `subboss_room_cracked_abyss_chamber`.

Os YAMLs legados de cartas, habilidades e os catálogos de tradução permanecem no repositório para referência e compatibilidade, mas **a lista de cartas em jogo agora vem dos pacotes habilitados**. A pasta `assets/webp/cards/` continua temporariamente por causa do pipeline de otimização existente; imagens servidas ao jogador são lidas dos pacotes de expansão.
