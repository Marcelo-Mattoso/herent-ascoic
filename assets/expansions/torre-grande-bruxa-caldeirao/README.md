# A Torre da Grande Bruxa do Caldeirão — catálogo v1.4

## Inventário definitivo
- 4 heróis, 18 criaturas, 2 subchefes, 10 salas comuns, 2 salas de subchefe, **26 itens**, 5 artefatos.
- **67 cartas** em `expansion.json` + 1 chefe em `boss.json` = **68 cartas**.
- Os 12 heróis do jogo continuam compartilhados.

## Itens da expansão (26)
- **Armas e escudos (6):** Punhal de Osso Polido; Faca da Presa Tóxica; Lança de Junco do Pântano; Cajado do Eclipse Verde; Escudo de Resina Verde; Escudo de Espinhos Ancestrais.
- **Vestimentas (6):** Manto de Musgo Seco; Armadura de Casca Ancestral; Vestes da Lua Verde; Botas do Brejo Silencioso; Manto de Seda de Teia; Capuz do Oráculo.
- **Consumíveis (5):** Poção Antiveneno Fraca; Antídoto do Brejo; Frasco de Névoa Engarrafada; Tônico de Raiz Amarga; Ampola do Poço Lunar.
- **Utilitários (2):** Lanterna da Bruxa; Sino de Prata Pequeno.
- **Amuletos (3):** Amuleto de Galho Trançado; Talismã da Mata Antiga; Amuleto do Espinho Negro.
- **Especiais (4):** Baú Tomado de Musgo; Dados de Osso do Oráculo; Mapa de Galho Retorcido; Reserva do Caldeirão.

**22/26 cartas (84,6%) interagem com Veneno; 4 preservam Saque Mágico.**
As cinco cartas antigas fora da seleção definitiva (Ervas da Lua Velha, Lanterna de Vidro Verde, Livro de Símbolos Riscados, Pão Negro da Bruxa e Faixa de Seda de Teia) e seus arquivos de imagem foram removidos.

## Veneno
- As habilidades ofensivas da Faca, do Cajado e do Frasco usam `i_apply_damage_over_time`: origens distintas acumulam; mesma origem renova.
- `i_poison_ward` controla remoção de um stack, bloqueio da próxima aplicação e mitigação do próximo tick.
- `has_dot_stacks` permite bônus condicionais por quantidade de venenos.
- Modificadores `s_poison_duration_increase/decrease` modificam apenas venenos com duração finita.
- Os efeitos permanecem limitados ao combate; os quatro Saques Mágicos mantêm o comportamento anterior.

## Conteúdo preservado
- 6 novas criaturas, 2 novas salas e Glândula da Rainha Aranha da versão 1.3.
- Chefe exige 3 artefatos. Outros heróis e demais expansões não são alterados.
- Imagens novas são reutilizadas em `images/`, sem subpastas.

## Novo artefato v1.5 — Coração Corrompido da Floresta
- **Último Suspiro da Mata:** uma vez por combate, escolha um inimigo vivo que tenha Veneno; remova todos os stacks independentes e cause **2 pontos de dano direto por stack**.
- O dano não recebe bônus de armas; artefato não é consumido; conta para os 3 artefatos exigidos pela Bruxa.
- A ativação do motor usa `USE_ARTIFACT` com `artifactId` e `targetEnemyId` (a interface gráfica ainda precisa expor essa ação).
- A arte original do Coração foi vinculada como `images/artifact_corrupted_forest_heart.png` para preservar o PNG enviado; o manifesto aceita PNG nesta exceção, enquanto as demais artes continuam em WebP.

## Auditoria das cinco artes de artefato
- Colher do Caldeirão Antigo: `images/artifact_ancient_cauldron_spoon.webp`.
- Olho Verde da Floresta: `images/artifact_green_forest_eye.webp`.
- Grimório da Torre Torta: `images/artifact_crooked_tower_grimoire.webp`.
- Glândula da Rainha Aranha: `images/artifact_queen_spider_gland.webp` (imagem do jogo existente, PNG mestre ausente em `imagedata`).
- Coração Corrompido da Floresta: `images/artifact_corrupted_forest_heart.png` (PNG original preservado).
