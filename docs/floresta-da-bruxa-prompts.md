# Floresta da Bruxa — prompts das artes faltantes

## Resumo da inspeção

Dos **26 itens solicitados, 19 já têm imagem e 7 estão sem arte própria**: Cajado do Eclipse Verde, Escudo de Espinhos Ancestrais, Armadura de Casca Ancestral, Vestes da Lua Verde, Botas do Brejo Silencioso, Manto de Seda de Teia e Capuz do Oráculo.

No repositório, o conteúdo correspondente está registrado como **A Torre da Grande Bruxa do Caldeirão**, ID `torre-grande-bruxa-caldeirao`, em `assets/expansions/torre-grande-bruxa-caldeirao/`. Não foi encontrada uma pasta separada chamada Floresta da Bruxa. A correspondência foi estabelecida pelos nomes dos itens, pelos arquivos e pelo cadastro em `expansion.json`.

As 65 artes de cartas dessa pasta têm **1024 × 1536 pixels, proporção 2:3, formato WebP**. Os sete itens faltantes também não possuem cadastro próprio no `expansion.json` inspecionado; os nomes de arquivo abaixo são sugestões, não IDs já implementados. Este documento prepara somente os prompts.

### Conferência dos 26 itens

Os arquivos existentes abaixo são relativos a `assets/expansions/torre-grande-bruxa-caldeirao/images/`.

| Nº | Item solicitado | Resultado / arquivo existente |
| --- | --- | --- |
| 1 | Punhal de Osso Polido | Existe — `item_polished_bone_dagger.webp` |
| 2 | Faca da Presa Tóxica | Existe — `item_poison_fang_knife.webp` |
| 3 | Lança de Junco do Pântano | Existe — `item_marsh_reed_spear.webp` |
| 4 | Cajado do Eclipse Verde | Falta arte própria |
| 5 | Escudo de Resina Verde | Existe — `item_green_resin_shield.webp` |
| 6 | Escudo de Espinhos Ancestrais | Falta arte própria |
| 7 | Manto de Musgo Seco | Existe — `item_dried_moss_cloak.webp` |
| 8 | Armadura de Casca Ancestral | Falta arte própria |
| 9 | Vestes da Lua Verde | Falta arte própria |
| 10 | Botas do Brejo Silencioso | Falta arte própria |
| 11 | Manto de Seda de Teia | Falta arte própria; não confundir com a Faixa de Seda de Teia |
| 12 | Capuz do Oráculo | Falta arte própria |
| 13 | Poção Antiveneno Fraca | Existe — `item_weak_antivenom_potion.webp` |
| 14 | Antídoto do Brejo | Existe — `item_swamp_antidote.webp` |
| 15 | Frasco de Névoa Engarrafada | Existe — `item_bottled_mist.webp` |
| 16 | Tônico de Raiz Amarga | Existe — `item_bitter_root_tonic.webp` |
| 17 | Ampola do Poço Lunar | Existe — `item_moonwell_vial.webp` |
| 18 | Lanterna da Bruxa | Existe — `item_witch_lantern.webp` |
| 19 | Sino de Prata Pequeno | Existe — `item_small_silver_bell.webp` |
| 20 | Amuleto de Galho Trançado | Existe — `item_braided_branch_amulet.webp` |
| 21 | Talismã da Mata Antiga | Existe — `item_forest_charm.webp` |
| 22 | Amuleto do Espinho Negro | Existe — `item_black_thorn_amulet.webp` |
| 23 | Baú Tomado de Musgo | Existe — `item_mossy_chest.webp` |
| 24 | Dados de Osso do Oráculo | Existe — `item_bone_oracle_dice.webp` |
| 25 | Mapa de Galho Retorcido | Existe — `item_crooked_branch_map.webp` |
| 26 | Reserva do Caldeirão | Existe — `item_cauldron_cache.webp` |

## Prompts das imagens faltantes

Destino sugerido para os futuros arquivos: `assets/expansions/torre-grande-bruxa-caldeirao/images/`. Cada bloco é um prompt completo em inglês para uma ilustração final individual. As referências indicadas devem acompanhar o prompt quando o gerador aceitar imagens de referência.

