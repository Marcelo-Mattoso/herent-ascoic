# Ascensão Heróica Digital — Plano de Implementação do MVP 1

Documento de execução. Complementa o documento de arquitetura. Foi escrito para ser consumido **um marco por vez** pelo Sonnet em sessões separadas, mantendo o contexto enxuto.

## Como usar este documento

1. O documento está dividido em **8 marcos sequenciais**. Cada marco é uma sessão de implementação.
2. Em cada sessão com o Sonnet, abra apenas a seção do marco atual.
3. Sempre forneça junto: o documento de arquitetura, o JSON de cartas, e o wireframe v3 (para marcos de UI).
4. Não pule marcos. As dependências são reais.
5. Ao final de cada marco, valide o critério de "pronto" antes de seguir.
6. Se algo no marco gerar dúvida estrutural, pare e ajuste o documento de arquitetura antes de continuar.

---

## Visão geral dos marcos

| # | Marco | Foco | Duração estimada |
|---|---|---|---|
| 1 | Setup do projeto | Vite + React + TS + libs | 1 sessão curta |
| 2 | Tipos e estado | Modelagem do GameState e auxiliares | 1 sessão |
| 3 | Loader de cartas | Ler e validar JSON, expor catálogo | 1 sessão curta |
| 4 | Regras puras com testes | dice, colorScale, combat, shield, conditions | 2 sessões |
| 5 | Reducer e actions | Loop de jogo completo no motor | 3 sessões |
| 6 | Store e integração | Conectar motor à camada React via Zustand | 1 sessão |
| 7 | Telas e componentes | UI completa do MVP 1 | 3-4 sessões |
| 8 | Polimento e fechamento | Testes finais, ajustes, build | 1 sessão |

Cada "sessão" assume foco no marco, sem multitasking. Tempo real depende do operador humano que coordena.

---

## Marco 1 — Setup do projeto

### Objetivo
Projeto rodando localmente com a stack definida, sem nenhuma funcionalidade do jogo ainda. Hello world em React acessando uma página em branco.

### Pré-requisitos
- Node.js 20+ instalado.
- Acesso ao terminal.
- Pasta vazia onde o projeto vai morar.

### O que fazer

1. Criar projeto com Vite usando template react-ts:
   ```bash
   npm create vite@latest ascensao-heroica -- --template react-ts
   cd ascensao-heroica
   npm install
   ```

2. Instalar dependências:
   ```bash
   npm install zustand
   npm install -D tailwindcss @tailwindcss/vite vitest @vitest/ui @biomejs/biome
   ```

3. Configurar Tailwind CSS v4 (modo recomendado atual — plugin Vite, sem `tailwind.config.js`):
   - Adicionar plugin do Tailwind ao `vite.config.ts`.
   - Trocar conteúdo de `src/index.css` por `@import "tailwindcss";`.

4. Configurar Biome:
   ```bash
   npx @biomejs/biome init
   ```
   Aceitar defaults. Adicionar scripts ao `package.json`:
   ```json
   "format": "biome format --write .",
   "lint": "biome check --write ."
   ```

5. Configurar Vitest no `vite.config.ts` (modo `test` com `environment: "node"` por padrão; testes de UI virão depois).

6. Criar estrutura de pastas vazia conforme arquitetura:
   ```
   src/
   ├── core/
   │   ├── state/
   │   ├── actions/
   │   ├── reducer/
   │   ├── rules/
   │   ├── strategies/
   │   ├── config/
   │   └── index.ts
   ├── data/
   ├── ui/
   │   ├── screens/
   │   ├── components/
   │   └── store/
   ├── main.tsx
   └── index.css
   ```

7. Substituir o `App.tsx` por um placeholder mínimo: um `<div>` com o título "Ascensão Heróica" centralizado, usando classes Tailwind.

8. Adicionar `.gitignore` se ainda não houver e fazer commit inicial.

### Critério de pronto

- [ ] `npm run dev` abre página com o título "Ascensão Heróica" no navegador.
- [ ] `npm run build` completa sem erros.
- [ ] `npm test` roda (mesmo sem testes ainda) e sai com sucesso.
- [ ] `npm run lint` roda sem erros.
- [ ] Todas as pastas da estrutura existem (mesmo vazias, com um arquivo `.gitkeep` se necessário).

