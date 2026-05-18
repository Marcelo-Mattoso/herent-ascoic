# Ascensão Heróica Digital — Diretrizes Arquiteturais do MVP 1

Documento de referência para a implementação do MVP 1. Foi escrito para ser lido uma vez antes de começar a codar e consultado durante o desenvolvimento. Substitui a necessidade de revisitar as discussões anteriores sobre regras, dados e decisões de produto.

---

## 1. Contexto e restrições

### Restrições de execução
- **Plataforma**: navegador web. UI básica é suficiente para o MVP 1, mas deve ser funcional e clara.
- **Quem implementa**: Claude Sonnet. A arquitetura, a stack e as convenções foram escolhidas para maximizar a previsibilidade da execução por modelo e minimizar tokens gastos em retrabalho.
- **Escopo**: MVP 1 conforme seção 23 do documento de jornada, atualizado pelo Patch 1 — modo solo, **1 a 8 heróis selecionáveis pelo jogador**, 1 chefe (Azhakar), loop completo de exploração até vitória ou derrota.

### Restrições derivadas da execução por modelo
Estas não são preferências de estilo, são requisitos:

- **Stack mainstream e previsível**. Nenhuma tecnologia exótica. O modelo acerta mais com ferramentas amplamente documentadas.
- **Arquivos pequenos e modulares**. Cada arquivo deve caber em um contexto curto. Limite-mole de ~200 linhas por arquivo.
- **Convenções rígidas e explícitas**. Estrutura de pastas previsível, nomes previsíveis, padrões de código previsíveis. Reduzir inferência.
- **Tipagem forte**. TypeScript em tudo. Tipos explícitos nos limites de cada módulo.
- **Documentação curta no topo de cada módulo**. 3 a 5 linhas explicando o que o módulo faz e onde se encaixa.
- **Testes simples desde o início**. Funções puras do motor devem ter testes. Não é para virar suite gigante.
- **Dependências mínimas**. Cada lib nova é risco. Justificar inclusões.

---

## 2. Stack escolhida

| Camada | Ferramenta | Por que |
|---|---|---|
| Build / dev server | **Vite** | Padrão atual, zero-config, build rápido, ótimo HMR. |
| Linguagem | **TypeScript** | Tipagem forte, ajuda o modelo a manter coerência. |
| UI | **React** | Mais documentado do que qualquer outro framework de UI. |
| Estado | **Zustand** | Store simples, sem boilerplate, serializável nativamente. Evita a complexidade do Redux. |
| Estilo | **Tailwind CSS** | Convenção por classes, sem CSS custom espalhado. Modelo acerta classes de utility. |
| Testes | **Vitest** | Roda em cima do Vite, API igual ao Jest, zero-config. |
| Lint / format | **Biome** | Substitui ESLint + Prettier numa ferramenta só, mais rápido e mais simples. |

**Nada além disso no MVP 1.** Sem roteador (uma tela basta), sem state machine externa (Zustand + reducer próprio resolvem), sem lib de animação (CSS transitions bastam), sem ícones (emoji + Tailwind), sem fetcher (sem backend).

---

## 3. Princípios arquiteturais

### 3.1 Separação rígida em três camadas

```
core/   → motor de regras puro, sem React, sem DOM, sem dependência externa
data/   → JSONs de cartas e configurações
ui/     → camada visual em React, consome estado do core e dispara actions
```

O **core** é o coração. Ele é uma biblioteca pura de TypeScript. Não importa nada de React, não conhece o navegador. Pode ser rodado em Node, no terminal, num teste, num servidor. Isso garante que mudar a plataforma (de web para mobile, por exemplo) é trocar `ui/`, não tocar em `core/`.

### 3.2 Estado puro e serializável

O `GameState` é um objeto JSON puro. Sem classes com métodos, sem referências circulares, sem `Date` ou `Map` (use string ISO e objeto literal). Toda mutação acontece por meio de um **reducer puro**:

```ts
function reducer(state: GameState, action: Action): GameState
```

