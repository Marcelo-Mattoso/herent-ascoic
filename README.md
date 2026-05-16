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