### O que NÃO fazer
- Nenhum código de jogo.
- Nenhum tipo do `GameState`.
- Nenhum componente além do placeholder de App.tsx.
- Nada de roteamento ou múltiplas páginas.

---

## Marco 2 — Tipos e estado

### Objetivo
Modelar todos os tipos do `GameState` e estados auxiliares em TypeScript, com factory de estado inicial vazio. Sem lógica ainda, só forma dos dados.

### Pré-requisitos
- Marco 1 concluído.

### O que fazer

Criar os arquivos abaixo em `src/core/state/`, na ordem listada:

1. **`color.ts`** — tipo da progressão de 5 cores.
   ```ts
   export type Color = "white" | "yellow" | "orange" | "red" | "purple"
   export const COLORS: Color[] = ["white", "yellow", "orange", "red", "purple"]
   export type ColorIndex = 0 | 1 | 2 | 3 | 4
   ```

2. **`heroState.ts`** — estado de um herói em jogo (≠ carta do JSON).
   - Campos: `id`, `cardName`, `maxLife`, `currentLife`, `damage`, `hitBonus`, `dice`, `impeto` (ColorIndex), `activeItems` (record por tipo de item), `backpack` (array de IDs de item), `usedPowers` (record com flags por escopo), `conditions` (array de strings), `status` ("active" | "defeated" | "fled").

3. **`enemyState.ts`** — análogo do herói para criaturas.
   - Campos: `id`, `cardName`, `maxLife`, `currentLife`, `damage`, `hitBonus`, `dice`, `tokens` (record), `conditions` (array), `firstDamageTakenThisTurn` (boolean, para escudo), `status` ("active" | "defeated" | "fled" | "removed").

4. **`roomState.ts`** — sala em jogo.
   - Campos: `cardName`, `exits`, `currentEnemies` (number), `reward`, `rewardType`, `effect`, `xp`, `specialCreature` (opcional), `status` ("active" | "cleared").

5. **`deckState.ts`** — estado genérico de deck.
   - Campos: `available` (array de card names ou IDs), `discarded` (array), `removed` (array). Genérico por tipo de deck (dungeon, enemies, items, artifacts).

6. **`combatState.ts`** — estado do combate em andamento.
   - Campos: `round` (number), `heroesActed` (array de hero IDs), `enemiesEngaged` (array de enemy IDs), `pairs` (array de `{ heroId, enemyId }`), `lastRoll` (opcional, dado e bônus discriminados), `shieldsUsedThisTurn` (record), `temporaryEffects` (array).

7. **`gameState.ts`** — estado raiz.
   - Campos principais: `gameId` (string), `mode` ("solo"), `difficulty`, `status` (union de estados da máquina), `groupXp` (number), `despertar` (ColorIndex), `heroes` (HeroState[]), `defeatedHeroes` (HeroState[]), `currentRoom` (RoomState | null), `activeEnemies` (EnemyState[]), `enemyGraveyard` (EnemyState[]), `bossCardName` (string), `bossCondition`, `bossDefeated` (boolean), `groupArtifacts` (array de card names ou estruturas com portador), `decks` (record com dungeonDeck, enemyDeck, itemDeck, artifactDeck), `paths` (cartas de caminho reveladas, opcional), `roomsCleared` (number), `creaturesDefeated` (number), `eventLog` (array de strings).
   - Função fábrica `createInitialGameState(config)`.

8. **`status.ts`** — união discriminada dos estados da máquina (MAIN_MENU, SETUP_*, PREPARE_GAME, REVEAL_ROOM, ROOM_EFFECT, SPAWN_ENEMIES, COMBAT_START, HERO_ACTION, ROLL_DICE, RESOLVE_ATTACK, CHECK_COMBAT_END, DIRECT_DAMAGE, REWARD_PHASE, XP_SPEND_PHASE, OPEN_PATHS, CHOOSE_PATH, DISCARD_PATHS, SHUFFLE_REMAINING, CHECK_BOSS_CONDITION, BOSS_REVEAL, BOSS_COMBAT, VICTORY, DEFEAT).

9. **`src/core/state/index.ts`** — re-exporta tudo.

Cada arquivo começa com comentário de cabeçalho conforme convenção (3-5 linhas explicando o módulo).