Benefícios diretos:
- Save/load grátis: `JSON.stringify(state)` e `JSON.parse(serialized)`.
- Testabilidade trivial: chama o reducer com estado + ação, verifica o resultado.
- Undo grátis no futuro: armazenar histórico de estados.
- Debug fácil: estado é um objeto inspecionável.

### 3.3 Comportamentos plugáveis (strategies)

Onde o manual diz "regra da mesa" ou onde o negócio ainda não decidiu, o código expõe uma **função estratégia substituível**. Lista atual:

| Ponto | Strategy | Default no MVP 1 |
|---|---|---|
| Seleção de alvo de dano direto | `targetSelectionStrategy` | "herói com menor vida" |
| Ordem de efeitos simultâneos | `effectOrderStrategy` | sala → artefato → item → herói → criatura → roxo → chefe |
| Resolução de empate em "menor vida" | `tiebreakStrategy` | menor % de vida; se empatar, primeiro do array |
| Escolha do boss | `bossSelectionStrategy` | "fixo Azhakar" no MVP 1 |
| Distribuição de itens | `itemDistributionStrategy` | "jogador escolhe herói destinatário → equipar/mochila/descartar" |
| Ordem de ação dos heróis em combate | `heroOrderStrategy` | "jogador escolhe qual herói age na rodada" |

Cada strategy é uma função pura que recebe o estado e retorna a decisão. Trocar uma strategy é trocar um import. Nenhuma delas pode estar inlined no fluxo principal.

### 3.4 Configuração externa

Toda regra de negócio que pode mudar vira **config carregada de JSON** ou definida num único arquivo de defaults. Inclui:

- Custos de XP (5/10/15/30/35).
- Escala de dados por cor (`[1,1,2,2,3]` para cartas normais, `[1,2,2,3,3]` para subchefes, 3 fixo para boss).
- Limite de mochila (`null` = ilimitada por padrão no MVP 1).
- Dificuldades iniciais (modos muito fácil, fácil, padrão, difícil, pesadelo).
- Feature flags (`enableSubBosses`, `enableMultipleHeroes` etc).

Tudo isso vive em `core/config/defaults.ts`. Nenhum desses valores deve aparecer hardcoded em outro arquivo.

### 3.5 Sistema de actions tipadas

Toda mudança de estado é uma `Action` tipada com um discriminator `type`. Lista do MVP 1:

```
START_GAME, REVEAL_ROOM, RESOLVE_ROOM_EFFECT, SPAWN_ENEMIES,
START_COMBAT, CHOOSE_HERO, CHOOSE_TARGET, USE_ITEM, USE_POWER,
ROLL_DICE, RESOLVE_ATTACK, APPLY_DAMAGE, CHECK_COMBAT_END,
DIRECT_DAMAGE, GRANT_REWARDS, GAIN_XP, SPEND_XP,
OPEN_PATHS, CHOOSE_PATH, DISCARD_PATHS, SHUFFLE_REMAINING,
CHECK_BOSS_CONDITION, REVEAL_BOSS, START_BOSS_COMBAT,
VICTORY, DEFEAT
```

A UI dispara actions. O reducer aplica. O estado novo é renderizado.

---

## 4. Estrutura de pastas

