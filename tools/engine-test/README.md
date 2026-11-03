# Simulações da engine

Jogos pequenos que provam que `src/engine` funciona sem o Ascensão Heróica. Nada aqui usa conteúdo do jogo. Detalhes em `docs/ENGINE_TEST.md`.

## Como ativar

```bash
npm run engine-test
```

Para rodar uma simulação só:

```bash
npx vitest run --config tools/engine-test/vitest.config.ts tools/engine-test/rpg
```

Para ver a cobertura da engine:

```bash
npm run engine-test:coverage
```

As simulações são testes: mostram o resultado no terminal e não abrem tela.

## O que tem aqui

| Pasta | Simulação |
|---|---|
| `nano/` | Jogo mínimo de cartas |
| `deckbuilder/` | Construção de baralho |
| `tcg/` | Jogo de cartas com janela de resposta e informação oculta |
| `rpg/` | "Margem do Lago Turvo": personagem com vida, mana, armadura, habilidades, status e ambiente (`docs/F11_SPEC.md`) |
| `scenarios/` | Um caso YAML por comportamento, em `scenarios/cases/` |

## Como acrescentar

- **Comportamento novo:** crie um arquivo em `scenarios/cases/`, usando os existentes como modelo.
- **Jogo novo:** crie uma pasta com o conteúdo e um `*.test.ts`, importando só de `src/engine`.
