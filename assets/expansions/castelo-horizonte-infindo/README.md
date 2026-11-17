# O Castelo do Horizonte Infindo — expansão em preparação

## Estado atual

Pacote criado a partir de `dev` para receber os atributos, habilidades, artes e a integração da expansão.

**Ainda não está ativado em `assets/expansions/config.json`**. Isso é intencional: o catálogo completo, as imagens e as habilidades estão em produção e não devem afetar as aventuras existentes.

### Conteúdo já cadastrado

- `expansion.json`: **4 heróis humanos, 18 criaturas e 2 subchefes** — 24 cartas com atributos preliminares.
- `boss.json`: **Therion, Rei do Horizonte Infindo** — ficha de chefe com 20 de Vida-base, 11 de Acerto-base, 5 de Dano e 3 dados; requer 3 artefatos e escala +2 de Vida/+1 de Acerto por nível de Despertar.
- Distribuição das criaturas: **5 fáceis (1 XP), 8 médias (2 XP), 5 difíceis (3 XP)**.
- Subchefes: **Campeão da Manada Cruel** e **Marechal Hobgoblin dos Tributos**, ambos de 4 XP, 1 artefato como recompensa.

Atributos `life`, `hitBonus` e `diceByColor` usam cinco posições na ordem **Branco / Amarelo / Laranja / Vermelho / Roxo**. O campo `damage` é fixo antes de habilidades.

As cartas de criaturas/subchefes têm `reward` e `rewardType` preenchidos. Os campos `skills` estão como arrays vazios apenas **por enquanto**, para permitir a integração posterior das habilidades sem fingir que já estão implementadas.

## Conteúdo a completar antes de ativar

- [ ] Integrar as artes PNG/WebP de heróis, criaturas, subchefes e Therion.
- [ ] Vincular cada `image: "images/<arquivo>.webp"` quando o arquivo correspondente existir.
- [ ] Incorporar as definições e referências das habilidades produzidas na conversa/branch especializada.
- [ ] Criar 10 salas comuns e 2 salas de subchefes.
- [ ] Criar 26 recompensas: 4 armas, 2 escudos, 5 vestimentas, 3 consumíveis, 2 utilitários, 4 especiais com Saque Mágico e 6 aliados.
- [ ] Criar 5 artefatos e suas habilidades.
- [ ] Implementar/confirmar suporte genérico para cartas `type: "ally"`, slot exclusivo, bônus passivos e efeitos ambientais.
- [ ] Incluir textos, abertura, localização e referências de imagens.
- [ ] Adicionar `castelo-horizonte-infindo` a `assets/expansions/config.json` somente quando o pacote completo estiver pronto.
- [ ] Rodar o `audit` e ajustes de balanceamento **localmente**, por decisão do responsável pelo projeto.

## Diretrizes de balanceamento

- O Castelo prioriza criaturas de vida elevada, dano moderado e funções táticas.
- O **Homem-Urso das Pedreiras** é tanque por **vida elevada e acerto baixo**; não lhe acrescentar bloqueio permanente sem discutir o impacto no audit.
- O **Marechal Hobgoblin dos Tributos** deve representar controle e comando, não dano bruto.
- **Therion** deve se destacar pelas habilidades ligadas ao ritual e à Pedra-Matriz; não mudar seus atributos-base sem análise.
- Os quatro heróis devem permanecer **humanos**.
- Os seis aliados são uma mecânica própria; não substituir os talismãs das expansões antigas.

## Trabalho paralelo

**Branch principal de integração:** `codex/expansao-castelo-horizonte-infindo-20261116`  
**Base:** `dev`

Para reduzir conflitos, concentrar alterações de atributos e montagem de cartas em `expansion.json`/`boss.json`. A implementação de novas habilidades e sistemas genéricos pode acontecer em branch própria, seguida de integração controlada nesta branch.

Não monitorar CI/CD ou deploy após os commits.