```
src/
├── core/
│   ├── state/
│   │   ├── gameState.ts          ← GameState, fábrica de estado inicial
│   │   ├── heroState.ts          ← HeroState
│   │   ├── enemyState.ts         ← EnemyState
│   │   ├── roomState.ts          ← RoomState
│   │   ├── deckState.ts          ← DeckState
│   │   └── combatState.ts        ← CombatState
│   ├── actions/
│   │   ├── types.ts              ← união discriminada de todas as Actions
│   │   └── creators.ts           ← funções helper para criar actions
│   ├── reducer/
│   │   ├── index.ts              ← reducer principal, despacha por type
│   │   ├── combat.ts             ← handlers de combate
│   │   ├── exploration.ts        ← handlers de exploração
│   │   ├── reward.ts             ← handlers de recompensa e XP
│   │   └── progression.ts        ← handlers de Ímpeto e Despertar
│   ├── rules/
│   │   ├── dice.ts               ← rolagem (1-3 d6 conforme cor)
│   │   ├── combat.ts             ← cálculo de bônus, comparação, dano
│   │   ├── shield.ts             ← regra de escudo
│   │   ├── colorScale.ts         ← índice da cor → valor
│   │   └── conditions.ts         ← verificação de condição do boss
│   ├── strategies/
│   │   ├── targetSelection.ts
│   │   ├── effectOrder.ts
│   │   ├── tiebreak.ts
│   │   ├── bossSelection.ts
│   │   └── itemDistribution.ts
│   ├── config/
│   │   └── defaults.ts           ← todos os valores configuráveis
│   └── index.ts                  ← exports públicos do core
├── data/
│   ├── cards.json                ← o JSON que já existe
│   └── cards.ts                  ← loader tipado do JSON
├── ui/
│   ├── App.tsx
│   ├── screens/
│   │   ├── MainMenu.tsx
│   │   ├── Setup.tsx
│   │   ├── Exploration.tsx       ← tela principal de exploração
│   │   ├── Combat.tsx            ← sobreposição de combate
│   │   ├── Victory.tsx
│   │   └── Defeat.tsx
│   ├── components/
│   │   ├── HeroCard.tsx
│   │   ├── EnemyCard.tsx
│   │   ├── RoomCard.tsx
│   │   ├── DicePanel.tsx         ← exibe rolagens
│   │   ├── XpBar.tsx
│   │   ├── DespertarBar.tsx
│   │   └── ActionButtons.tsx
│   └── store/
│       └── gameStore.ts          ← Zustand store que encapsula o reducer
├── main.tsx
└── index.css
```

**Regra:** nada em `ui/` importa de outro lugar que não seja `core/` ou `data/`. Nada em `core/` importa de `ui/` ou `data/`. Nada em `data/` importa de `core/` ou `ui/`.

---

## 5. Regras de jogo consolidadas (o que o código precisa saber)

### 5.1 Sistema de dados
- Escala de dados por cor (índice 0 a 4 → Branco, Amarelo, Laranja, Vermelho, Roxo):
  - Heróis e criaturas normais: `[1, 1, 2, 2, 3]` dados de 6 faces.
  - Subchefes: `[1, 2, 2, 3, 3]`.
  - Chefe final (Azhakar): 3 dados fixos.
- Resultado da rolagem = soma dos dados + bônus aplicáveis.
- Cada carta traz seu próprio array de dados em `diceByColor`, então o motor lê do JSON, não tem que codificar a escala.

### 5.2 Cores de progressão
- 5 níveis fixos: 0=Branco, 1=Amarelo, 2=Laranja, 3=Vermelho, 4=Roxo.
- Nunca abaixo de 0, nunca acima de 4.
- Cada carta com `life`, `hitBonus`, `diceByColor` traz array de 5 posições. O motor indexa pelo nível atual.
- Heróis indexam pelo Ímpeto Heroico individual. Criaturas indexam pelo Despertar da Masmorra global.

### 5.3 Economia de XP
- Custos: 5 (recuperar carta de dungeon), 10 (subir nível de 1 herói escolhido), 15 (comprar item), 30 (baixar Despertar), 35 (comprar artefato).
- XP é coletivo do grupo.
- Janela de gasto acontece após resolver sala, antes de abrir caminhos.
- Subir nível custa 10 XP coletivos mas beneficia 1 herói específico (escolhido pelo jogador) — sobe Ímpeto, sobe Despertar (efeito colateral global), cura totalmente o herói escolhido, remove condições negativas temporárias.
- Exceção: gastar 5 XP para evitar derrota por deck de dungeon vazio é permitido como interrupção.

### 5.4 Dificuldades (regra unificada: "+N níveis")
Cada dificuldade aplica dois deslocamentos: um sobre o Ímpeto inicial de cada herói, outro sobre o Despertar inicial da masmorra. Nível 0 = Branco; +N sobe N posições.

| Modo | Ímpeto +N | Despertar +N | Cor Ímpeto | Cor Despertar |
|---|---|---|---|---|
| Muito fácil | +2 | 0 | Laranja | Branco |
| Fácil | +1 | 0 | Amarelo | Branco |
| Padrão | 0 | 0 | Branco | Branco |
| Difícil | 0 | +1 | Branco | Amarelo |
| Pesadelo | 0 | +2 | Branco | Laranja |