### 1. Cajado do Eclipse Verde

**Nome de arquivo sugerido:** `item_green_eclipse_staff.webp`

**Referências:** `hero_green_moon_sorceress.webp` para magia e ornamentos lunares; `item_marsh_reed_spear.webp` para materiais rústicos. Em `assets/expansions/fornalha-sombria/images/`, `CajadodasRunasRubras.webp` orienta a apresentação vertical do objeto, sem copiar sua paleta de fogo.

> Final illustration of the Green Eclipse Staff, a single tall ritual staff carved from ancient twisted dark wood, its upper branches curling around a dark circular moonstone with a thin luminous emerald eclipse halo. Worn leather bindings, small tarnished bronze fittings, sparse moss and deeply textured bark give it a handmade woodland character. The eclipse ornament is the clear focal point, with restrained green light tracing the wood grain. Show the entire staff, including both ends, upright at a slight angle with comfortable margins. A subdued background of damp stone, distant roots and faint low green mist evokes the Witch Forest without competing with the object. Match the supplied expansion references: richly detailed stylized painterly medieval dark fantasy, crisp illustrated contours, tactile materials, strong dimensional shading, olive and emerald accents with muted plum shadows, cinematic lighting and premium board game card art finish. Clean vertical 2:3 composition, 1024x1536 pixels. One finished item illustration, no wielder, no hands, no concept sheet, no text, no readable inscriptions, no watermark, no UI, no frame.

### 2. Escudo de Espinhos Ancestrais

**Nome de arquivo sugerido:** `item_ancestral_thorn_shield.webp`

**Referências:** `item_green_resin_shield.webp` para escala, madeira e acabamento; `hero_oak_guardian.webp` para raízes e folhas de carvalho.

> Final illustration of the Ancestral Thorn Shield, a single broad oval shield woven from ancient interlocking roots and thick blackened thorn branches over a weathered oak core. Long natural thorns grow outward around its uneven rim, with smaller hooked thorns crossing the front in a protective organic pattern. Show rough cracked bark, fibrous root bindings, a few faded oak leaves and sparse moss in the crevices. The shield's defining material is dry dark thornwood, with only faint green sap glints rather than a glossy resin coating. Present it in a near-frontal three-quarter view, fully visible and large in the frame, with a strong readable silhouette and space around every projecting thorn. Behind it, dim mossy stone and a thin veil of green forest mist remain unobtrusive. Richly detailed stylized painterly medieval dark fantasy matching the expansion references, crisp illustrated contours, warm brown wood, near-black thorns, olive highlights and subtle plum shadows, cinematic green rim light, premium board game card art. Vertical 2:3, 1024x1536 pixels. No bearer, no hands, no extra equipment, no text, no watermark, no UI, no frame, no concept sheet.

### 3. Armadura de Casca Ancestral

**Nome de arquivo sugerido:** `item_ancestral_bark_armor.webp`

**Referências:** `hero_oak_guardian.webp` para construção em casca e couro; `item_dried_moss_cloak.webp` para apresentação de vestimenta sem personagem. `ArmaduradeCouroReforçado.webp`, na Fornalha Sombria, serve de referência de enquadramento.

> Final illustration of the Ancestral Bark Armor, one empty wearable cuirass with integrated layered shoulder guards and a short protective bark skirt. Thick overlapping oak bark plates are tied onto an aged brown leather foundation with braided roots and sturdy visible stitching. Preserve a convincing human armor silhouette while showing organic irregular edges, deep wood grain, old cracks, small patches of moss and restrained oak-leaf details inspired by the Oak Guardian reference. Display the complete armor upright as an isolated equipment piece, with a dark empty neck opening, no wearer and no visible mannequin. Center it against subdued damp stone and twisted roots, leaving clear margins around the shoulders and lower plates. Soft green witchlight outlines the bark while gentle warm highlights reveal the leather, with muted violet shadows and subtle forest haze. Highly detailed stylized painterly medieval dark fantasy, crisp illustrated contours and tactile material rendering matching the expansion's premium board game card art. Vertical 2:3 composition, 1024x1536 pixels. No head, face, limbs, character, additional weapons, text, readable writing, watermark, UI, frame or concept sheet.

