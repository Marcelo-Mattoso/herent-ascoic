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
| `npm run script src/data/scripts/<arquivo>.ts` | Executar script avulso com acesso ao core via `@/` |

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
├── core/               # Motor de jogo puro (sem React)
│   ├── actions/        # Tipos e criadores de actions
│   ├── adapter/        # EngineAdapter + inProcessAdapter (ponte core ↔ UI)
│   ├── config/         # Constantes e configurações globais
│   ├── data/           # Loaders e tipos (cards.ts, skills.ts, cardTypes.ts, skillTypes.ts)
│   ├── ecs/            # ECS world — entities, components e world API
│   ├── effects/        # Effect stack — resolução ordenada de cadeias de efeitos
│   ├── events/         # Event bus síncrono (DamageAboutToBeDealt, HealAboutToBeApplied…)
│   ├── persistence/    # Porta de persistência (localStorage / no-op)
│   ├── ports/          # Interfaces abstratas (PersistencePort, etc.)
│   ├── projection/     # Projeções de estado (playerView, aiView, replayView)
│   ├── reducer/        # Reducer por domínio (setup, combat, reward…)
│   ├── replay/         # Replay viewer — navega pelo actionLog passo a passo
│   ├── rules/          # Funções puras (dice, combat, shield, colorScale…)
│   ├── skills/         # Catálogo de habilidades e handlers por tipo
│   │   └── handlers/   # Um arquivo por handler (damage_bonus, heal, reroll…)
│   ├── state/          # Tipos do GameState, CombatState e factories iniciais
│   ├── strategies/     # Estratégias plugáveis (targetSelection, etc.)
│   └── systems/        # Sistemas com queries (damageSystem, healSystem, conditionSystem)
├── data/               # Dados estáticos JSON (cards, skills, balance, transitions…)
│   └── scripts/        # Scripts avulsos de desenvolvimento (executados com npm run script)
├── ui/
│   ├── components/     # Componentes reutilizáveis (Board, HeroFocusPanel, EventLogPanel…)
│   │   └── modals/     # Modais (XpSpend, OpenPaths, CardDetail, SkillChoice…)
│   ├── screens/        # Telas (MainMenu, Setup, Exploration, Victory, Defeat)
│   └── store/          # Elf store, seletores, persistência e adaptador
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

### Replay Viewer

Pressione **Ctrl+Shift+R** para abrir o Replay Viewer. Ele permite navegar passo a passo pelo `actionLog` da partida atual — útil para depurar o efeito de cada action sobre o estado.

### Console do navegador

Em modo dev (`npm run dev`) o store é exposto em `window.__store`. O padrão é: despacha → lê o que mudou → confirma.

```js
// Helpers rápidos
const d = () => window.__store.getState().dispatch;
const g = () => window.__store.getState().state;

// Após qualquer dispatch, o estado já está atualizado na próxima linha:
d()({ type: "START_COMBAT" });
g().combat?.phase;          // "selecting_hero"

// Escolhe herói e inimigo:
const heroId = g().heroes[0].id;
d()({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } });

const enemyId = g().activeEnemies[0].id;
d()({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });

// Rola e resolve:
d()({ type: "ROLL_DICE" });
g().combat?.lastRoll;       // { heroTotal, enemyTotal, heroBreakdown, ... }
d()({ type: "RESOLVE_ATTACK" });

// EventLog: feedback textual de tudo que aconteceu
g().eventLog.slice(-5);
```

### Script de partida rápida até o combate

```js
// Cola no console, retorna um resumo sem nenhum screenshot
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

### Scripts avulsos (`src/data/scripts/`)

Para automatizar fluxos mais longos, crie um arquivo `.ts` em `src/data/scripts/` e rode:

```bash
npm run script src/data/scripts/meu-script.ts
```

Os scripts têm acesso completo ao core via alias `@/`, igual ao ambiente de testes. Veja `src/data/scripts/example.ts` como referência.
