# Apoie-nos — dados públicos de contribuição

Configure o recebedor, a imagem QR Pix, o código Pix copia e cola e o link Ko-fi em `supportConfig.ts`.

**Privacidade:** nunca publique chave Pix associada a telefone ou outros dados que não deseja divulgar. O QR Code Pix e o código copia e cola podem revelar a chave Pix usada, mesmo quando o número não aparece na interface. Recomenda-se uma **chave Pix aleatória dedicada** antes de preencher os campos.

- `recipientName`: nome apresentado ao jogador e disponível para copiar; confirme que corresponde ao recebedor exibido pelo banco.
- `pixCopyPaste`: código Pix BR Code válido de um pagamento sem valor fixo, emitido/validado pelo provedor de pagamento.
- `pixQrImagePath`: caminho de arquivo de QR compatível com o código anterior, sob `public/`. Não aponte a imagem para um serviço externo.
- `koFiUrl`: link HTTPS da página Ko-fi do criador (somente domínio oficial `ko-fi.com`).

Deixe dados ainda não confirmados vazios; o modal mostrará "em breve" em vez de oferecer um botão que falha. Não há coleta de dados do jogador nem envio de Pix pelo próprio jogo.
