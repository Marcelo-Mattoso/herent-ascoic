# A Torre da Grande Bruxa do Caldeirão — catálogo v1.3

## Inventário
- 4 heróis, 18 criaturas, 2 subchefes, 10 salas comuns, 2 salas de subchefe, 24 itens, 4 artefatos.
- 64 cartas em `expansion.json` + 1 chefe em `boss.json` = **65 cartas**.
- Os 12 heróis do jogo continuam compartilhados.

## Novas cartas da versão 1.3
- **6 criaturas:** Javali de Espinhos Retorcidos, Sapo do Caldeirão, Enxame de Sanguessugas do Brejo, Mulher-Liana Lamentosa, Treante de Casca Podre, Coruja Enfeitiçada.
- **2 salas:** Galeria dos Ovos de Aranha (2 saídas, 2 XP, 1 artefato; Teias da Galeria) e Herbário da Bruxa (3 saídas, 2 XP, 1 artefato; Ervas Contaminadas).
- **14 itens:** 10 equipamentos/consumíveis e **4 Saques Mágicos**: Baú Tomado de Musgo, Dados de Osso do Oráculo, Mapa de Galho Retorcido, Reserva do Caldeirão. Os quatro podem ser usados na fase de recompensa, são removidos ao usar e empregam `item_skill_mystic_draw`.
- **1 artefato:** Glândula da Rainha Aranha: Veneno automático contra uma criatura no início do combate, usando as regras existentes.
- **Amuleto do Espinho Negro:** reduz em até 2 o dano de Veneno enquanto equipado.

## Progressão
- O chefe continua exigindo 3 artefatos.
- As duas novas salas comuns concedem artefatos. Não dependem da injeção das salas de subchefes.
- O Herbário não usa `witch_room_old_vials`: esta skill substituiria o saque padrão, anulando o artefato.
- Todos os recursos da masmorra seguem isolados por expansão. Heróis podem ser misturados.

## Assets e integração
- 23 artes WebP já publicadas em `images/` (não modificadas neste commit).
- Esta atualização contém somente catálogo, habilidades, descrições e testes; o modo Campanha segue pendente.