### 4. Vestes da Lua Verde

**Nome de arquivo sugerido:** `item_green_moon_robes.webp`

**Referências:** `hero_green_moon_sorceress.webp` para desenho das vestes, tecidos e joias; `item_dried_moss_cloak.webp` para apresentação do equipamento vazio.

> Final illustration of the Green Moon Robes, a single empty ceremonial woodland gown with flowing layered green fabric, broad draped sleeves and an ornate waist fastening. Follow the Green Moon Sorceress reference for the emerald and olive cloth, fine gold leaf embroidery, aged bronze crescent ornaments, green cabochon stones and subtle plum inner layers. Show rich fabric folds, delicately weathered hems and botanical stitching, with the garment itself as the sole subject. Present the robes upright and fully visible, arranged as an unworn magical garment with no body, head, hands or visible mannequin. The neckline and sleeves remain visibly empty. A dim ancient woodland shrine with mossy stone and soft green mist provides restrained context. Pale lunar highlights and a gentle emerald rim light illuminate the fabric without washing out its texture. Match the expansion's highly detailed stylized painterly dark medieval fantasy, crisp illustrated contours, dramatic dimensional shading and premium board game card art finish. Clean vertical 2:3 composition, 1024x1536 pixels, generous silhouette margins. No character, crown, separate staff, text, readable symbols, watermark, UI, frame or concept sheet.

### 5. Botas do Brejo Silencioso

**Nome de arquivo sugerido:** `item_silent_marsh_boots.webp`

**Referências:** `hero_swamp_stalker.webp` para couro gasto e amarrações; `item_dried_moss_cloak.webp` para paleta. `BotasdePedraLeve.webp`, na Fornalha Sombria, orienta a composição do par, sem copiar placas de pedra.

> Final illustration of the Silent Marsh Boots, one matching pair of supple worn dark brown leather boots made for quiet passage through a haunted swamp. Show soft reinforced soles, close leather lacing, muted olive cloth wraps around the ankles, small weathered buckles and subtle reed-fiber stitching. Damp leather, shallow mud stains and traces of moss suggest practical woodland use while keeping every construction detail readable. Place the two empty boots together in a three-quarter view on a low moss-covered stone, one slightly forward so both silhouettes and soles can be understood. No feet or legs inside them. Dark marsh water, a few distant reeds and a thin layer of ground mist provide a simple contextual background. Cinematic low green reflected light, warm leather highlights and muted plum shadows. Match the expansion's richly detailed stylized painterly medieval dark fantasy, crisp illustrated edges, tactile textures and premium board game card art finish. Vertical 2:3 composition, 1024x1536 pixels, the pair large and fully visible with comfortable margins. No character, heavy metal armor, extra footwear, text, watermark, UI, frame or concept sheet.

### 6. Manto de Seda de Teia

**Nome de arquivo sugerido:** `item_web_silk_cloak.webp`

**Referências:** `item_web_silk_wrap.webp` para a seda e seus reflexos; `item_dried_moss_cloak.webp` para a silhueta de um manto completo; `subboss_spider_mother.webp` para a relação visual entre verde e violeta.

> Final illustration of the Web Silk Cloak, a single full-length hooded cloak woven from dense overlapping layers of spider silk. Its pale pearl-gray threads catch faint green highlights and soft violet shadows; translucent outer layers reveal intricate natural web filaments over a denser protective inner weave. A small dark thornwood clasp secures the shoulders, and fine trailing silk strands finish the scalloped hem. This must read unmistakably as a complete wearable cloak with a hood and broad draping shoulders, not a rolled bandage, scarf or cocoon. Display it upright and unworn with an empty dark hood, its complete silhouette clearly separated from the background. A dim mossy stone alcove with sparse cobwebs and restrained green haze suggests the Witch Forest. Cinematic grazing light reveals delicate fibers without making the fabric look plastic. Highly detailed stylized painterly medieval dark fantasy, crisp illustrated contours, rich tactile shading and premium board game card art consistent with the supplied expansion references. Vertical 2:3, 1024x1536 pixels. No wearer, face, visible mannequin, spider character, text, watermark, UI, frame or concept sheet.