### Critério de pronto

- [ ] Todos os tipos compilam sem erro (`npx tsc --noEmit`).
- [ ] `createInitialGameState` retorna um objeto válido para inspeção no console.
- [ ] Nenhum tipo usa `any`.
- [ ] Arrays e records são imutáveis no tipo (`readonly` onde fizer sentido).

### O que NÃO fazer
- Nenhum reducer.
- Nenhuma action.
- Nenhuma regra de combate.
- Nenhuma chamada para o JSON de cartas (isso é o marco 3).

---

## Marco 3 — Loader de cartas

### Objetivo
Carregar o `cards.json`, validar o schema mínimo, expor catálogo tipado e indexado por nome.

### Pré-requisitos
- Marco 2 concluído.
- Arquivo `dungeon-1.json` (o JSON de cartas) copiado para `src/data/cards.json`.

### O que fazer

1. **`src/data/cardTypes.ts`** — tipos dos registros do JSON (Hero, Creature, Subboss, Room, Item, Artifact, Boss) conforme schema documentado na arquitetura. Use unions discriminadas pelo campo `type`.

2. **`src/data/cards.ts`** — loader:
   - Importa o JSON com `import cards from "./cards.json"`.
   - Valida que cada entrada tem `type` e `name`.
   - Expõe funções:
     - `getAllCards()`: retorna o array completo.
     - `getCardsByType(type)`: filtra por tipo.
     - `getCardByName(name)`: busca por nome (case-sensitive, exato).
     - `getHeroes()`, `getCreatures()`, `getRooms()`, `getItems()`, `getArtifacts()`, `getBoss()`: helpers tipados.
   - Trata o caso `dice: "3 dados vermelhos"` do boss (string única) versus `diceByColor` de outras cartas — função auxiliar `getDiceCount(card, colorIndex)` que abstrai isso.
   - Trata `xp` faltando em "Corredor Estreito" — assume 0 quando undefined.

3. **`src/data/cards.test.ts`** — testes mínimos:
   - Quantidade total de cartas bate.
   - `getHeroes()` retorna 8.
   - `getBoss()` retorna o Azhakar.
   - `getCardByName("Bárbaro Rubro")` retorna o herói correto.
   - `getDiceCount` retorna o valor certo para Branco no Bárbaro (1) e para Roxo no Bárbaro (3).

### Critério de pronto

- [ ] `npm test` passa todos os testes do loader.
- [ ] Ao consultar `getHeroes()` no console (numa página de teste temporária), aparece array com os 8 heróis.
- [ ] Tipos do TypeScript inferem corretamente o tipo discriminado de cada card.

### O que NÃO fazer
- Nenhuma integração com o reducer ainda.
- Nenhuma transformação de carta em HeroState/EnemyState (isso vem no reducer).
- Nenhuma interpretação de campo `effect` ou `purpleEffect` — eles ficam como string crua por enquanto.

---

## Marco 4 — Regras puras com testes

### Objetivo
Implementar e testar as funções puras do motor de regras. Sem state mutation, sem actions, sem UI. Cada função recebe entradas, retorna saídas. Cada uma tem teste.

### Pré-requisitos
- Marco 3 concluído.

### O que fazer

Criar em `src/core/rules/`, com `.test.ts` ao lado de cada arquivo:

1. **`dice.ts`** — rolagem de dados.
   - `rollDice(count: number, faces = 6, rng?): { results: number[], total: number }`.
   - `rng` opcional para testes (função `() => number` no intervalo `[0,1)`).
   - Default usa `Math.random`.
   - Teste: rolar com rng fixo retorna resultados determinísticos.

2. **`colorScale.ts`** — utilidades de cor.
   - `nextColor(index: ColorIndex): ColorIndex` (não passa de 4).
   - `previousColor(index: ColorIndex): ColorIndex` (não passa de 0).
   - `valueAtColor(values: number[], index: ColorIndex): number` (lê array indexado por cor).
   - Testes: limites, leitura correta.

3. **`combat.ts`** — cálculos de combate.
   - `calculateTotal(diceResults: number[], bonuses: { source: string, value: number }[]): { dice: number, bonus: number, total: number, breakdown }` — discrimina os bônus por fonte.
   - `resolveAttack(heroTotal: number, enemyTotal: number, heroDamage: number, enemyDamage: number): { heroDamageTaken: number, enemyDamageTaken: number, outcome: "hero_wins" | "enemy_wins" | "tie" }`.
   - Tie: ambos sofrem 1 de dano (manual seção 8.3).
   - Testes: cobrir herói ganha, inimigo ganha, empate.

