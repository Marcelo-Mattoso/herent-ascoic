# Ascensão Heróica Digital — MVP 1

Jogo de cartas solo dungeon-crawler. Um herói contra a masmorra, um boss ao final.

## Requisitos

- Node.js 20+
- npm 10+

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173` no navegador.

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Servir o build de produção localmente |
| `npm test` | Rodar todos os testes (Vitest) |
| `npm run lint` | Lint + format check (Biome) |
| `npm run script tools/dev-scripts/<arquivo>.ts` | Executar script avulso com acesso ao core via `@/` |

## Stack

- **React 19** + **TypeScript 6** — UI
- **Vite 8** — bundler
- **@ngneat/elf** — estado global (store reativo + Redux DevTools)
- **Tailwind CSS v4** — estilos
- **Biome 2** — lint e formatação
- **Vitest 4** — testes unitários e de integração

## Estrutura

```
src/
├── core/               # Motor de jogo puro (sem React) — ver src/core/README.md
├── data/               # Catálogo de cartas e skills (JSON/YAML) — ver src/data/README.md
│   └── scripts/        # Scripts de carta (lógica de skill que não cabe em DSL)
├── ui/
│   ├── components/     # Reutilizáveis (Board, HeroFocusPanel, BuffBar, EventLogPanel…)
│   │   └── modals/     # Modais (XpSpend, OpenPaths, CardDetail, SkillChoice…)
│   ├── screens/        # Telas (MainMenu, Setup, Exploration, Victory, Defeat)
│   └── store/          # Elf store, seletores, persistência e adapter pro core
└── main.tsx
```

A regra de separação é dura: **a UI consome o core via projeção; nunca duplica lógica de jogo.** Toda mudança de estado passa por `dispatch(action)`. Detalhes da arquitetura do core estão em [`src/core/README.md`](src/core/README.md); do catálogo de cartas e skills em [`src/data/README.md`](src/data/README.md).

## Documentação

| Documento | Descrição |
|---|---|
| [`docs/arquitetura-mvp1.md`](docs/arquitetura-mvp1.md) | Decisões de arquitetura e visão geral do sistema |
| [`docs/spec-telas-mvp1.md`](docs/spec-telas-mvp1.md) | Especificação de telas e fluxo de UI |
| [`src/core/README.md`](src/core/README.md) | Motor de jogo — reducer, skills, ECS, projeção |
| [`src/data/README.md`](src/data/README.md) | Catálogo de cartas, skills YAML e scripts |
| [`docs/patches/`](docs/patches/) | Histórico de patches (escopo, critério de aceite, riscos) |

## Como jogar

1. **Nova partida** — escolha um herói e uma dificuldade.
2. **Exploração** — uma carta de sala é revelada a cada turno.
3. **Combate** — role os dados, aplique dano, derrote os inimigos.
4. **Recompensa** — ganhe itens e XP ao limpar a sala.
5. **Caminhos** — escolha a próxima sala entre as cartas reveladas.
6. **Boss** — ao obter 2 artefatos, Azhakar aparece. Derrote-o para vencer.

## Condições de derrota

- O herói chega a 0 de vida.
- O deck de dungeon esgota e você recusa pagar 5 XP para continuar.

## Ferramentas de desenvolvimento em jogo

### Log de eventos (in-game)

Clique no botão **📋 Log** na barra de status superior para abrir/fechar o painel de eventos. O log exibe com código de cores cada evento da partida:

| Cor | Tipo |
|---|---|
| Vermelho | Dano sofrido / derrota |
| Verde | Cura / sobrevivência |
| Azul | Habilidades / poderes |
| Amarelo | Avisos |
| Cinza | Info geral |

As mensagens de combate incluem **breakdown completo**: dados rolados, bônus por habilidade (com nome da skill) e total final. Exemplo:
```
Vigia das Portas Quebradas sofreu 7 de dano.
  Herói: [4,3] | Fúria Rubra +6, Fio Mortal +1 | total 14
  Inimigo: [2,1] | total 3
