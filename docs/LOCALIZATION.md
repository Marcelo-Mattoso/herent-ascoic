# Localização da Alpha Web

O português brasileiro é a referência oficial. Os idiomas ficam em `locales/<código BCP 47>/` e usam os namespaces `common`, `game`, `cards`, `skills`, `tutorials` e `journal`. `meta.json` informa código, nomes, direção (`ltr` ou `rtl`), versão do contrato (`1`) e estado (`draft`, `review` ou `published`). Apenas idiomas publicados e aprovados entram no build público e no seletor. O Vite descobre as pastas no build; o navegador carrega os JSONs de outro idioma sob demanda, com fallback para `pt-BR`.

## Contribuir

1. Crie um fork ou branch e execute `npm ci`.
2. Execute `npm run i18n:new -- --locale fr-FR --name "Français (France)"`, substituindo código e nome. O comando cria as mesmas chaves do português com valores vazios e estado `draft`.
3. Traduza os valores dos seis arquivos JSON. Preserve as chaves, os IDs de cartas e habilidades e os parâmetros como `{{hero}}` e `{{count}}`. Não altere regras, fórmulas, gatilhos, operadores nem o código da aplicação. Escreva frases completas para preservar a gramática do idioma; as variantes de plural seguem os sufixos do i18next (`_one`, `_other` e as categorias exigidas por `Intl.PluralRules`).
4. Execute `npm run i18n:validate` e `npm run i18n:report`. Textos vazios ou copiados literalmente do português são pendentes. Um texto que deve permanecer idêntico, como um nome próprio, precisa de justificativa em `meta.json`, na propriedade `retained`, por exemplo `"cards:card_id.name": "Nome canônico da personagem"`.
5. Abra um Pull Request com o idioma em `draft` ou `review`, explique o escopo e peça revisão ao mantenedor. Depois da revisão linguística e da cobertura completa, o mantenedor altera `status` para `published` e integra o PR. O deploy do `main` gera o catálogo automaticamente. A propriedade `published` controla a disponibilidade do artefato, mas não concede permissão para integrar ou publicar código. Recomenda-se exigir aprovação do mantenedor em ruleset de `main`.

Não há upload público nem backend de tradução. A validação de CI reprova JSON inválido, metadados inconsistentes, chaves extras, parâmetros incompatíveis e idioma publicado incompleto. `draft` e `review` podem ter pendências, que aparecem no relatório. A mudança de idioma é salva no navegador; uma preferência inválida usa o idioma do navegador publicado ou português. O jogo, o tutorial e a música permanecem montados durante a troca.

## Referência editorial

As descrições oficiais portuguesas de cartas e habilidades continuam em `src/data/cards.locale.pt-BR.yaml` e `src/data/skills.locale.pt-BR.yaml`. Os quatro roteiros do Arquivista continuam em `src/ui/tutorials/registry.ts`. Após editar essas fontes, execute `npm run i18n:sync` e inclua o JSON português gerado no mesmo PR. O CI executa o sincronismo em modo de verificação e rejeita divergências. As traduções humanas de outras pastas nunca são sobrescritas pelo sincronismo.

Os textos de interface portugueses são editados diretamente nos arquivos de `locales/pt-BR/`. Novas chaves devem receber um nome estável e valor português; todos os idiomas publicados precisam acompanhar o contrato. Os identificadores técnicos do motor são invariáveis em todos os idiomas.

## Terminologia

Use o português de referência para entender o efeito de cada termo. Nomes próprios da lore, nomes de personagens e localidades requerem decisão editorial antes da tradução; registre a preservação literal em `retained` quando necessário. Termos de regra podem ser traduzidos, mas o mesmo termo deve manter o mesmo sentido em cartas, habilidades, tutorial e Diário. `Despertar`, `Ímpeto` e nomes de estados devem seguir um glossário aprovado pelo mantenedor antes da publicação. Não crie equivalentes oficiais por suposição.

## Limites atuais da camada de apresentação

Os IDs, ações e snapshots estruturados do Diário não mudam. Algumas entradas históricas ainda guardam resumos e mensagens em português gerados pelo motor; esses textos precisam de uma futura representação por tipo de evento e parâmetros para serem reformatados integralmente após a troca de idioma. O log de eventos também classifica mensagens portuguesas por palavras, o que precisa migrar para categorias estruturadas. A arte `imagedata/ui/logo-completa.png` contém “ASCENSÃO HERÓICA” e “CARD GAME” incorporados à imagem; `imagedata/ui/newlogo.png` é a variante sem letras. A carta `imagedata/cards/AbismoRachado.png` foi inspecionada como amostra e não contém texto. Uma tradução completa precisa rever as demais artes e usar variantes ou imagens sem letras. O manual PDF continua em português e requer edição editorial própria. Essas pendências não devem ser apresentadas como tradução publicada completa.
