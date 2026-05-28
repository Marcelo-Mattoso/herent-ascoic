# Patch-3 — Tela de gerenciamento de inventário do grupo

## Contexto

A tela atual de "recompensa de item" (modal em duas etapas: escolher herói → equipar/guardar/descartar) será substituída por uma tela única de gerenciamento de inventário do grupo inteiro. A nova tela funciona como uma **bancada de organização**: o jogador despeja itens novos (drop) numa "mesa", redistribui entre os heróis, e o que ficar na mesa é descartado ao sair.

O wireframe de referência está no arquivo `wireframe-inventario.html`.

## Objetivos do patch

1. Implementar a nova tela de inventário do grupo (substitui o modal atual de recompensa).
2. Suportar de 1 a 8 heróis ativos no grupo.
3. Suportar artefatos de grupo (com e sem requisito de portador).
4. Manipulação por **drag & drop** entre todas as zonas.
5. Scroll horizontal da lista de heróis com **mouse arrastando** (estilo "mãozinha").
6. Confirmação inline no rodapé quando há itens na mesa ao tentar sair.

## Pré-requisitos arquiteturais

Antes de codar a UI, garantir que o motor (engine) exponha o contrato abaixo. **A UI não deve ter lógica de jogo — só chama ações no motor e renderiza estado.**

### Modelo de dados

```js
Item = {
  id: string,
  nome: string,
  tipo: "equipamento" | "consumivel" | "chave" | "artefato",
  escopo: "individual" | "grupo",
  requerPosse: boolean,   // só relevante quando escopo = "grupo"
  // outras propriedades específicas do item (atributos, efeitos, etc.)
}

EstadoInventario = {
  mesa: {
    itens: Item[],          // itens comuns na mesa
    artefatos: Item[]       // artefatos de grupo na coluna amarela
  },
  grupo: {
    artefatosAtivos: [      // máximo 2
      { item: Item, portadorId: string | null },
      { item: Item, portadorId: string | null } | null
    ]
  },
  herois: [
    {
      id: string,
      nome: string,
      slots: [Item|null, Item|null, Item|null, Item|null],   // 4 slots
      mochila: (Item|null)[],   // 8 espaços
      statusBase: { ... },      // atributos sem itens
      statusEfetivo: { ... }    // atributos com itens equipados (calculado)
    }
  ]
}
```

### Ações do motor

```js
engine.applyAction({ type, ...payload })
```

Ações necessárias:

- `MOVER_ITEM { itemId, paraZona, paraSlot? }` — move um item entre zonas. `paraZona` é uma das: `"mesa.itens"`, `"mesa.artefatos"`, `"grupo.vaga.0"`, `"grupo.vaga.1"`, `"heroi.{id}.slot.{0..3}"`, `"heroi.{id}.mochila.{0..7}"`.
- `ATRIBUIR_PORTADOR { vagaIndex, heroiId | null }` — atribui ou remove o portador de um artefato de grupo.
- `DESCARTAR_MESA {}` — descarta tudo que está na mesa (chamado ao sair com mesa não vazia).

Cada ação retorna `{ ok: boolean, eventos: Evento[], error?: string }` e atualiza o estado. A UI escuta os eventos pra animar / re-renderizar.

### Regras de validação (no motor)

**Zonas e o que aceitam:**

| Zona | Aceita |
|------|--------|
| `mesa.itens` | item escopo individual |
| `mesa.artefatos` | item escopo grupo (qualquer) |
| `grupo.vaga.N` | item escopo grupo (qualquer); máx 2 vagas no grupo |
| `heroi.X.slot.0..3` | item equipável escopo individual |
| `heroi.X.mochila.N` | item escopo individual (qualquer herói pode carregar item de qualquer outro) |