```

### Efeitos ativos (BuffBar)

Entre o tabuleiro e o card do herói há uma barra unificada de efeitos ativos no combate, dividida por uma `<hr>` tracejada:

- **Topo** (`🤝 Grupo:`): efeitos que afetam recursos compartilhados — `dungeonDiscardPrevented` (Caminho Preservado), `fleeBlocked`, `discardDungeonLocked`, etc. Vivem em `state.flags.*` e são projetados em `view.groupBuffs`.
- **Base** (`🧙 <Nome>:`): efeitos individuais do herói em foco — `bonusNextAttack`, `damageReduction`, `tohitPenaltyByHero`, `extraDice`, Marca da Presa, passivas `while_equipped`. Vivem em `state.combat.*` e são projetados em `view.combat.buffsByHero[heroId]`.

Cada chip carrega `kind: "buff" | "debuff" | "neutral"` (cor: âmbar / magenta / cinza) e `source` (origem semântica) mostrada no chip e no tooltip. A BuffBar inteira esconde quando nem grupo nem herói têm efeitos.

### Animação "clique aqui"

A UI marca o **próximo clique esperado** com um pulso âmbar (`.click-attention` em [src/index.css](src/index.css)):

- Botão central do tabuleiro (Revelar sala / Iniciar combate / Rolar dados / Revelar chefe / Resolver ataque).
- Botões "Atacar" e "Usar poder" no painel do herói quando habilitados.
- Cards de herói quando `phase = selecting_hero`.
- Cards de inimigo quando `phase = selecting_target`.
- Dados elegíveis quando há `pendingDiceSelection` (animação mais enfática `.die-eligible`).

Respeita `prefers-reduced-motion` — em modo reduzido, vira anel estático sem pulsar.

### Replay Viewer

Pressione **Ctrl+Shift+R** para abrir o Replay Viewer. Ele permite navegar passo a passo pelo `actionLog` da partida atual — útil para depurar o efeito de cada action sobre o estado.

### Console do navegador

Em modo dev (`npm run dev`) o core expõe dois objetos no `window`:

- `window.__elfStore` — store Elf. `.getValue()` devolve `{ gameState, ui }` cru. Útil pra inspecionar o estado completo (`combat`, `flags`, `heroes`, etc.).
- `window.__dispatch(action)` — despacha uma `Action` no adapter síncrono. Quando retorna, o estado já está atualizado.

> O hook `window.__store` exposto pelo `useGameStore` **não pode ser chamado** fora do React (Invalid hook call). Use os dois acima.

```js
// Helpers rápidos
const g = () => window.__elfStore.getValue().gameState;
const d = window.__dispatch;

// Após qualquer dispatch, o estado já está atualizado:
d({ type: "START_COMBAT" });
g().combat?.phase;          // "selecting_hero"

// Escolhe herói e inimigo:
const heroId = g().heroes[0].id;
d({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } });

const enemyId = g().activeEnemies[0].id;
d({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });

// Rola e resolve:
d({ type: "ROLL_DICE" });
g().combat?.lastRoll;       // { heroTotal, enemyTotal, heroBreakdown, ... }
d({ type: "RESOLVE_ATTACK" });

// EventLog: feedback textual de tudo que aconteceu
g().eventLog.slice(-5);

// Buffs ativos por herói (visto pela UI):
import("@/core/projection/playerView").then(({ playerView }) => {
  const view = playerView(g());
  console.log("grupo:", view.groupBuffs);
  console.log("herói:", view.combat?.buffsByHero[heroId]);
});
```

### Script de partida rápida até o combate

```js
// Cola no console, retorna um resumo sem nenhum screenshot
(() => {
  const d = window.__dispatch;
  const g = () => window.__elfStore.getValue().gameState;

  d({ type: "START_GAME", payload: {
    heroCardNames: ["Clérigo do Descanso Eterno", "Guerreiro do Bastião Partido", "Bárbaro Rubro"]
  }});
  ["REVEAL_ROOM", "RESOLVE_ROOM_EFFECT", "SPAWN_ENEMIES", "START_COMBAT"]
    .forEach(type => d({ type }));

  const st = g();
  return {
    status:   st.status,
    phase:    st.combat?.phase,
    sala:     st.currentRoom?.cardName,
    inimigos: st.activeEnemies.map(e => `${e.cardName} (${e.currentLife}hp)`),
    herois:   st.heroes.map(h => `${h.cardName.split(' ')[0]} (${h.currentLife}hp)`),
    log:      st.eventLog.slice(-3),
  };
})();
```

### Scripts avulsos (`tools/dev-scripts/`)

Para automatizar fluxos mais longos, crie um arquivo `.ts` em `tools/dev-scripts/` e rode:

```bash
npm run script tools/dev-scripts/meu-script.ts
```

Os scripts têm acesso completo ao core via alias `@/`, igual ao ambiente de testes. Veja `tools/dev-scripts/example.ts` como referência.
