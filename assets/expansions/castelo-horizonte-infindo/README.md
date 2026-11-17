# O Castelo do Horizonte Infindo — integração de playtest

## Pacote habilitado

A expansão **O Castelo do Horizonte Infindo** está registrada com `enabled: true` em `assets/expansions/config.json` **nesta branch** (`codex/expansao-castelo-horizonte-infindo-20261116`). Isso não altera `dev`, `hml` ou `main` até que a branch seja integrada.

- `expansion.json`: **67 cartas** (versão v1.1.0), sendo 4 heróis humanos, 18 criaturas (5×1 XP, 8×2 XP, 5×3 XP), 2 subchefes (4 XP), 10 salas comuns, 2 salas de subchefes, 20 itens, 6 aliados e 5 artefatos.
- `boss.json`: **Therion, Rei do Horizonte Infindo** — 68ª carta, com quatro habilidades exclusivas e cinco neutralizações por artefatos.
- `images/`: **68 WebPs** válidos e vinculados às 68 cartas; os 68 PNGs originais estão em `imagedata/cards/expansions/castelo-horizonte-infindo/`.
- `ART_REPORT.md` documenta a produção e nomes exatos das artes.
- `ABILITIES_HANDOFF.md` documenta o motor genérico entregue, inclusive a mecânica de aliados, escuridão e engenharia ressonante.

## Balanceamento das salas de artefato (v1.1.0)

A expansão **continua com 67 cartas**, exatamente como a Torre da Grande Bruxa. Nenhuma sala foi adicionada; as duas salas criadas provisoriamente no ajuste anterior foram excluídas.

- **Salão das Bandeiras Rasgadas** (`room_torn_banners_hall`): agora 3 XP e 1 artefato como recompensa, em vez de 2 XP e 1 item.
- **Armazém dos Tributos Perdidos** (`room_lost_tributes_warehouse`): agora 3 XP e 1 artefato como recompensa, em vez de 2 XP e 1 item.
- Quantidade de inimigos, habilidades, saídas e artes das salas preservadas. Ambas ficam bloqueadas até a quinta sala pela regra de XP >= 3.
- Como na Fornalha e na Bruxa, o Castelo tem **2 salas comuns que concedem artefatos** e **2 salas de subchefe que concedem artefatos**, totalizando 4 tipos de sala.
- O baralho do Castelo volta a ter 22 cartas de sala: 10 salas comuns × 2 cópias + 2 salas de subchefe.

## Regras preservadas

**Aliados:** `type: "ally"`, um slot específico por herói, nunca guardáveis na mochila. Um aliado não recrutado é descartado definitivamente, e o motor impede seu retorno na mesma partida. Substituir o aliado atual também dispensa o antigo.

**Escuridão:** determinada por habilidade de sala (`dungeon_skill_environment_darkness`). O clima permanentemente escuro da ambientação não implica penalidade automática em cada sala; equipamentos como Lanterna do Último Vigia compensam a penalidade de acerto nas salas marcadas.

**Therion:** atributos naturais de **20 Vida, 11 Acerto, 5 Dano e 3 dados**, somados aos bônus do ritual (+6 Vida, +4 Acerto, +2 Dano), antes do escalonamento (+2 Vida/+1 Acerto por Despertar). É preciso coletar **pelo menos 3 artefatos**. O grupo pode reunir até 5 para reduzir a dificuldade.

| Artefato | Neutralização |
| --- | --- |
| Arco do Vento Infindo | Remove +4 de Acerto do ritual |
| Elmo do Primeiro Cavaleiro das Estepes | Remove +2 de Dano do ritual |
| Brasão dos Inquebráveis | Remove +6 de Vida do ritual |
| Estandarte do Castelo Esquecido | Anula Domínio do Horizonte |
| Grilhão da Vigília Partida | Anula Ressonância da Pedra-Matriz |

**Habilidades de Therion:** Investida Real (+2 Acerto no primeiro ataque), Domínio do Horizonte (−1 Acerto dos heróis), Ressonância da Pedra-Matriz (−1 no primeiro dano recebido por rodada) e Última Conquista (+2 Acerto com metade da vida ou menos, sem acumular).

## Habilidades ligadas na integração

