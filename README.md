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

Em modo dev (`npm run dev`) o store Zustand é exposto em `window.__store`. Isso permite testar e inspecionar o estado diretamente pelo console do navegador — sem precisar navegar pela UI.

### Exemplos rápidos

```js
// Estado atual
window.__store.getState().state.status
window.__store.getState().state.heroes

// Despachar actions manualmente
const d = window.__store.getState().dispatch;
d({ type: "REVEAL_ROOM" });
d({ type: "RESOLVE_ROOM_EFFECT" });
d({ type: "SPAWN_ENEMIES" });
d({ type: "START_COMBAT" });

// Selecionar herói e alvo em combate
const heroId = window.__store.getState().state.heroes[0].id;
const enemyId = window.__store.getState().state.activeEnemies[0].id;
d({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } });
d({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
d({ type: "ROLL_DICE" });
d({ type: "RESOLVE_ATTACK" });

// Passar ou cancelar a rodada de um herói
d({ type: "PASS_HERO_ACTION", payload: { heroId } });
d({ type: "CANCEL_HERO_SELECTION" });

// Herói em foco (painel de inventário)
window.__store.getState().ui.focusedHeroId;
window.__store.getState().setFocusedHero(heroId);

// Resetar para a tela inicial
window.__store.getState().reset();
```

### Script de partida rápida

```js
// Inicia partida com 3 heróis e avança até o combate em uma linha
(() => {
  const d = window.__store.getState().dispatch;
  d({ type: "START_GAME", payload: { heroCardNames: ["Clérigo do Descanso Eterno", "Guerreiro do Bastião Partido", "Bárbaro Rubro"] } });
  d({ type: "REVEAL_ROOM" });
  d({ type: "RESOLVE_ROOM_EFFECT" });
  d({ type: "SPAWN_ENEMIES" });
  d({ type: "START_COMBAT" });
  const st = window.__store.getState().state;
  console.log(`status=${st.status} | phase=${st.combat?.phase} | inimigos=${st.activeEnemies.length}`);
})();
```