> **Correção do Patch 1**: a documentação anterior listava o Pesadelo como "Ímpeto Amarelo + Despertar Laranja". Está errado. Vale a regra "+N níveis": no Pesadelo, Ímpeto inicial é Branco (0), Despertar é Laranja (+2).

### 5.5 Combate
- Heróis ativos agem **um por vez** em fluxo sequencial: jogador escolhe um herói → escolhe alvo → combate é resolvido imediatamente → próximo herói.
- Em cada rodada, cada herói pode enfrentar 1 criatura **ou passar a rodada** sem combater.
- Uma criatura não pode ser alvo de mais de 1 herói na mesma rodada.
- Empate na rolagem: ambos sofrem 1 de dano.
- Após todos os heróis ativos agirem (ou passarem): criaturas sem oponente causam dano direto (strategy define o alvo).
- Escudo: ignora até 2 do primeiro dano de cada turno. Se for 1 ou 2, ignora tudo. Se for >2, reduz 2.
- Fuga: disponível para carta com 1 de vida. Precisa vencer o próximo confronto para fugir.
- **Derrota só acontece quando todos os heróis estão derrotados**, não quando o primeiro morre.
- O combate tem 6 fases internas (`selecting_hero`, `selecting_target`, `resolving`, `between_heroes`, `direct_damage`, `round_end`) que controlam o que a UI mostra e quais actions são válidas em cada momento.

### 5.6 Spawn de monstros
- A quantidade de criaturas em uma sala é calculada **no momento do saque da carta de dungeon**, baseada no número de heróis ativos naquele instante.
- Faixas: 1-2 heróis ativos → `enemiesByPlayers[0]`; 3-4 → `[1]`; 5-6 → `[2]`; 7-8 → `[3]`.
- Heróis derrotados ou fugidos saem do jogo permanentemente — reduzem o grupo e podem reduzir a quantidade de monstros das próximas salas.
- Se a faixa indica 0 criaturas, a sala não tem combate (resolve efeito, recompensa e XP, e segue).

### 5.7 Esgotamento de deck de dungeon
- Quando precisar revelar nova sala e o deck estiver vazio:
  - Se grupo tem ≥5 XP e descarte ≥1 carta: oferece gastar 5 XP para recuperar.
  - Caso contrário: derrota.

### 5.8 Recompensas: item vs artefato
- **Item**: jogador escolhe qual herói recebe. Em seguida, herói escolhe equipar / mochila / descartar. Se equipar com slot ocupado, item anterior vai para mochila ou é descartado.
- **Artefato comum**: vai direto para área de "Artefatos do grupo". Sem escolha de herói.
- **Artefato com "o portador"**: jogador escolhe 1 herói como portador. Vai para área do grupo com a marcação.
- Tesouro sem deck = 1 XP. Artefato sem deck = 3 XP.

### 5.9 Condição do chefe
- Verificada após cada sala resolvida.
- Quando cumprida: interrompe exploração, inicia combate final.
- No MVP 1 com Azhakar: `o grupo possui ≥2 Artefatos`.

---

## 6. Schema do JSON de cartas

O JSON `data/cards.json` já existe e é a fonte da verdade. O schema implícito é:

### Hero
```ts
{
  type: "hero",
  name: string,
  diceByColor: [number, number, number, number, number],
  life: [number, number, number, number, number],
  hitBonus: [number, number, number, number, number],
  damage: number,
  skill: string,    // habilidade passiva
  power: string,    // poder ativo
  style: string,
}
```

### Creature / Subboss
```ts
{
  type: "creature" | "subboss",
  name: string,
  diceByColor: [number, number, number, number, number],
  life: [number, number, number, number, number],
  hitBonus: [number, number, number, number, number],
  damage: number,
  xp: number,
  reward: number,
  rewardType: "item" | "artifact",
  effect: string,
  purpleEffect: string,
}
```