- Itens e aliados utilizam os efeitos genéricos já implementados (`item_skill_equipped_* `, `item_skill_room_damage_protection`, `item_skill_illumination_against_darkness`, `item_skill_mystic_draw`).
- Comandantes utilizam `skill_group_command_accuracy` ou `skill_group_command_protection`; algumas criaturas reutilizam emboscadas, esquiva e a habilidade `skill_lone_beast`.
- As quatro fichas de herói têm habilidades/poderes para o primeiro playtest (o Andarilho reutiliza os existentes `skill_illuminate_path` e `power_restored_path`).
- Foram adicionados efeitos declarativos próprios para Sangramento da Faca Serrilhada, Frasco de Luz, Tambor de Guerra, poções e proteção de ataque dos equipamentos.

### Atenção no audit local

1. O **Batedor do Horizonte** usa proteção no primeiro dano recebido durante o combate (`castle_skill_horizon_scout_ward`); isso representa uma aproximação da habilidade de primeiro ataque e exige auditoria das janelas de combate.
2. Os benefícios dos **cinco artefatos** estão concentrados no enfraquecimento de Therion. Não foram adicionados bônus extras para heróis, para evitar superar o balanceamento da Bruxa antes do audit.
3. A quantidade de Vida elevada do **Homem-Urso das Pedreiras** deve ser avaliada quanto à duração das partidas; não adicionamos blindagem fixa extra.
4. Algumas habilidades e os parâmetros dos itens e heróis foram associados como base inicial do playtest e podem ser refinados após o relatório de leveling.
5. As salas vinculam efeitos de escuridão, pressão ressonante, Saque Mágico e efeitos da Fornalha quando reutilizáveis.
6. Não foi introduzida uma abertura cinematográfica nova, pois o pacote de artes não inclui imagens de `abertura/intro.json`. O jogo deverá iniciar pela seleção normal até produção posterior.

**Não executar CI/CD nem monitorar deploy.** O responsável pelo projeto executa build, testes e `audit` localmente.

## Abertura cinematográfica

O Castelo usa o player existente de abertura após a seleção de Therion na tela de preparação.

- Registro: `expansion.json → openings.boss_therion_infinite_horizon_king = "abertura/intro.json"`.
- Roteiro: `abertura/intro.json`, com **9 cenas**, efeito de câmera e transição fade.
- Artes de reprodução: `abertura/images/scene-01.webp` a `scene-09.webp`; são referências Git aos mesmos blobs das artes já produzidas em `assets/openings/castelo-horizonte-infindo/images/`. As imagens originais permanecem intactas.
- Legendas: `locales/pt-BR/game.json`, `locales/en-US/game.json` e `locales/es-ES/game.json`, namespace `opening.castelo`.
- Música provisória: `sounds/music/Sangue e aço.mp3`. Para substituí-la, adicionar o MP3 desejado ao diretório `sounds/music/` e atualizar somente `abertura/intro.json → audio.fileName`.
- Controles já existentes: avançar, voltar, pular, iniciar aventura, play/pause e volume.
- As imagens são copiadas ao caminho público pelo plugin já existente do Vite durante o build/servidor; nenhuma lógica nova de UI é necessária.

Esta integração não acrescenta autoplay de mudança de cena nem modifica a abertura das demais expansões.

## Regra de equipamento: aliado OU amuleto (slot compartilhado)

- Cada herói possui apenas **um espaço de amuleto/aliado**. As cartas `type: "ally"` mantêm esse tipo próprio, mas equipam no slot físico `amulet`.
- **Nunca** é possível manter aliado e amuleto equipados simultaneamente no mesmo herói.
- Recrutar um aliado sobre um amuleto desloca o amuleto (volta à mesa ou à mochila conforme a origem).
- Colocar um amuleto sobre um aliado aposenta o aliado **definitivamente**, impedindo que reapareça na mesma partida.
- Transferir um aliado diretamente entre dois slots de amuleto é permitido; o substituído, quando também é aliado, é aposentado.
- Regras de mochila, Vida máxima e demais efeitos equipados continuam vigentes.
- Snapshots antigos com slot `ally` são migrados para `amulet`; se possuíam ambos, o antigo amuleto fica na mochila, preservando-o mesmo se exceder temporariamente a capacidade.
