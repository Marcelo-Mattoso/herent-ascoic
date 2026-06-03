# Issue: formato slash-pair "a/b" em skills DSL triggered

**Status:** workaround aplicado. Investigação pendente.
**Descoberto em:** 2026-06-03

---

## Problema

Quando uma skill `op_triggered` usa `value: $value` em um nó `p_modifier` e o param
`value` está no formato slash-pair `"a/b"` (ex: `"2/2"`), o `resolveExpr` lançava
`Error: param "value" não é número: 2/2`, travando silenciosamente o dispatch da action
que disparou o trigger.

### Caso concreto

`skill_lone_beast` no **Ogro do Salão Arruinado**:
```json
{ "skillId": "skill_lone_beast", "params": { "value": "2/2" } }
```

A skill é `op_triggered` com `trigger: evt_combat_start`. Ao clicar em
**Iniciar combate** com o Ogro em jogo, `START_COMBAT` travava sem feedback.

---

## Causa raiz

O formato `"a/b"` foi introduzido no path manual (`dispatch.ts`) para skills com dois
modificadores distintos — o primeiro número vai para o primeiro efeito, o segundo para o
segundo. `dispatch.ts` já fazia `split("/")[0]` ao extrair o valor numérico.

O path DSL triggered (`effectResolver.ts` → `evaluate`) não tinha esse tratamento:
`resolveExpr` chamava `Number("2/2")` → `NaN` → `throw Error`.

---

## Workaround aplicado

**`resolveExpr.ts`** — ao encontrar param string no formato `"a/b"`, toma o primeiro
segmento (`split("/")[0]`), consistente com `dispatch.ts`.

**Limitação:** ambos os nós `p_modifier` da skill recebem o mesmo valor (primeiro
segmento). Para `"2/2"` não faz diferença. Para valores assimétricos como `"3/5"` o
segundo modificador usaria `3` em vez de `5` — comportamento incorreto.

---

## Investigação pendente

- [ ] Auditar todas as skills com `value` no formato `"a/b"` que passam pelo path DSL
  triggered, verificar se alguma tem valores assimétricos entre os segmentos.
- [ ] Decidir o design correto para o problema: usar params separados (`$value_a`,
  `$value_b`) ou introduzir um mecanismo de índice no `evaluate` para slash-pairs.
- [ ] Se o formato `"a/b"` for exclusivo do path manual (`op_active`), adicionar
  validação no schema para proibir slash-pair em skills `op_triggered`.