### 7. Capuz do Oráculo

**Nome de arquivo sugerido:** `item_oracle_hood.webp`

**Referências:** `item_bone_oracle_dice.webp` para osso envelhecido e motivos lunares; `item_dried_moss_cloak.webp` para tecido e iluminação. `CapuzdoTúnel.webp`, na Fornalha Sombria, orienta o enquadramento do capuz vazio.

> Final illustration of the Oracle Hood, a single empty deep hood with a short layered shoulder cowl, crafted from weathered charcoal and muted plum cloth. Fine olive thread follows the seams, and a few small aged bone beads and a crescent-shaped bone clasp evoke the same ritual craft as the Bone Oracle Dice reference. Subtle abstract celestial stitch patterns are decorative shapes only, with no letters or readable runes. The hood opening is deep and completely empty, without a face or glowing eyes. Show the complete hood and short cowl in a centered near-frontal three-quarter view, large enough to reveal the worn weave, frayed edges and carefully repaired seams. Behind it, subdued damp stone and faint green forest mist provide quiet context. A restrained emerald rim light and pale highlights on the bone create a mysterious divinatory mood. Match the expansion's richly detailed stylized painterly medieval dark fantasy, crisp illustrated contours, dimensional shading and premium board game card art finish. Vertical 2:3 composition, 1024x1536 pixels. No wearer, mannequin, full robe, extra dice, text, watermark, UI, frame or concept sheet.

## Observações de consistência visual

- **Acabamento observado:** as cartas usam pintura digital detalhada com contornos ilustrados bem definidos, materiais táteis, volumes acentuados e cores expressivas. Os prompts preservam esse grau de estilização; o termo “painterly” deve ser interpretado junto das referências, sem migrar para fotografia ou renderização 3D.
- **Paleta da expansão:** madeira marrom escura, musgo oliva, magia verde-amarelada/esmeralda e sombras ou tecidos violeta. As referências equivalentes da Fornalha ajudam no enquadramento de equipamentos, mas sua iluminação laranja de fogo não deve substituir a identidade verde da floresta.
- **Composição:** itens grandes, uma silhueta principal claramente legível, margens para não cortar extremidades e fundo escuro contextual discreto. Vestimentas aparecem vazias; a presença de roupas nas cartas de herói não equivale a uma arte independente de equipamento.
- **Formato:** seguir os 1024 × 1536 pixels encontrados nas 65 cartas da expansão. Os quadros horizontais em `abertura/images/` são outro tipo de asset e não definem o formato destas cartas. As futuras entregas devem usar `.webp` e o padrão inglês `item_...` em snake_case.
- **Faixa versus manto:** `item_web_silk_wrap.webp` representa um rolo de faixa/esparadrapo de seda. Foi inspecionado visualmente e não atende ao Manto de Seda de Teia. Deve permanecer intacto.
- **Lanternas:** `item_green_glass_lantern.webp` e `item_witch_lantern.webp` existem como itens distintos. A Lanterna da Bruxa pedida já está atendida pelo segundo arquivo; não precisa de novo prompt.
- **Cópias e caminhos legados:** também há artes em `assets/webp/cards/` e `assets/webp/cards/expansions/torre-grande-bruxa-caldeirao/`. A conferência considerou essas pastas; o inventário acima usa os caminhos declarados no cadastro atual da expansão, sem propor renomeações ou substituições.
- **Outras categorias:** todos os caminhos de imagem declarados nas cartas do `expansion.json` inspecionado existem, incluindo criaturas, salas e artefatos. Não foi identificada pendência de arquivo nesses registros. Isso não cobre cartas futuras ainda não cadastradas.

Nenhuma imagem, ficha, regra ou cadastro foi modificado nesta tarefa. Os detalhes dos sete novos objetos são propostas visuais baseadas nos nomes solicitados e nas referências existentes; não definem efeitos ou estatísticas de jogo.