Regras adicionais:
- Artefato de grupo **só** vive em `mesa.artefatos` ou `grupo.vaga.N`. Nunca vai pra slot de herói nem pra mochila.
- Mesa tem capacidade praticamente ilimitada (mas o jogador vai querer esvaziar — o que ficar é descartado).
- Mochila aceita até 8 itens; quando cheia, drop em mochila falha (motor retorna `ok: false`).
- Slots do herói: cada slot aceita 1 item; tentar largar em slot ocupado **troca** os dois itens (item antigo volta pra origem do que foi arrastado).

### Função auxiliar de status reativo

A UI vai precisar calcular o status efetivo do herói em tempo real durante o drag (antes de confirmar a ação). Expor:

```js
engine.simularStatus(heroiId, slotsHipoteticos) → status
```

Recebe a configuração hipotética de slots e devolve o status que o herói teria. Não muda o estado real.

## Estrutura da tela

Hierarquia em três blocos verticais:

1. **Mesa** (topo) — duas colunas lado a lado: itens (esquerda, maior) e artefatos de grupo em amarelo (direita, ~220px).
2. **Grupo — artefatos ativos** (meio) — duas vagas lado a lado. Cada vaga ocupada mostra o artefato e um combo `<select>` pra escolher portador. Vaga vazia mostra placeholder pontilhado.
3. **Heróis** (base) — linha horizontal com scroll. Cada card de herói tem, de cima pra baixo: 4 slots, slot amarelo de posse, carta do herói, status, mochila (grid 4×2), nome.
4. **Rodapé** — checkbox de confirmação + botão de saída. Comportamento dinâmico (ver seção própria).

Todos os "slots" (na mesa, no grupo, no herói) têm o mesmo tamanho visual (36×36 px). Item é item, em qualquer lugar.

## Drag & drop

### Biblioteca recomendada

Usar **HTML5 Drag and Drop API nativa**. Não puxar lib externa — o caso de uso é simples e a API nativa cobre. Se precisar de polyfill mobile, considerar `interact.js`, mas começar sem.

### Estados visuais durante o drag

Quando o jogador começa a arrastar um item:

1. O item arrastado fica com `opacity: 0.4` (a UI mostra que ele "saiu" do lugar).
2. **Todas as zonas válidas** ganham borda tracejada azul + leve fundo azul-claro (`--drop-valid`).
3. **Todas as zonas inválidas** ficam com `opacity: 0.25` (apagadas).
4. Ao passar o cursor sobre uma zona válida, ela escurece um pouco (hover state).
5. Ao soltar:
   - Em zona válida → motor processa, UI anima a transição.
   - Em zona inválida ou fora da tela → item volta pra origem com animação suave.

### Lógica de "zona válida"

A UI pergunta ao motor antes de pintar:

```js
engine.zonaAceita(itemId, zona) → boolean
```

Centraliza a regra no motor; a UI só consulta.

### Eventos a implementar

```js
slot.addEventListener('dragstart', e => { ... })
slot.addEventListener('dragover', e => { e.preventDefault(); /* só se for zona válida */ })
slot.addEventListener('dragenter', e => { /* visual highlight */ })
slot.addEventListener('dragleave', e => { /* remove highlight */ })
slot.addEventListener('drop', e => { engine.applyAction({ type: 'MOVER_ITEM', ... }) })
slot.addEventListener('dragend', e => { /* limpa todos os estados visuais */ })
```

Passar o `itemId` via `e.dataTransfer.setData('text/plain', itemId)` no dragstart.

### Comportamento em mobile (touch)

Drag & drop nativo HTML5 não funciona bem em touch. Soluções, em ordem de preferência:

1. **Adiar suporte mobile** (MVP é desktop primeiro).
2. Adicionar polyfill: `mobile-drag-drop` ou `interact.js`.
3. Implementar fallback de "tap-to-select, tap-to-place" só pra touch (clique no item destaca, clique em zona válida move).

Para o patch-3, **implementar só desktop**. Mobile vira patch separado.

## Scroll horizontal arrastável (mãozinha)

A linha de heróis precisa scrollar horizontal. Duas formas funcionam em paralelo:

1. **Scroll nativo** — trackpad horizontal, shift+scroll, swipe touch.
2. **Click-and-drag** — usuário pressiona com mouse e arrasta a área lateralmente.