### Room
```ts
{
  type: "room",
  name: string,
  exits: number,
  enemiesByPlayers: [number, number, number, number], // 1-2, 3-4, 5-6, 7-8 jogadores
  reward: number,
  rewardType: "item" | "artifact",
  effect: string,
  xp?: number,                       // opcional, default 0
  specialCreature?: string,          // nome do subchefe vinculado
}
```

### Item
```ts
{
  type: "item",
  name: string,
  itemClass: "equipment" | "utility" | "consumable" | "special",
  tags: string[],
  effect: string,
}
```

### Artifact
```ts
{
  type: "artifact",
  name: string,
  countsAs: "artifact",
  effect: string,
}
```

### Boss
```ts
{
  type: "boss",
  name: string,
  dice: string,                      // padronizar para diceByColor no futuro
  lifeBase: number,
  hitBonusBase: number,
  damage: number,
  condition: string,
  artifactBonus?: string,
  dungeonScaling?: string,
  abilities: { name: string, effect: string }[],
  victory: string,
}
```

### Pontos abertos do JSON para revisar
- **Boss usa `dice: string`** em vez de `diceByColor`. Padronizar depois.
- **"Corredor Estreito" não tem campo `xp`**. Tratar como 0 no loader.
- **Efeitos são texto livre** (`effect: string`). No MVP 1 o código terá um handler explícito por nome de carta. No MVP 2, considerar migrar para efeitos estruturados.
- **Cartas se identificam por `name`**. Considerar adicionar `id` estável no MVP 2.

---

## 7. Pontos de extensão (pendências de negócio)

Estes pontos não bloqueiam o MVP 1. Cada um já está mapeado para o módulo certo. Quando o negócio decidir, troca-se o default sem refatorar o resto.

| Ponto | Default no MVP 1 | Local de mudança |
|---|---|---|
| Plataforma | Web (Vite + React) | Camada `ui/` inteira é trocável |
| Quantos heróis | **1 a 8 selecionáveis pelo jogador** | `core/state/gameState.ts` (array de heróis) |
| Alvo de dano direto | Herói com menor vida | `core/strategies/targetSelection.ts` |
| Ordem dos heróis em combate | Jogador escolhe | `core/strategies/heroOrder.ts` |
| Ordem de efeitos simultâneos | Sala → artefato → item → herói → criatura → roxo → chefe | `core/strategies/effectOrder.ts` |
| Salvar partida no meio | Não disponível na UI, mas serialização pronta | `ui/store/gameStore.ts` |
| Mochila ilimitada | Sim | `core/config/defaults.ts` |
| Trocar itens em janela de XP | Não | Fases de ação em `core/state/gameState.ts` |
| Boss fixo vs sorteado | Fixo (Azhakar) | `core/strategies/bossSelection.ts` |
| Subchefes | Desligado por flag | `core/config/defaults.ts` |

---

## 8. Convenções de código

### Nomenclatura
- Arquivos: `camelCase.ts` para módulos, `PascalCase.tsx` para componentes React.
- Tipos: `PascalCase`.
- Funções e variáveis: `camelCase`.
- Constantes globais: `SCREAMING_SNAKE_CASE`.

### Estrutura de um módulo do core
Todo arquivo em `core/` começa com um comentário de 3 a 5 linhas:

```ts
/**
 * core/rules/dice.ts
 *
 * Rolagem de dados. Recebe quantidade de dados e retorna soma + array de resultados.
 * Função pura, sem side effects além do RNG. Usar `seedRandom` para testes.
 */
```

### Funções puras como regra
Tudo em `core/rules/` e `core/reducer/` é função pura: mesma entrada → mesma saída, sem mutação, sem I/O.

### Imutabilidade
Nunca mutar estado direto. Sempre retornar novo objeto:

```ts
// Errado
state.heroes[0].life -= damage

// Certo
return {
  ...state,
  heroes: state.heroes.map((h, i) =>
    i === 0 ? { ...h, life: h.life - damage } : h
  )
}
```

### Testes
Cada arquivo em `core/rules/` tem um `.test.ts` ao lado. Cada handler do reducer tem ao menos 1 teste por caminho não trivial. Não cobrir testes de UI no MVP 1.

