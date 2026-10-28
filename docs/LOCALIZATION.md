# Catálogo de idiomas — Ascensão Heróica

| Idioma | Código | Nome oficial | Subtítulo |
|---|---|---|---|
| Português (Brasil) | `pt-BR` | Ascensão Heróica | A Fornalha Sombria |
| English (US) | `en-US` | Heroic Ascension | The Dark Forge |
| Español (España) | `es-ES` | Ascensión Heroica | La Forja Oscura |

Os seis namespaces foram traduzidos para espanhol: `cards`, `common`, `game`, `journal`, `skills` e `tutorials`. O idioma é publicado pelo `meta.json` e aparece automaticamente no seletor de idiomas sem mudanças no código TypeScript.

Os IDs técnicos, pluralizações e parâmetros de interpolação (como `{value}` e `{{count}}`) são preservados. Nomes de lore como Véu, Deserto Rubro e Azhakar permanecem identificáveis. Termos idênticos em português e espanhol possuem justificativas em `retained` para passar pela auditoria.

Validação: `npm run i18n:validate`, `npm run build` e `npm run test:e2e`. Revisões editoriais podem ser feitas nos JSONs sem alterar o motor de regras.