4. **`shield.ts`** — regra de escudo.
   - `applyShield(damage: number, isFirstDamageThisTurn: boolean, hasShield: boolean): number` — retorna o dano final após escudo.
   - Regra (manual 8.4.1): se primeiro dano do turno e tem escudo, dano de 1 ou 2 vira 0; dano maior é reduzido em 2.
   - Testes: cobrir cada caso (sem escudo, primeiro dano 1, primeiro dano 2, primeiro dano 5, segundo dano qualquer valor).

5. **`conditions.ts`** — verificação de condição do chefe.
   - `checkBossCondition(state: GameState, bossCardName: string): boolean`.
   - No MVP 1, implementar apenas a condição do Azhakar: `state.groupArtifacts.length >= 2`.
   - Estrutura preparada para outras condições (switch por boss name).
   - Testes: cobrir o caso de 0, 1, 2 e 3 artefatos.

6. **`reward.ts`** — cálculo de recompensa.
   - `calculateRewards(room: RoomState, defeatedEnemies: EnemyState[]): { xp: number, items: number, artifacts: number }`.
   - Soma sala + criaturas (manual seção 9).
   - Trata regra: fugidos e removidos não dão recompensa.
   - Teste: cobrir múltiplas criaturas + sala.

### Critério de pronto

- [ ] `npm test` passa todos os testes (cobertura ≥ 90% nos arquivos de `rules/`).
- [ ] Nenhuma função em `rules/` tem side effects.
- [ ] Nenhuma função em `rules/` importa de `state/` exceto para tipagem.
- [ ] Nenhuma função em `rules/` faz mutação.

### O que NÃO fazer
- Reducer (próximo marco).
- Interpretar `effect: string` das cartas — manter como string crua. O `effect` será aplicado por handlers explícitos por nome de carta no reducer ou em uma camada futura.
- UI.

---

## Marco 5 — Reducer e actions

### Objetivo
Implementar o reducer completo do jogo. Após este marco, o jogo é jogável **via console** (sem UI), apenas despachando actions e inspecionando o estado.

### Pré-requisitos
- Marco 4 concluído.

### O que fazer

Este marco é o maior. Divida em 3 sessões.

#### Sessão 5A — Actions e reducer base

1. **`src/core/actions/types.ts`** — união discriminada de todas as actions listadas na arquitetura. Cada action tem `type` e `payload` quando necessário.

2. **`src/core/actions/creators.ts`** — funções de fábrica para cada action (`startGame(config)`, `revealRoom()`, `chooseTarget(enemyId)`, etc.). Apenas wrappers tipados.

3. **`src/core/reducer/index.ts`** — reducer raiz que despacha por `type`. Estrutura:
   ```ts
   export function reducer(state: GameState, action: Action): GameState {
     switch (action.type) {
       case "START_GAME": return handleStartGame(state, action.payload)
       // ... outras
       default: return state
     }
   }
   ```

4. **`src/core/reducer/setup.ts`** — handlers de setup:
   - `START_GAME`: monta o estado inicial, embaralha decks, sorteia/fixa boss (Azhakar), define heróis ativos.
   - `PREPARE_GAME`: transita para REVEAL_ROOM.

5. **`src/core/reducer/exploration.ts`** — handlers de exploração:
   - `REVEAL_ROOM`: compra carta do deck de dungeon, define como sala atual.
   - `ROOM_EFFECT`: aplica efeitos iniciais conhecidos da sala (no MVP 1, suportar pelo menos "sem efeito adicional"; outros efeitos viram TODO documentado).
   - `SPAWN_ENEMIES`: compra criaturas do deck conforme `enemiesByPlayers[0]` (1-2 jogadores).
   - `OPEN_PATHS`: revela cartas de caminho.
   - `CHOOSE_PATH`: define próxima sala.
   - `DISCARD_PATHS`: descarta cartas não escolhidas e embaralha resto.

#### Sessão 5B — Combate