---

## 9. Ordem de implementação sugerida

A ordem importa porque algumas peças dependem de outras. Esta sequência minimiza retrabalho.

1. **Setup do projeto**: Vite + React + TS + Tailwind + Zustand + Vitest + Biome.
2. **Tipos do `GameState`** e estados auxiliares (Hero, Enemy, Room, Deck, Combat).
3. **Loader do JSON de cartas** com validação básica de schema.
4. **Funções puras de regra**: `dice.ts`, `colorScale.ts`, `combat.ts`, `shield.ts`. Testes desde aqui.
5. **Reducer + actions** começando por `START_GAME`, `REVEAL_ROOM`, `SPAWN_ENEMIES`.
6. **Loop de combate**: `START_COMBAT`, `ROLL_DICE`, `RESOLVE_ATTACK`, `APPLY_DAMAGE`, `CHECK_COMBAT_END`.
7. **Recompensa e XP**: `GRANT_REWARDS`, `GAIN_XP`, `SPEND_XP`.
8. **Abertura de caminhos**: `OPEN_PATHS`, `CHOOSE_PATH`, `DISCARD_PATHS`.
9. **Verificação de boss e combate final**.
10. **Strategies plugáveis** com defaults.
11. **Store Zustand** que conecta UI ao reducer.
12. **Telas mínimas**: menu, setup (1 herói, dificuldade padrão, Azhakar), exploração, combate, vitória, derrota.
13. **Polimento de UI** dentro do limite do MVP 1.

---

## 10. Critérios de "pronto" do MVP 1

O MVP 1 está pronto quando:

- [ ] Jogador abre o jogo no navegador.
- [ ] Inicia nova partida em modo solo, dificuldade selecionável (Muito fácil até Pesadelo).
- [ ] **Escolhe de 1 a 8 heróis** entre os 8 disponíveis.
- [ ] Encara Azhakar como boss fixo, condição "≥2 Artefatos".
- [ ] Sistema embaralha decks e revela primeira sala.
- [ ] Loop completo funciona: sala → criaturas → combate (cada herói age em sequência) → rolagem → dano → recompensa → XP → janela de XP → abertura de caminhos → próxima sala.
- [ ] Em combate, jogador escolhe ordem em que cada herói age.
- [ ] Criaturas sem oponente causam dano direto após todos heróis agirem.
- [ ] Esgotamento de deck oferece opção de gastar 5 XP.
- [ ] Condição do boss é verificada após cada sala.
- [ ] Combate final contra Azhakar acontece quando condição é cumprida.
- [ ] Tela de vitória aparece ao derrotar Azhakar.
- [ ] Tela de derrota aparece quando **todos** os heróis morrem, deck esgotado, ou Azhakar derrota o grupo.
- [ ] Testes do core passam.

Tudo que está em "MVP 2/3/4" da jornada original fica fora.

---

## 11. O que NÃO fazer no MVP 1

- Animações complexas (use transições CSS simples se for necessário).
- Sons.
- Subchefes (a feature flag fica desligada, mas o código já prevê).
- Modos cooperativo ou competitivo.
- Salvar partida em localStorage (mesmo a infraestrutura estando pronta).
- Biblioteca de cartas.
- Tutorial.
- Tela de créditos.
- Configurações além das de partida.
- Internacionalização.
- Acessibilidade avançada (mas use HTML semântico).
- Otimização de performance (vite + react já são rápidos o suficiente).

---

## 12. Resumo executivo

Stack: **Vite + React + TypeScript + Zustand + Tailwind + Vitest + Biome.**

Arquitetura: **core puro + data JSON + UI React**, comunicação via actions tipadas e reducer puro. Estado serializável. Strategies plugáveis para todo ponto de decisão aberto.

Restrição central: o código será escrito pelo Sonnet. Tudo foi pensado para reduzir ambiguidade, manter arquivos pequenos, evitar dependências exóticas e tornar cada decisão local. Stack mainstream, convenções rígidas, tipagem forte.

Decisões de negócio em aberto não bloqueiam o MVP 1. Cada uma está mapeada para um módulo isolado e tem um default razoável.
