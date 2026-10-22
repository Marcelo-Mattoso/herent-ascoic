# Ascensão Heróica Digital

Jogo de cartas dungeon-crawler cooperativo. Um grupo de heróis explora salas,
enfrenta criaturas, organiza itens e artefatos entre combates e tenta derrotar
Azhakar antes que a masmorra desperte por completo.

## Requisitos

- Node.js 24
- npm 10+

## Rodar localmente

```bash
npm ci
npm run dev
```

Acesse `http://localhost:5173` no navegador.

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Build de produção em `dist/` |
| `npm run verify:build` | Confere HTML, imagens, manifestos e PDF do build |
| `npm run preview` | Servir o build de produção localmente |
| `npm test` | Rodar todos os testes (Vitest) |
| `npm run test:coverage` | Rodar testes com limiares de cobertura |
| `npm run test:e2e` | Testar o fluxo inicial no Chromium (instalar com `npx playwright install chromium`) |
| `npm run lint` | Lint + format check (Biome) |
| `npm run script tools/dev-scripts/<arquivo>.ts` | Executar script avulso com acesso ao core via `@/` |

## Alpha web e publicação

O jogo é estático e pode ser servido no GitHub Pages. A branch remota principal é
`main`. O workflow [CI and GitHub Pages](.github/workflows/ci.yml) executa lint,
testes, cobertura, build, verificação dos assets e testes de navegador. Em push
para `main`, o deploy só ocorre se todos esses passos passarem.

Antes do primeiro deploy, configure **Settings → Pages → Build and deployment →
Source: GitHub Actions** no repositório GitHub. Depois, abra um pull request com
estas mudanças, confira os checks e incorpore em `main` quando desejar publicar.
Nenhum push ou deploy é feito pelos comandos locais deste guia.

Para conferir localmente o mesmo caminho-base usado no Pages:

```powershell
$env:PAGES_BASE_PATH='/herent-ascoic/'
npm run build
npm run verify:build -- --base /herent-ascoic/
npm run preview
Remove-Item Env:PAGES_BASE_PATH
```

Após o deploy, abra [a alpha web](https://println.github.io/herent-ascoic/),
confirme que **JOGAR** abre a escolha de heróis, que cartas e tabuleiro carregam
com imagens e que **Regras** abre o PDF. O endereço direto do manual será
`https://println.github.io/herent-ascoic/rules/ascensao-heroica-manual.pdf`.
O Pages precisa estar público para amigos sem acesso ao repositório poderem jogar.

As partidas ainda não sobrevivem ao fechamento ou recarregamento da página.
Consulte [a auditoria da alpha](docs/WEB_PLAYTEST_AUDIT.md) antes de compartilhar.

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
│   │   └── modals/     # Modais (XpSpend, CardDetail, SkillChoice, SkillTarget…)
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

1. **Nova partida** — escolha os heróis do grupo e a dificuldade.
2. **Exploração** — revele uma sala, aplique seu efeito e encontre criaturas.
3. **Combate** — escolha qual herói ativo age, defina o alvo, use habilidades,
   itens ou poderes quando disponíveis, role os dados e aplique o resultado.
4. **Recompensa** — ao limpar a sala, receba XP, itens e artefatos.
5. **Arrumação** — organize o inventário do grupo: equipe itens nos heróis,
   guarde cartas na mochila, ative artefatos do grupo ou descarte excessos.
6. **Caminhos** — gaste XP se quiser, abra caminhos e escolha a próxima sala.
7. **Boss** — ao cumprir a condição de chefe, Azhakar aparece. Derrote-o para vencer.

## Condições de derrota

- Todos os heróis ficam derrotados ou indisponíveis para continuar.
- O deck de dungeon esgota e você recusa pagar 5 XP para continuar.

## Habilidades, Alvos E Ativação

O motor separa habilidades automáticas, habilidades ativas e poderes:

- Habilidades e poderes ativos usam `USE_SKILL` / `USE_POWER`.
- No PC, arraste o herói e solte sobre um inimigo válido para atacar. Clique no
  herói e depois no inimigo é o mesmo fluxo e é a alternativa obrigatória para
  touch/mobile. Cliques e arrastes cancelados não iniciam ataque.
- Quando há mais de um alvo válido, a UI abre `SkillTargetModal` e o core aguarda
  `SELECT_SKILL_TARGET`.
- Alvos são validados por `resolveManualSkillTarget`: cura e proteção só aceitam
  heróis válidos, efeitos ofensivos aceitam inimigos ativos, e efeitos pessoais
  resolvem no próprio herói.
- Habilidades ativas também podem ser usadas fora do combate quando a carta permite.
- Durante combate, usar habilidade ou poder manual bloqueia o ataque naquela
  rodada, mas permite usar item e passar. Usar item não encerra o turno.
- O botão “Usar item” lista apenas itens equipados disponíveis e pede alvo quando
  necessário. Item guardado na mochila só pode ser ativado na organização de
  espólios; fora dela, primeiro equipe-o. Consumíveis vão ao descarte; itens
  reutilizáveis ficam bloqueados por sala, salvo limite específico da carta.
- Cancelar a seleção de alvo ou pular uma escolha voluntária consome o uso quando
  a habilidade tem cooldown (poderes sempre contam como uso único); não cobra HP
  nem aplica o efeito cancelado.
- O limite “uma vez por sala” também vale fora de combate e se renova na saída
  da sala, após recompensas e reorganização.
- Bloqueios usam a camada genérica `ActivationTracker`, então heróis, itens,
  artefatos e outras entidades podem ser desativados por rodada, combate, sala
  ou jogo sem duplicar regra na UI.

Decisões e fontes: [alinhamento de ações](docs/issues/alinhamento-acoes-2026-09-08.md).

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
- Botões "Atacar", "Usar habilidade" e "Usar poder" no painel do herói quando habilitados.
- Cards de herói quando `phase = selecting_hero`.
- Cards de inimigo quando `phase = selecting_target`.
- Dados elegíveis quando há `pendingDiceSelection` (animação mais enfática `.die-eligible`).
- Opções em modais de habilidade quando existe `pendingSkillChoice` ou `pendingSkillTarget`.

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

// Usa habilidade ativa; se houver múltiplos alvos, abre pendingSkillTarget:
d({ type: "USE_SKILL", payload: { skillId: "skill_last_light_healing", sourceId: heroId } });
g().pendingSkillTarget?.candidates;

// Resolve o alvo escolhido:
const targetId = g().pendingSkillTarget?.candidates[0]?.id;
if (targetId) d({ type: "SELECT_SKILL_TARGET", payload: { targetId } });

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
