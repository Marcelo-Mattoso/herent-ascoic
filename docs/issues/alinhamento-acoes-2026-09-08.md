# Alinhamento de habilidade, ataque e item — 2026-09-08

Fontes: `Ascensão Heróica - regras e faq.pdf` (manual mais recente enviado pelo autor,
seções 8.5, 8.5.1, 8.5.2, FAQ 20.2, 20.9, 20.10 e 20.21) e
`Jornada do Usuário — Ascensão Heróica Digital.pdf` (jornada de combate, etapa 4).
Os arquivos foram fornecidos em `C:/Users/gotau/Downloads/`.

## Decisões aplicadas

- Mantida a regra específica do autor em `ajustes-do-autor-01.txt`: habilidade/poder
  manual bloqueia ataque na rodada, sem encerrar o turno; ainda permite item e passar.
  O manual novo não estabelece esse bloqueio geral; a jornada permite efeitos antes
  da rolagem. Portanto, o bloqueio é uma decisão do projeto, não uma citação do manual.
- Item manual não desativa o herói. Mochila é inativa; seleção de item e alvo usa
  validação do core. Consumíveis são descartados; o item especial de obtenção de
  artefato é removido permanentemente. Reutilizáveis respeitam o escopo da carta,
  com sala como padrão. Virar um item não elimina seus bônus passivos.
- `GameState.oncePer.room` guarda limites por sala, inclusive sem `CombatState`.
  Saves anteriores usam o registro legado como fallback. Iniciar combate preserva
  esse limite; sair da sala o renova após resolver efeitos de saída.
- Mensagens e disponibilidade no painel distinguem ataque bloqueado de turno encerrado.

## Limites desta entrega

- Não migra categorias de equipamento nem reescreve o catálogo de habilidades.
- Mantém o comportamento existente das interrupções reativas e das cartas que
  explicitamente substituem a rolagem. Revisar esses custos junto dos textos de cada carta.
- O teste antigo que espera poder manual do Bárbaro permanece para revisão futura.
  Testes e servidor local não foram executados, conforme solicitado.
- Validação limitada ao TypeScript e revisão do diff; interação visual ainda não validada.