6. **`src/core/reducer/combat.ts`** — handlers de combate (com suporte a 1 a 8 heróis):
   - `COMBAT_START`: muda status, prepara CombatState com `heroesActed: []` e `enemiesEngaged: []`.
   - `CHOOSE_HERO`: jogador escolhe qual herói age agora. Valida que o herói está ativo, vivo e não agiu nesta rodada. Se sobrar apenas 1 herói disponível, auto-seleciona.
   - `CHOOSE_TARGET`: valida que inimigo não foi engajado nesta rodada por outro herói. Registra par `{ heroId, enemyId }`.
   - `ROLL_DICE`: chama `rollDice` com a quantidade certa de dados (lookup no JSON da carta com `getDiceCount`), guarda em `combatState.lastRoll`.
   - `RESOLVE_ATTACK`: calcula totais com bônus discriminados, aplica `resolveAttack`, atualiza vidas.
   - `APPLY_DAMAGE`: aplica dano considerando escudo.
   - `END_HERO_ACTION`: marca herói como tendo agido na rodada. Se ainda houver heróis disponíveis, volta para `CHOOSE_HERO`. Se todos agiram, transita para `DIRECT_DAMAGE`.
   - `DIRECT_DAMAGE`: para cada criatura ainda viva sem oponente nesta rodada, causa dano direto a 1 herói válido (usa strategy `targetSelection`).
   - `CHECK_COMBAT_END`: verifica se todos os inimigos morreram OU se todos os heróis morreram. Se nenhum dos dois, inicia nova rodada (limpa `heroesActed` e `enemiesEngaged`).

7. **Itens e poderes do MVP 1** — implementação direta por nome:
   - Adaga Enferrujada: bônus +1 já entra automaticamente no cálculo de `RESOLVE_ATTACK` quando equipada.
   - Poção de Vigor Menor: handler para `USE_ITEM` quando o item for "Poção de Vigor Menor" cura 2 de vida do herói escolhido.
   - Escudo Rachado: handler para `APPLY_DAMAGE` quando equipado, reduz 2 do dano (uma vez por combate, conforme texto).
   - Poder do Bárbaro Rubro: handler para `USE_POWER` que adiciona +1 dado e custa 1 de vida.
   - Habilidade do Bárbaro Rubro: bônus +3 automático em `RESOLVE_ATTACK` quando vida atual ≤ metade.

#### Sessão 5C — Recompensa, XP, progressão, boss

8. **`src/core/reducer/reward.ts`**:
   - `REWARD_PHASE`: calcula recompensas usando `calculateRewards`, abre fila de modais (um por carta).
   - `GRANT_REWARDS`: compra cartas dos decks (tesouros e artefatos) e enfileira em `state.pendingRewards`.
   - `CHOOSE_HERO_FOR_ITEM`: jogador escolhe qual herói recebe o item da fila.
   - `CHOOSE_ITEM_DESTINATION`: herói escolhido decide entre "equipar" / "mochila" / "descartar". Se equipar com slot ocupado, item anterior vai para mochila.
   - `CHOOSE_ARTIFACT_BEARER`: se o artefato menciona "o portador", jogador escolhe um herói. Caso contrário, vai direto para área coletiva.
   - `GAIN_XP`: soma ao `groupXp`.
   - Lembrete: tesouro sem deck = 1 XP; artefato sem deck = 3 XP (automático).

9. **`src/core/reducer/progression.ts`**:
   - `SPEND_XP`: handler genérico que recebe payload `{ option: "recover_dungeon" | "level_up" | "buy_item" | "lower_despertar" | "buy_artifact", heroId? }`.
   - **"level_up" requer `heroId`**: o herói escolhido sobe Ímpeto, Despertar global sobe junto, herói escolhido é curado e perde condições temporárias.
   - **"buy_item"**: dispara o fluxo de recompensa de item (escolher herói destinatário + destino).
   - Cada opção valida XP disponível e condição (deck cheio, despertar > Branco, etc).
   - **Dificuldades**: usar `DIFFICULTY_PRESETS` em `core/config/defaults.ts` com formato `{ heroOffset: number, despertarOffset: number }`. Aplicar em `START_GAME` para cada herói (Ímpeto inicial = heroOffset) e para o estado global (Despertar inicial = despertarOffset).

