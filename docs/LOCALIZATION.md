# Catálogo de idiomas — Ascensão Heróica

| Idioma | Código | Nome oficial do jogo |
|---|---|---|
| Português (Brasil) | `pt-BR` | Ascensão Heróica |
| English (US) | `en-US` | Heroic Ascension |
| Español (España) | `es-ES` | Ascensión Heroica |

## Expansões

**A Fornalha Sombria** é a primeira expansão do jogo, **não** o subtítulo de Ascensão Heróica. Seus nomes por idioma são:

| Idioma | Primeira expansão |
|---|---|
| `pt-BR` | A Fornalha Sombria |
| `en-US` | The Dark Forge |
| `es-ES` | La Forja Oscura |

O menu principal, o título da aba e o nome do produto apresentam **somente o nome do jogo**. Os nomes das expansões permanecem no material narrativo e poderão aparecer num futuro seletor de expansões, sem modificar a marca principal.

Os seis namespaces foram traduzidos para espanhol: `cards`, `common`, `game`, `journal`, `skills` e `tutorials`. O idioma é publicado pelo `meta.json` e aparece automaticamente no seletor de idiomas sem mudanças no código TypeScript.

Os IDs técnicos, pluralizações e parâmetros de interpolação (como `{value}` e `{{count}}`) são preservados. Nomes de lore como Véu, Deserto Rubro e Azhakar permanecem identificáveis. Termos idênticos em português e espanhol possuem justificativas em `retained` para passar pela auditoria.

Validação: `npm run i18n:validate`, `npm run build` e `npm run test:e2e`. Revisões editoriais podem ser feitas nos JSONs sem alterar o motor de regras.
