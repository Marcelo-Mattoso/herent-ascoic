# Torre da Grande Bruxa — substituição do subchefe (v1.2)

## Aranha Mãe
- Substitui completamente o Lenhador Enfeitiçado. ID: `subboss_spider_mother`.
- Dados (branco a roxo): [1,2,2,3,3]; Vida [8,10,12,14,16]; Acerto [4,6,8,10,12]; dano 4; XP 4; recompensa 1 artefato.
- Mordida da Matriarca: ao iniciar combate, aplica 1 Veneno/rodada por 2 rodadas ao herói com menos Vida.
- Despertar Roxo — Veneno da Prole Roxa: amplia a duração para 3 rodadas; não acumula dano.

## Ninho da Aranha Mãe
- Substitui a Oficina do Lenhador. ID: `subboss_room_spider_mother_nest`.
- 1 saída; XP 3; recompensa 1 artefato; encontra a Aranha Mãe.
- Teias Pegajosas do Ninho: ao revelar a sala, -1 Acerto a todos os heróis até o fim do combate.

## Estado e próximos passos
- `expansion.json`, `boss.json` e as 42 imagens estão preparados em `assets/expansions/torre-grande-bruxa-caldeirao/`.
- `config.json` mantém a expansão **desativada** até o motor implementar `i_apply_poison`, `s_poison_damage_reduction` e a remoção individual do status com testes.
- As cópias WebP e PNG originais (e o catálogo de otimização) continuam preservadas. Nenhuma imagem foi recriada.
- Escolha Campanha/Sessão e boss livre ficam para uma próxima etapa.