10. **`src/core/reducer/boss.ts`**:
    - `CHECK_BOSS_CONDITION`: roda `checkBossCondition`; se true, transita para BOSS_REVEAL.
    - `BOSS_REVEAL`: muda status, prepara estado de boss.
    - `BOSS_COMBAT`: similar ao combate normal, mas usa stats do boss e suas habilidades.
    - Habilidades do Azhakar: implementar como handlers nomeados (Trono Vivo, Ascensão Final). Pressão Arcana só ativa em despertar Roxo.
    - `VICTORY` / `DEFEAT`: terminal states.

11. **Testes de integração** em `src/core/reducer/reducer.test.ts`:
    - "Partida feliz solo": começa partida com 1 herói, joga uma sala, derrota inimigo, recebe recompensa, escolhe caminho.
    - "Partida com 3 heróis": cada herói age em sua vez na rodada; criatura sem oponente causa dano direto.
    - "Derrota total": todos os heróis morrem, jogo termina em DEFEAT.
    - "Herói cai mas partida segue": com 3 heróis, 1 morre — partida continua com 2.
    - "Derrota por deck esgotado": consome deck inteiro, recusa pagar 5 XP, jogo termina.
    - "Vitória contra boss": força obtenção de 2 artefatos, dispara verificação, vence o boss, jogo entra em VICTORY.
    - "Dificuldade Pesadelo": Ímpeto inicial dos heróis = Branco, Despertar inicial = Laranja.

### Critério de pronto

- [ ] Todos os handlers existem e estão tipados.
- [ ] Testes de integração passam.
- [ ] É possível jogar uma partida inteira no console: criar estado inicial, despachar uma sequência de actions e ver o status mudar até VICTORY ou DEFEAT.
- [ ] Strategies criadas com defaults: `targetSelection`, `effectOrder`, `tiebreak`, `bossSelection`, `itemDistribution`.

### O que NÃO fazer
- UI ainda não.
- Não implementar todos os efeitos de todas as cartas. Implemente apenas: Bárbaro Rubro (habilidade + poder), Adaga Enferrujada, Poção de Vigor Menor, Escudo Rachado, Coração de Brasa Antiga (se usado nos testes), Corredor Estreito, Sala da Masmorra, Rato das Fendas Profundas, Goblin das Cavernas Escuras, Azhakar (com Trono Vivo e Ascensão Final). Demais cartas têm `effect` ignorado por enquanto — adicionar TODO no log do reducer quando uma carta sem handler entra em jogo.

---

## Marco 6 — Store e integração

### Objetivo
Conectar o motor de regras puro à camada React usando Zustand. UI ainda não foi feita, mas o store está pronto para alimentá-la.

### Pré-requisitos
- Marco 5 concluído.

### O que fazer

1. **`src/ui/store/gameStore.ts`** — store Zustand:
   ```ts
   import { create } from "zustand"
   import { reducer } from "@/core/reducer"
   import type { GameState, Action } from "@/core/..."

   export const useGameStore = create<{
     state: GameState
     dispatch: (action: Action) => void
   }>((set, get) => ({
     state: createInitialGameState(),
     dispatch: (action) => set({ state: reducer(get().state, action) }),
   }))
   ```

2. **Seletores derivados** — funções fora do store que lêem o estado para a UI:
   - `selectActiveHero(state)`: herói atual em ação.
   - `selectAvailableActions(state)`: quais botões devem aparecer (Atacar, Usar item, Usar poder, Fugir).
   - `selectXpSpendOptions(state)`: quais opções de gasto de XP estão disponíveis.
   - Outros conforme necessidade.

3. **`src/ui/store/persistence.ts`** — funcionalidade pronta mas desabilitada por padrão (feature flag): serializa `state` em localStorage. Para MVP 1 fica off, mas o código está lá.

### Critério de pronto

- [ ] O store funciona em uma página React simples: um botão "iniciar partida" dispara `START_GAME` e o estado é exibido como JSON na tela.
- [ ] Tipos não vazam `any` em lugar nenhum da integração.

### O que NÃO fazer
- Componentes visuais ainda não.
- Telas ainda não.

---

## Marco 7 — Telas e componentes

### Objetivo
UI completa do MVP 1, conforme o wireframe v3. Jogador consegue completar uma partida do menu à vitória ou derrota.

