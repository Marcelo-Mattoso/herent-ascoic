# Efeitos sonoros do jogo

> **Estado atual:** efeitos sonoros temporariamente **desabilitados** no jogo. Os arquivos e gatilhos continuam presentes, mas nenhum som de efeito será reproduzido até a liberação explícita em `src/config/audio.ts`. A música continua habilitada e independente.
>
> Quando os áudios definitivos estiverem prontos, substitua os arquivos WAV e altere somente `AUDIO_CONFIG.sfx.enabled` para `true` (após revisar os volumes). Preferências antigas do navegador não contornam essa chave.

Os arquivos WAV desta pasta são originais, gerados por `scripts/generate-sfx.py`. Podem ser usados e modificados no projeto sem crédito externo.

O código usa **exatamente estes nomes**. Para trocar um efeito, substitua o WAV correspondente pelo seu áudio com o mesmo nome (PCM WAV recomendado) e execute novamente o build. Durante o desenvolvimento, o Vite copia os arquivos para `public/generated/sfx/`; no GitHub Pages eles são publicados sob o base path do projeto.

| Arquivo | Momento |
| --- | --- |
| `dice_launch.wav` | dados lançados |
| `dice_surface.wav` | contato com a mesa |
| `dice_collision.wav` | colisão entre dados |
| `dice_tumble.wav` | dado batendo na borda |
| `dice_settle.wav` | dados em repouso |
| `attack_whoosh.wav` | investida da carta |
| `attack_impact.wav` | dano efetivo |
| `attack_defend.wav` | ataque sem perda de vida |
| `attack_draw.wav` | empate no confronto |
| `room_reveal.wav` | nova sala revelada |
| `enemy_reveal.wav` | criaturas entram no encontro |
| `reward_gain.wav` | item ou artefato recebido |
| `heal_gain.wav` | cura efetiva |

O gerador é apenas uma forma de recriar os exemplos. Depois de trocar algum áudio, não execute o gerador, pois ele sobrescreve os arquivos desta pasta.
