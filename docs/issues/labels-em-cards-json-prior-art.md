# Como outros jogos resolveram o problema das "labels em cards.json"

Relatório de prior art. Acompanha [`labels-em-cards-json.html`](./labels-em-cards-json.html). Não propõe solução — mostra como cinco jogos com problema análogo separaram (ou não) texto de display, dados estruturados e código de comportamento.

O eixo de análise é o mesmo da issue: **onde mora a descrição canônica do comportamento de uma habilidade, e como o sistema evita que display, dados e código divirjam silenciosamente.**

---

## 1. Hearthstone — `CardDefs.xml`: texto é display, comportamento é code-side

O `CardDefs.xml` da Blizzard (datamined, espelhado em [hsdata](https://github.com/HearthSim/hsdata) e exposto em [hearthstonejson.com](https://hearthstonejson.com/docs/cards.html)) é a maior referência pública de "JSON de cartas". A arquitetura tem três camadas bem separadas:

| Camada | Conteúdo | Quem lê |
|---|---|---|
| `<Tag name="CARDTEXT_INHAND">` (localizado) | Texto humano: *"Battlecry: Deal 2 damage."* | Apenas UI |
| `<Tag name="..."> ` numéricos/booleanos | `GameTag` enums: `BATTLECRY`, `TAUNT`, `CHARGE`, `DIVINE_SHIELD`, `DEATHRATTLE`, `SPELLPOWER=1`, `ATK=2`, `HEALTH=3`… | Engine (parcial) |
| Scripts em C# (dentro do binário) | A lógica real — *o que* `BATTLECRY` faz nesta carta específica | Engine |

**O texto NÃO dirige comportamento.** É string localizada para o jogador e nada mais. Os ~30+ `GameTag` cobrem *categorias* de mecânica (keywords genéricas: "tem Taunt?", "é Battlecry?"), mas o comportamento individual de cada carta — *quem* recebe 2 de dano, *quais* condicionais — vive em código compilado, uma classe por carta.

**Implicação para a tensão da issue:** Hearthstone resolveu o problema "label como contrato fantasma" assumindo o oposto: a label é *display*, ponto. O contrato vive no código. O `CardDefs.xml` carrega as keywords que a UI precisa renderizar (ícone de Taunt, borda dourada de Legendary) e os números que entram em fórmulas baratas (ATK, HEALTH, COST). O resto é C#.

**Custo:** uma carta nova exige código novo. Não há "data-driven content drop" — cada expansão envia binário. Mas em troca, *não existe especificação fantasma*: se a carta não foi codada, ela literalmente não existe no engine, e a UI também não a mostra. Convergência por construção.

Fontes: [HearthstoneJSON docs](https://hearthstonejson.com/docs/cards.html), [hsdata/CardDefs.xml](https://github.com/HearthSim/hsdata/blob/master/CardDefs.xml), [hearthsim.info](https://hearthsim.info/docs/cards/), [python-hearthstone enums](https://github.com/HearthSim/python-hearthstone).

---

## 2. Magic: the Gathering — Oracle text é *uma das* fontes; engine é separado

A Wizards mantém o **Oracle**: o texto autoritativo atual de cada carta já impressa, revisado a cada release ([mtg.wiki/Oracle](https://mtg.wiki/page/Oracle)). É um banco de strings — *não* um formato executável.

Cada implementação digital (MTG Arena, MTGO, e clones open-source como Forge / XMage) constrói seu próprio motor por baixo:

- **Forge** (Java) usa um DSL próprio: cada carta tem um arquivo `.txt` com linhas `A:SP$ DealDamage | NumDmg$ 2 | ValidTgts$ Creature | …` — *abilities scripted*. O Oracle text vai num campo `Oracle:` separado, só para exibição.
- **XMage** (Java) implementa cada carta em uma subclasse Java, estilo Hearthstone.
- **MTG Arena** (Wizards, fechado) é o caso mais próximo do problema da issue: o cliente exibe o Oracle text vindo de strings localizadas, e o servidor roda um motor de regras separado. Erratas e bugs aparecem quando o motor diverge do Oracle — e a Wizards trata isso como bug crítico, com hotfix.

**A pesquisa acadêmica** ([Mei et al., 2018](https://arxiv.org/pdf/1810.03744)) e fóruns de implementadores ([slightlymagic.net](https://slightlymagic.net/forum/viewtopic.php?f=27&t=17271)) chegaram à mesma conclusão: *Oracle text é quase uma linguagem formal, mas não é uma. Parser automático é viável e foi tentado, mas o vocabulário evolui set a set e a manutenção é "whack-a-mole".*

**Implicação para a issue:** o consenso de 30 anos de MTG é que **texto de jogador e código de engine são fontes paralelas que precisam de processo humano de reconciliação**. A Wizards aceitou o custo e o paga: a tabela de erratas oficial existe e é grande. Para projetos pequenos a lição é: se a label é texto humano, ela vai divergir; o que dá para fazer é tornar a divergência *visível* (Oracle público + bug tracker público + erratas explícitas) em vez de silenciosa.

Fontes: [mtg.wiki/Oracle](https://mtg.wiki/page/Oracle), [Commander's Herald: Original vs Oracle text](https://commandersherald.com/original-mtg-card-text-vs-modern-oracle-text/), [Yawgatog Oracle dumps](https://yawgatog.com/resources/oracle/).

---

## 3. Slay the Spire — template com placeholders + valores tipados em código

A MegaCrit usa um modelo intermediário, mais próximo do que `jogo-cartas-mvp1` tem hoje, mas com uma escolha-chave que evita a "label congelada".

Cada `AbstractCard` tem:

- **`DESCRIPTION`** (em `*-Cards.json` por idioma): string com placeholders, ex.: `"Deal !D! damage. NL Apply !M! Weak."`
- **`baseDamage`, `baseBlock`, `baseMagicNumber`** em campos tipados no Java
- **`rawDescription`** no runtime: a string com placeholders ainda não substituídos
- A engine substitui `!D!` → `damage`, `!M!` → `magicNumber`, `!B!` → `block` *no momento de renderizar*

O resultado: se você mudar `baseDamage` de 6 para 8 no código, o tooltip *automaticamente* passa a mostrar 8 — porque o número nunca foi gravado na string. A label e o comportamento têm uma fonte numérica única.

Para keywords semânticas (Weak, Vulnerable, Exhaust) a string usa marcadores tipo `#yWeak` que o renderer pinta de amarelo e o tutorial-system reconhece como termo enciclopédico — mas a ação que aplica Weak ainda é Java puro dentro do `use()` da carta.

**Implicação para a issue:** Slay the Spire resolve metade do problema-Frasco. A divergência do tipo *"label diz 6, código aplica 8"* desaparece — placeholders impedem a label de mentir sobre o número. Mas a divergência do tipo *"label promete condicional que o código não verifica"* (Corpo Gelatinoso) **não é coberta**: a condicional vira código `use()`, e a label correspondente continua sendo texto livre. Eles aceitam isso porque o catálogo é fechado (~350 cartas, todas escritas pela MegaCrit) e revisado manualmente.

Fontes: [BaseMod Custom Cards](https://github.com/daviscook477/BaseMod/wiki/Custom-Cards), [Say the Spire localization](https://bradjrenshaw.github.io/say-the-spire/devs/localization.html), [Module:Cards/data wiki](https://slay-the-spire.fandom.com/wiki/Module:Cards/data).

---

## 4. Yu-Gi-Oh / EDOPro (Project Ignis) — texto é DB, comportamento é Lua, *uma fonte por carta*

O ecossistema YGOPro (e seu fork Project Ignis / EDOPro) é o caso mais radical na direção *data-driven puro com script por carta*:

- **`cards.cdb`** (SQLite): só metadados estáticos — nome, texto-jogador (display), ATK/DEF, atributos, tipos. **Nenhum dado de mecânica.**
- **`c<password>.lua`** (um arquivo por carta): um script Lua que registra os efeitos via API do core (`Effect.CreateEffect`, `e:SetType`, `e:SetCondition`, `e:SetOperation`…). É o comportamento real.
- **OCGCore** (C++): o motor de regras de Yu-Gi-Oh. Não conhece cartas; conhece *primitivas* (custos, condições, alvos, timing).

Mais de 12.000 cartas implementadas dessa forma, mantidas por voluntários.

**Por que esta arquitetura sobrevive:** porque o *texto da carta no DB* é tratado explicitamente como "para o humano ler" e o *script Lua* é tratado como "o que acontece de verdade". Não há tentativa de reconciliação automática, mas há disciplina cultural: nenhuma carta é considerada "implementada" sem o `.lua`. E o motor é pequeno o suficiente para que o autor do script saiba quais primitivas existem.

**Implicação para a issue:** este é, conceitualmente, o caminho que o patch-10 (sistema de scripts) já começou a seguir. O Frasco de Óleo Incendiário com `livingEmber.ts` é exatamente um análogo do `c<id>.lua` — comportamento real expresso em código, não em string. A lição YGOPro é que, se você adota *script por carta*, a label de `cards.json` pode até continuar existindo como display, *desde que* exista uma regra clara: **cartas com comportamento não-trivial precisam de script, e a ausência de script é detectável**.

Fontes: [ygopro-scripts](https://github.com/Fluorohydride/ygopro-scripts), [Estrutura de um script](https://ygoproscripting.miraheze.org/wiki/Structure_of_a_card_script), [Project Ignis FAQ](https://projectignis.github.io/faq.html), [edopro](https://github.com/edo9300/edopro).

---

## 5. Padrões transversais

Olhando os cinco juntos, os padrões que resolvem alguma parte do problema da issue:

### a) Separar três responsabilidades, nomeá-las
Todo jogo bem-sucedido distingue:
1. **Display string** (localizada, ergonômica para humano)
2. **Metadados estruturados** (keywords/tags, números que entram em fórmulas baratas)
3. **Comportamento** (código)

Cada um tem dono, formato e ciclo de mudança próprios. A confusão na issue é justamente que `cards.json` mistura os três (a label é display, o `type`/`trigger`/`target` são metadados, e a `text` tenta ser uma quarta coisa).

### b) Não materializar números na string
O ganho mais barato e mais alto vem dos placeholders à Slay the Spire (`!D!`, `{value}`). Hearthstone faz o mesmo com `$2` que o cliente substitui pelo dano final, considerando Spell Damage. O `labelTemplate` em `skills.json` já é exatamente esta solução — o problema é que ninguém renderiza esse template; a UI lê o snapshot congelado de `cards.json`.

### c) Tornar a divergência detectável
- **Hearthstone**: convergência por construção (sem código → carta não existe).
- **MTG**: erratas públicas (divergência é detectável porque o Oracle e o motor são *ambos* públicos e comparáveis).
- **YGOPro**: ausência de `.lua` é detectável (o engine loga "card has no script").
- **Slay the Spire**: placeholders impedem uma classe inteira de divergência.

O caso da issue (Frasco) é grave porque a divergência *não* é detectável. O handler `direct_damage` aceitou `"2/3"`, devolveu `null`, e o sistema engoliu silenciosamente. Nenhum dos cinco jogos toleraria isso.

### d) Decidir quem é a fonte canônica do *comportamento* — e admitir
- Hearthstone: código.
- MTG: Oracle text (com motor seguindo atrás, e bugs reportáveis quando atrasa).
- Slay the Spire: código (string é renderização do código).
- YGOPro: script Lua.

Em todos, o texto-para-humano é *derivado ou paralelo*, nunca *origem*. A intuição da issue de que "label parece contrato" é o sintoma de uma fonte canônica não declarada. Os outros jogos declararam.

---

## 6. Resumo aplicado ao caso `jogo-cartas-mvp1`

Mapeando os achados ao estado atual do projeto:

| Sintoma na issue | Como cada jogo lidaria |
|---|---|
| Label diz "6", código aplica 8 | Slay the Spire: placeholder `!D!`. Hearthstone: `$N` substituído no cliente. |
| Label promete condicional que o handler ignora (Frasco) | YGOPro / Hearthstone: a condicional é código por carta, não string. |
| `type` em `cards.json` morto mas validado | Hearthstone só carrega `GameTag` que o engine *de fato* usa. YGOPro não tem esse campo no DB. |
| 70% dos subcampos de Ability em `cards.json` não são lidos | Todos os cinco: o que não é lido, não está no DB. |
| Especificação fantasma na label | YGOPro: regra cultural — sem script, sem carta. MTG: erratas. |

O patch-10 (script subsystem) já move o projeto para a direção YGOPro / Hearthstone para os casos não-triviais. A pergunta de design que sobra — e que a issue explicita — é **se a label de `cards.json` deve continuar sendo a string de display canônica, ou se ela vira renderização do `labelTemplate` de `skills.json`**. Os cinco jogos sugerem a segunda: que a string mostrada ao jogador seja sempre derivada, nunca digitada como snapshot.

---

## Fontes

- [HearthstoneJSON — Cards documentation](https://hearthstonejson.com/docs/cards.html)
- [HearthSim/hsdata — CardDefs.xml](https://github.com/HearthSim/hsdata/blob/master/CardDefs.xml)
- [HearthSim docs](https://hearthsim.info/docs/cards/)
- [python-hearthstone (enums, parser)](https://github.com/HearthSim/python-hearthstone)
- [MTG Wiki — Oracle](https://mtg.wiki/page/Oracle)
- [Commander's Herald — Original vs Oracle text](https://commandersherald.com/original-mtg-card-text-vs-modern-oracle-text/)
- [Yawgatog Oracle text dumps](https://yawgatog.com/resources/oracle/)
- [arXiv 1810.03744 — NN models for MTG cards](https://arxiv.org/pdf/1810.03744)
- [slightlymagic.net — Ability Text Grammar Induction](https://slightlymagic.net/forum/viewtopic.php?f=27&t=17271)
- [BaseMod — Custom Cards (Slay the Spire)](https://github.com/daviscook477/BaseMod/wiki/Custom-Cards)
- [Say the Spire — localization](https://bradjrenshaw.github.io/say-the-spire/devs/localization.html)
- [Module:Cards/data — Slay the Spire wiki](https://slay-the-spire.fandom.com/wiki/Module:Cards/data)
- [Fluorohydride/ygopro-scripts](https://github.com/Fluorohydride/ygopro-scripts)
- [YGOPRO Scripting Wiki — Structure of a card script](https://ygoproscripting.miraheze.org/wiki/Structure_of_a_card_script)
- [Project Ignis FAQ](https://projectignis.github.io/faq.html)
- [edo9300/edopro](https://github.com/edo9300/edopro)