### Pré-requisitos
- Marco 6 concluído.
- Wireframe v3 disponível como referência visual.

### O que fazer

Dividir em 3 sessões.

#### Sessão 7A — Componentes reutilizáveis

Em `src/ui/components/`:

1. **`Card.tsx`** — componente genérico de carta. Props: `type` (hero, enemy, room, item, artifact), `name`, `imageUrl` (opcional, usa placeholder se ausente), `children` (conteúdo customizado).
2. **`PlaceholderArt.tsx`** — componente de imagem placeholder, varia conforme o tipo de carta (silhueta diferente).
3. **`ColorBar.tsx`** — barra de 5 traços indicando cor atual (usada pra Ímpeto e Despertar).
4. **`StackPreview.tsx`** — visual de pilha (3 retângulos sobrepostos) + nome + contagem.
5. **`StatusBadge.tsx`** — pílula com texto curto e cor (usada pra "disponível", "usado", "ativa", etc.).
6. **`ActionButton.tsx`** — botão com ícone Tabler + label.
7. **`DiceDisplay.tsx`** — exibe um dado com valor, cor (azul ou vermelho) e label.

Cada componente tem tipos próprios e é puramente apresentacional. Sem store, sem lógica.

#### Sessão 7B — Telas principais

Em `src/ui/screens/`:

1. **`MainMenu.tsx`** — tela inicial com 3 botões: "Nova partida", "Biblioteca", "Configurações". Biblioteca e Configurações ficam desabilitados no MVP 1.

2. **`Setup.tsx`** — sequência de configuração:
   - Modo (Solo fixo, único habilitado).
   - Dificuldade (Muito fácil, Fácil, Padrão default, Difícil, Pesadelo).
   - Seleção de herói (grid com 8 heróis; mostra nome, stats no Branco, habilidade, poder, estilo).
   - Confirmação com boss fixo (Azhakar) e sua condição.
   - Botão "Iniciar partida" dispara `START_GAME`.

3. **`Exploration.tsx`** — tela principal conforme wireframe v3:
   - Barra de status (XP, sala, condição).
   - Painel de artefatos do grupo.
   - Painel de pilhas.
   - Campo de batalha com inimigos, sala, rolagem, despertar.
   - Botões de ação.
   - Painel do herói com habilidade, poder, mochila, equipamentos.

4. **`Victory.tsx`** e **`Defeat.tsx`** — telas de fim de jogo com resumo (motivo, salas, criaturas, XP, etc.) e botões "Jogar novamente" e "Voltar ao menu".

#### Sessão 7C — Modais e fluxos contextuais

Em `src/ui/components/modals/`:

1. **`XpSpendModal.tsx`** — janela de gasto de XP entre sala resolvida e abertura de caminhos. Mostra opções com custos, habilita só as disponíveis.
2. **`OpenPathsModal.tsx`** — mostra as cartas reveladas como caminhos, permite escolher uma, descarta as obrigatórias.
3. **`RewardModal.tsx`** — recebimento de item; permite equipar, ir pra mochila ou descartar.
4. **`DungeonExhaustedModal.tsx`** — opção de gastar 5 XP para evitar derrota.
5. **`CardDetailModal.tsx`** — modal que abre ao clicar em qualquer carta, mostra arte grande e texto completo.

#### Roteamento entre telas

Sem react-router. Faça um componente raiz `App.tsx` que renderiza a tela conforme `state.status`:

```ts
function App() {
  const status = useGameStore(s => s.state.status)
  if (status === "MAIN_MENU") return <MainMenu />
  if (status.startsWith("SETUP_")) return <Setup />
  if (status === "VICTORY") return <Victory />
  if (status === "DEFEAT") return <Defeat />
  return <Exploration /> // todos os outros estados são durante exploração/combate
}
```

### Critério de pronto

- [ ] É possível, do menu, iniciar uma partida, jogar do começo ao fim, e ver vitória ou derrota.
- [ ] Layout corresponde visualmente ao wireframe v3 (não precisa ser idêntico em pixels, mas a estrutura é a mesma).
- [ ] Cartas têm placeholders consistentes que variam por tipo.
- [ ] Todos os modais aparecem nos momentos certos.
- [ ] Clicar em qualquer carta abre o modal de detalhes.

