# Sistema de expansões

O runtime combina cartas e habilidades **somente dos pacotes habilitados** em `assets/expansions/config.json`, usando `src/core/data/expansions.ts`. Os dados são compartilhados pelo mesmo motor; cada pacote define suas próprias cartas e, quando houver, a ficha de seu chefe em `boss.json`. Os arquivos legados de catálogo continuam no repositório para referência, mas não são a fonte principal das cartas em jogo.

## Pacotes habilitados em `dev` (23/11/2026)

| ID do pacote | Conteúdo | Configuração |
| --- | --- | --- |
| `fornalha-sombria` | A Fornalha Sombria, com Azhakar | `enabled: true` |
| `torre-grande-bruxa-caldeirao` | Torre da Grande Bruxa | `enabled: true` |
| `castelo-horizonte-infindo` | Castelo do Horizonte Infindo | `enabled: true` |

A configuração do repositório, e não esta tabela, determina o que o jogo carrega após futuras mudanças.

## Criar ou revisar um pacote

1. Crie `assets/expansions/<id>/expansion.json`, usando um ID global único no formato `a-z0-9` com hífens.
2. Declare `id`, `name`, `version`, `cards` e, caso tenha chefe, `boss: "boss.json"`. `openings`, `skills`, `skillLocales` e `abilities` são opcionais conforme o contrato `ExpansionPackage`.
3. Crie `boss.json` quando `boss` for declarado. O documento precisa trazer `card` com `type: "boss"` e pode trazer `skills`, `skillLocales` e `locale`. **Não** duplique a carta do chefe dentro de `expansion.json.cards`.
4. Todas as cartas precisam de `id`, `type`, `name` e `skills` (mesmo que seja lista vazia), além de campos obrigatórios de seu tipo. As habilidades podem utilizar referências legadas `skills[]` e/ou grants declarativos `grants[]`. Preserve IDs estáveis.
5. Imagens referenciadas por carta seguem `images/<arquivo>.webp` ou `images/<arquivo>.png`, sem subpastas, conforme a validação do runtime. Prefira WebP para assets finais; os mestres PNG são mantidos em `dev` conforme [fluxo de promoção](PROMOTION_FLOW.md).
6. Garanta uma **sala inicial válida**: sala comum com `xp: 0`, até um inimigo para um herói e sem `specialCreatureId`. A validação do pacote reprova expansões sem essa condição.
7. Registre o pacote em `assets/expansions/config.json` e habilite-o conscientemente.
8. Ao atualizar cartas, habilidades ou versões, considere que o Desbravador **invalida conhecimento aprendido de catálogo antigo** até uma revalidação. Não reaproveite índices de aprendizado cegamente.
9. Execute localmente, quando for validar: `npm run typecheck:tools`, `npm test`, `npm run build`, `npm run bot:skills-audit`. A auditoria completa `npm run audit` é longa e deve ficar fora do CI.

## Exemplo de `config.json`

```json
{
  "version": 1,
  "expansions": [
    { "id": "fornalha-sombria", "enabled": true },
    { "id": "torre-grande-bruxa-caldeirao", "enabled": true },
    { "id": "castelo-horizonte-infindo", "enabled": true }
  ]
}
```

## Exemplo mínimo de `expansion.json`

```json
{
  "id": "pacote-exemplo",
  "name": "Pacote de Exemplo",
  "version": "1.0.0",
  "boss": "boss.json",
  "cards": [
    {
      "id": "room_example_safe_entry",
      "type": "room",
      "name": "Entrada Segura",
      "exits": 2,
      "enemiesByPlayers": [1, 2, 3, 4],
      "reward": 1,
      "rewardType": "item",
      "xp": 0,
      "skills": []
    }
  ]
}
```

O exemplo é **estrutural**, não é uma expansão completa ou balanceada. Para uma ficha de chefe real, consulte `assets/expansions/fornalha-sombria/boss.json`; para as variantes de carta, `src/core/data/cardTypes.ts`.

## Fornalha Sombria e contrato do chefe

`assets/expansions/fornalha-sombria/expansion.json` define as cartas do pacote e referencia `boss.json`. O Azhakar exige ao menos **três artefatos** via `accessCondition`; `artifact_ancient_ember_heart` modifica sua vida-base de 20 para 16 antes do escalonamento por Despertar. Esses valores são características **desse chefe**, não regras universais para outros chefes.

O chefe e os demais objetos da expansão ficam identificados por pacote; ao selecionar um chefe, o motor pode montar os decks correspondentes, sem misturar automaticamente cartas de todas as expansões. Qualquer proposta de modo aleatório misto ou de campanha deve ser documentada e implementada separadamente, sem presumir que já esteja ativada.
