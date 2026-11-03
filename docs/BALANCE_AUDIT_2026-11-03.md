# Auditoria de equilíbrio — 3 de novembro de 2026

## Pergunta

Cada um dos oito heróis consegue vencer na dificuldade `normal`? A vitória solo tem peso maior que a vitória em equipe.

## Método

- Bot `power-player`, dificuldade `normal`, limite de 1.000 ações por partida.
- Solo: 100 seeds idênticas (1–100) para cada herói, 800 partidas.
- Equipes: todas as 56 composições possíveis de três heróis, nas mesmas cinco seeds (1–5), 280 partidas. Cada herói aparece em 21 composições e 105 partidas.
- Vitória, derrota e impasse são resultados separados. O intervalo de 95% é Wilson sobre as partidas observadas; nas equipes, há dependência entre resultados que compartilham seed e parceiros, então o intervalo é apenas descritivo.
- Relatórios completos por partida: `tools/bot/runs/balance-2026-11-03T17-11-33-764Z/` (solo) e `tools/bot/runs/balance-2026-11-03T17-05-34-095Z/` (equipes). A pasta `runs` é ignorada pelo Git.

## Solo — dificuldade normal

| Herói | Vitórias / 100 | Salas limpas em média |
|---|---:|---:|
| Bárbaro Rubro | 2 | 3,6 |
| Paladino da Última Luz | 10 | 3,3 |
| Clérigo do Descanso Eterno | **0** | 1,8 |
| Ladino das Fendas | **0** | 1,8 |
| Guerreiro do Bastião Partido | 5 | 3,5 |
| Necromante do Véu Profundo | **0** | 1,9 |
| Mago das Runas Rubras | **0** | 1,7 |
| Caçador do Véu Partido | 4 | 3,5 |

Não houve impasses nessas 800 partidas: os resultados sem vitória terminaram em derrota. Zero em 100 partidas não prova impossibilidade, mas o limite superior aproximado de 95% para a taxa de vitória de cada um desses quatro heróis é 3,7% sob este bot.

## Equipes de três — dificuldade normal

| Herói presente | Vitórias / 105 |
|---|---:|
| Bárbaro Rubro | 41 (39,0%) |
| Paladino da Última Luz | 49 (46,7%) |
| Clérigo do Descanso Eterno | 45 (42,9%) |
| Ladino das Fendas | 42 (40,0%) |
| Guerreiro do Bastião Partido | 51 (48,6%) |
| Necromante do Véu Profundo | 41 (39,0%) |
| Mago das Runas Rubras | 36 (34,3%) |
| Caçador do Véu Partido | 58 (55,2%) |

Todos os heróis participaram de equipes vencedoras. Das 56 composições, 54 venceram pelo menos uma das cinco seeds. As duas restantes foram repetidas em mais 30 seeds: Bárbaro–Ladino–Mago venceu 9/30; Ladino–Necromante–Mago venceu apenas 1/30. Esta última composição merece atenção, mas o resultado ainda mistura força das cartas, equipamentos sorteados e escolhas do bot.

A seed teve grande efeito: entre os 56 trios, a seed 1 rendeu 1 vitória e a seed 4 rendeu 42. A dificuldade percebida em `normal` varia bastante conforme a partida sorteada.

## Verificações para interpretar o resultado

- Os quatro heróis com 0/100 solo têm dano base 2. Os quatro que venceram têm dano base 3 ou 4, conforme `src/data/cards.yaml`. A dificuldade `normal` começa com `heroOffset: 0` em `src/data/balance.json`.
- Como aproximação de um início mais forte, 30 seeds solo foram repetidas no `easy`, que dá `heroOffset: 1` e reduz o custo de recuperar a masmorra. Clérigo, Ladino e Mago venceram 1/30 cada; Necromante 2/30. Os quatro heróis ofensivos venceram 14–20/30. Esse contraste sugere que um único degrau geral de atributos ajuda pouco os heróis de suporte e não é uma correção equilibrada por si só.
- O perfil `speedrunner` perdeu todas as 100 seeds solo de cada herói. Portanto, o desempenho do bot depende muito da política de ação. A auditoria mede o jogo **junto com** o jogador automatizado, não o máximo que um jogador humano pode alcançar.
- O Mago pode legalmente selecionar a si mesmo para a Runa; o bot foi corrigido para considerar essa opção. Em 100 seeds repetidas, continuou em 0 vitórias solo. O bot ainda não otimiza compras, distribuição de equipamentos nem planos de várias rodadas, de modo que sua taxa pode subestimar a força do Mago e dos demais.

## Conclusão e próximos ajustes candidatos

A meta de **vitória solo observável para todos** não foi atingida em `normal` com o bot atual. A meta de **vitória em equipe com parceiros variados** foi atingida para cada herói, mas Caçador e Mago ficaram nas pontas das taxas de vitória, e Ladino–Necromante–Mago teve desempenho particularmente baixo.

Antes de alterar cartas para todas as modalidades, vale testar compensações **exclusivas de partidas solo** para heróis de suporte e melhorar no bot a avaliação de cura, equipamento e ações que preparam turnos futuros. Depois, repetir as mesmas seeds e comparar vitórias, salas limpas e impasses. A escolha de uma taxa de vitória solo desejada continua sendo uma decisão de design.

## Reproduzir

```bash
npm run bot:balance -- --mode solo --solo-seeds 100 --seed 1 --max-steps 1000 --profile power-player --difficulty normal
npm run bot:balance -- --mode team --team-seeds 5 --seed 1 --max-steps 1000 --profile power-player --difficulty normal
```