### O que NÃO fazer
- Animações além de transições CSS simples (hover, fade-in de modais).
- Sons.
- Tela de biblioteca de cartas.
- Tutorial.
- Salvar partida (mesmo com infraestrutura pronta, deixar desabilitado).
- Telas de configurações.
- Responsividade pra mobile.

---

## Marco 8 — Polimento e fechamento

### Objetivo
Verificar critérios do MVP 1, ajustar bugs encontrados, gerar build de produção.

### Pré-requisitos
- Marco 7 concluído.

### O que fazer

1. **Smoke test manual** — jogar 4 partidas completas:
   - Uma partida solo (1 herói) ganha.
   - Uma partida com 3 heróis ganha — testar ordem de ação e dano direto.
   - Uma partida perdida por todos os heróis morrerem.
   - Uma partida perdida por deck esgotado (recusar pagar 5 XP).
   - Testar pelo menos uma partida em cada dificuldade (Muito fácil, Padrão, Pesadelo).

2. **Checklist de critérios do MVP 1** (do documento de arquitetura, seção 10):
   - [ ] Abre no navegador.
   - [ ] Nova partida solo, dificuldade selecionável (Muito fácil até Pesadelo).
   - [ ] Escolhe **1 a 8 heróis** entre os 8 disponíveis.
   - [ ] Azhakar como boss, condição "≥2 Artefatos".
   - [ ] Decks embaralhados, primeira sala revelada.
   - [ ] Loop completo: sala → criaturas → combate (com cada herói agindo em sequência) → rolagem → dano → recompensa → XP → gasto → caminhos → próxima sala.
   - [ ] Em combate, jogador escolhe ordem dos heróis; criaturas sem oponente causam dano direto.
   - [ ] Recompensa de item pede escolha de herói; recompensa de artefato vai direto para o grupo.
   - [ ] Esgotamento de deck oferece 5 XP.
   - [ ] Condição verificada após cada sala.
   - [ ] Combate final.
   - [ ] Vitória ao derrotar Azhakar.
   - [ ] Derrota nos cenários: todos os heróis mortos, deck esgotado, boss venceu.
   - [ ] Testes do core passam.

3. **Limpeza**:
   - Remover `console.log` espalhados.
   - Garantir que `npm run lint` está limpo.
   - Atualizar `README.md` com instruções de rodar.

4. **Build de produção**:
   - `npm run build`.
   - Servir o build com `npm run preview` e validar.

### Critério de pronto

- [ ] Todos os itens do checklist do MVP 1 marcados.
- [ ] 3 smoke tests passam.
- [ ] Build de produção gera sem warnings.
- [ ] README com instruções claras.

### O que NÃO fazer
- Refatorações grandes — se houver problema estrutural, registrar como débito técnico pra MVP 2.
- Adicionar features fora do escopo do MVP 1.

---

## Lista consolidada de pontos a discutir antes de começar

Antes de soltar o Marco 1, vale alinhar com o time/operador:

1. **Quem coordena as sessões com o Sonnet** — uma pessoa que abre cada marco, valida critério de pronto e segue.
2. **Onde mora o repositório** — GitHub privado, GitLab, local.
3. **Branch strategy** — sugestão: 1 branch por marco, merge na main após "pronto".
4. **Versão exata do Node** — fixar com `.nvmrc` ou `engines` no package.json.
5. **Convenção de commits** — sugestão simples: `[marco-N] descrição`.

---

## Apêndice — Lista de débitos técnicos previstos para MVP 2

Coisas que o MVP 1 não cobre mas devem entrar no backlog:

- Efeitos de cartas restantes (todas as criaturas e itens que não são do exemplo).
- Subchefes e salas especiais.
- Múltiplos heróis na mesma partida.
- Modo cooperativo e competitivo.
- Salvar partida em localStorage (infra pronta, só ligar).
- Biblioteca de cartas.
- Tutorial guiado.
- Tela de configurações.
- Internacionalização.
- Responsividade mobile.
- Animações de dado, dano, vitória.
- Sons e trilha sonora.
- Padronização do `dice` do boss para `diceByColor`.
- Estrutura de efeitos como objeto tipado (em vez de string crua).
- IDs estáveis em todas as cartas (separados do nome).
- Subbosses no JSON ligados por ID e não por nome.
