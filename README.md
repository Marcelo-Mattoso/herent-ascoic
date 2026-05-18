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

## Stack

- **React 19** + **TypeScript 6** — UI
- **Vite 8** — bundler
- **Zustand 5** — estado global
- **Tailwind CSS v4** — estilos
- **Biome 2** — lint e formatação
- **Vitest 4** — testes unitários e de integração

## Estrutura

```
src/
├── core/           # Motor de jogo puro (sem React)
│   ├── actions/    # Tipos e criadores de actions
│   ├── reducer/    # Reducer por domínio (setup, combat, reward…)
│   ├── rules/      # Funções puras (dice, combat, shield, colorScale…)
│   ├── state/      # Tipos do GameState e factory inicial
│   └── strategies/ # Estratégias plugáveis (targetSelection, etc.)
├── data/           # Loader e tipos do cards.json
├── ui/
│   ├── components/ # Componentes reutilizáveis e modais
│   ├── screens/    # Telas (MainMenu, Setup, Exploration, Victory, Defeat)
│   └── store/      # Zustand store, seletores, persistência
└── main.tsx
```

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

## Testando fluxos em desenvolvimento

Em modo dev (`npm run dev`) o store Zustand é exposto em `window.__store`. A vantagem é poder **verificar o resultado de cada action lendo o estado em seguida** — sem tirar screenshot, sem clicar na UI, sem inspecionar o DOM.

O padrão é: despacha → lê o que mudou → confirma.

```js
// Helpers rápidos
const d = () => window.__store.getState().dispatch;
const g = () => window.__store.getState().state;
const ui = () => window.__store.getState().ui;

// Após qualquer dispatch, o estado já está atualizado na próxima linha:
d()({ type: "START_COMBAT" });
g().combat?.phase;          // "selecting_hero"
g().combat?.selectedHeroId; // null

// Escolhe herói, lê confirmação imediata:
const heroId = g().heroes[0].id;
d()({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } });
g().combat?.phase;          // "selecting_target"
g().combat?.selectedHeroId; // "<id do herói>"

// Engaja inimigo, lê resultado:
const enemyId = g().activeEnemies[0].id;
d()({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
g().status;                 // "ROLL_DICE"
g().combat?.pairs.length;   // 1

// Rola e resolve, lê danos:
d()({ type: "ROLL_DICE" });
g().combat?.lastRoll;       // { heroTotal, enemyTotal, ... }
d()({ type: "RESOLVE_ATTACK" });
g().status;                 // "HERO_ACTION" (próximo herói) ou "DIRECT_DAMAGE"
g().combat?.heroesActed;    // [heroId]

// EventLog: feedback textual de tudo que aconteceu
g().eventLog.slice(-5);
// ["Partida iniciada...", "Sala revelada: ...", "2 inimigo(s) aparecem: ...", ...]
```

### Script de partida rápida até o combate

```js
// Cola no console, retorna um resumo sem screenshot nenhuma
(() => {
  const s = window.__store;
  s.getState().reset();
  s.getState().dispatch({ type: "START_GAME", payload: {
    heroCardNames: ["Clérigo do Descanso Eterno", "Guerreiro do Bastião Partido", "Bárbaro Rubro"]
  }});
  ["REVEAL_ROOM", "RESOLVE_ROOM_EFFECT", "SPAWN_ENEMIES", "START_COMBAT"]
    .forEach(type => s.getState().dispatch({ type }));

  const st = s.getState().state;
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