### Implementação do click-and-drag

No container `.herois-scroll`:

```js
let isDown = false;
let startX, scrollLeft;
const slider = document.querySelector('.herois-scroll');

slider.addEventListener('mousedown', e => {
  // só ativa se NÃO clicou em item arrastável
  if (e.target.closest('.item')) return;
  isDown = true;
  slider.classList.add('arrastando');
  startX = e.pageX - slider.offsetLeft;
  scrollLeft = slider.scrollLeft;
});

slider.addEventListener('mouseleave', () => { isDown = false; slider.classList.remove('arrastando'); });
slider.addEventListener('mouseup', () => { isDown = false; slider.classList.remove('arrastando'); });

slider.addEventListener('mousemove', e => {
  if (!isDown) return;
  e.preventDefault();
  const x = e.pageX - slider.offsetLeft;
  const walk = (x - startX) * 1.5;
  slider.scrollLeft = scrollLeft - walk;
});
```

### CSS do cursor

```css
.herois-scroll { cursor: grab; }
.herois-scroll.arrastando { cursor: grabbing; }
.herois-scroll .item { cursor: grab; }  /* itens mantêm cursor próprio */
```

### Coexistência com drag de itens

**Crítico:** o mousedown do scroll só ativa se o alvo do clique NÃO for um `.item`. Senão, arrastar um item dispararia o scroll. O `e.target.closest('.item')` resolve isso.

Detalhe extra: o handler de scroll usa `mousedown/mousemove/mouseup`. O drag de item usa `dragstart/dragover/drop`. Esses dois conjuntos de eventos não conflitam diretamente — quando o usuário começa um drag nativo, os eventos de mouse param. Mas o `mousedown` ainda dispara antes do `dragstart`, então a checagem do `closest('.item')` é o que evita iniciar scroll erroneamente.

## Rodapé dinâmico

Comportamento por estado:

| Estado da mesa | UI do rodapé |
|----------------|--------------|
| Vazia | Só botão "Sair" (ativo). Sem checkbox. |
| Tem 1 ou mais itens | Checkbox "Confirmo descartar N itens da mesa" + botão "Descartar e sair" (desabilitado até checkbox marcado). |

A contagem N é dinâmica: atualiza em tempo real conforme o jogador move itens pra dentro / fora da mesa.

Ao clicar "Descartar e sair":
1. UI chama `engine.applyAction({ type: 'DESCARTAR_MESA' })`.
2. Motor remove os itens da mesa do estado de jogo (perdidos permanentemente).
3. UI fecha a tela e volta pra tela anterior (mapa, batalha, o que estiver no contexto).

## Combo de portador

Para cada artefato ativo no grupo com `requerPosse: true`:
- `<select>` com opções: cada herói do grupo (8 ou menos) + opção "— sem portador —".
- Mudança no select dispara `engine.applyAction({ type: 'ATRIBUIR_PORTADOR', vagaIndex, heroiId })`.
- Se o artefato é `requerPosse: false`, o combo não aparece — o artefato fica ativo passivamente pro grupo todo.

**Regra de unicidade:** o mesmo herói pode ser portador de mais de um artefato (não há limite por herói, só do grupo total = 2 artefatos).

## Status reativo

Durante o drag de um item sobre um slot do herói:

1. Antes de soltar, UI chama `engine.simularStatus(heroiId, slotsHipoteticos)`.
2. UI atualiza o bloco "status" do herói com os valores hipotéticos, destacando deltas (verde pra ganho, vermelho pra perda).
3. Ao cancelar o drag ou soltar fora, status volta ao real.
4. Ao soltar dentro, ação é aplicada e o status já estava certo (vira o real).

Isso ajuda muito a decidir trocas de equipamento sem precisar clicar pra confirmar.

## Ponto de entrada e integração

A tela substitui o modal atual de recompensa. Onde antes havia:

```js
abrirModalRecompensa(itensGanhos)
```

Substituir por:

```js
abrirInventarioGrupo({
  itensGanhos: [],           // entra na mesa, parte branca
  artefatosGanhos: [],       // entra na mesa, parte amarela
  origem: 'recompensa' | 'mapa' | 'menu'   // afeta o que acontece no "sair"
})
```

A tela é a mesma sempre, só varia o que vem pré-carregado na mesa.

## Persistência durante a sessão

Enquanto a tela está aberta, todas as ações afetam o estado real do motor (não há "cancelar tudo"). Isso é proposital: o jogador pode fechar e abrir a tela em outro momento e ver as mudanças mantidas.

Exceção: itens na mesa **não são commitados** ao estado de jogo até a saída. Se o jogador fechar a aba do navegador com itens na mesa, o que decidir aqui depende do projeto:
- Opção A (mais simples): considera "saída suja" como descarte, perde os itens.
- Opção B: persiste estado da mesa pra próxima vez que abrir.

Para o patch-3, **opção A**. Documentar na UI ou em tooltip.

## Critérios de aceitação

Funcionalidade:
- [ ] 8 heróis visíveis com scroll horizontal funcionando (nativo + mãozinha).
- [ ] Drag & drop entre todas as zonas, com validação visual em tempo real.
- [ ] Artefato de grupo só pode ser largado em zonas amarelas; item comum só em zonas brancas.
- [ ] Limite de 2 artefatos ativos no grupo (terceiro não entra).
- [ ] Combo de portador funciona para artefatos com `requerPosse: true`.
- [ ] Status do herói atualiza em tempo real durante drag sobre slots.
- [ ] Rodapé muda dinamicamente entre estado vazio e estado com confirmação.
- [ ] Botão de descarte só ativa com checkbox marcado.
- [ ] Mesa vazia pula a confirmação.

Arquitetura:
- [ ] Toda lógica de jogo (validação, regras, cálculo) está no motor.
- [ ] UI apenas chama `engine.applyAction(...)`, `engine.zonaAceita(...)`, `engine.simularStatus(...)`.
- [ ] Trocar a UI por outra (CLI, mobile, etc.) não exige mudar o motor.

Qualidade:
- [ ] Tela funciona com 1, 2, 4 e 8 heróis no grupo (testar os extremos).
- [ ] Drag de item não dispara scroll horizontal acidentalmente.
- [ ] Scroll horizontal não dispara drag de item acidentalmente.
- [ ] Slot ocupado faz swap correto ao receber drop.
- [ ] Animações de transição (~150ms) em mudanças de estado, sem flicker.

## O que NÃO está no escopo deste patch

- Suporte a drag & drop em mobile / touch.
- Animações elaboradas (partículas, glow, etc.) além das transições básicas.
- Tooltips de detalhe do item ao hover (vira patch separado).
- Comparação visual lado-a-lado de dois itens equipáveis (vira patch separado).
- Filtros / busca dentro da mochila (não há volume suficiente que justifique).
- Sistema de "favoritar" item pra não descartar por engano (intencionalmente fora — a regra "mesa = descarte" precisa ser severa pra ensinar a mecânica).

## Ordem sugerida de implementação

1. **Motor primeiro**: modelo de dados, ações, validações, `zonaAceita`, `simularStatus`. Testar via console (gameshark mental).
2. **Estrutura HTML estática**: replicar o wireframe sem interação, populando do estado do motor.
3. **Drag & drop**: dragstart/dragover/drop básicos, com `zonaAceita` ditando aceitação.
4. **Feedback visual durante drag**: highlight de zonas válidas, dim de inválidas.
5. **Status reativo**: integrar `simularStatus` durante hover de drop.
6. **Scroll arrastável**: implementar mousedown/move/up no container de heróis.
7. **Combo de portador**: render dinâmico das vagas do grupo + handler de change.
8. **Rodapé dinâmico**: estado vazio vs estado com confirmação.
9. **Polish**: transições, ajustes finos de cursor, edge cases.

Cada etapa deve ser testável isolada da seguinte.
