# Castelo do Horizonte Infindo — contrato de habilidades reutilizáveis

Este arquivo documenta o primeiro pacote do **motor de habilidades** para a integração das cartas.
Não foi feito vínculo com `expansion.json` ou `boss.json`, nem alteração de atributos.

## DSL genérico disponível

| Skill ID | Uso | Params | Status |
|---|---|---|---|
| `item_skill_equipped_max_life` | Vida máxima enquanto equipado | `value` | Disponível |
| `item_skill_equipped_accuracy` | Bônus de Acerto enquanto equipado | `value` | Disponível |
| `item_skill_equipped_damage` | Bônus de Dano enquanto equipado | `value` | Disponível |
| `item_skill_equipped_protection` | Redução de dano comum enquanto equipado | `value` | Disponível |
| `item_skill_room_damage_protection` | Reduz exclusivamente o dano diretamente originado por habilidade de sala | `value` | Disponível |
| `dungeon_skill_environment_darkness` | Penalidade de Acerto no combate da sala; marca a sala como `darkness` | `value` | Disponível |
| `item_skill_illumination_against_darkness` | Bônus de Acerto enquanto estiver em sala com tag `darkness` | `value` | Disponível |
| `skill_group_command_accuracy` | Bônus de Acerto aos inimigos do combate enquanto o comandante vive | `value` | Disponível |
| `skill_group_command_protection` | Redução de dano aos inimigos do combate enquanto o comandante vive | `value` | Disponível |
| `dungeon_skill_resonant_pressure` | Penalidade de Acerto no início da rodada, apenas na sala onde foi declarada | `value` | Disponível |

A habilidade de veneno/dano por tempo continua sendo a operação existente `i_apply_damage_over_time`.
Emboscadas simples podem reutilizar `skill_treacherous_attack`; Saque Mágico pode continuar usando `item_skill_mystic_draw`.

### Exemplo de carta de aliado

```json
{
  "id": "ally_centaur_guardian",
  "type": "ally",
  "name": "Centauro Guardião",
  "equipmentSlot": "ally",
  "skills": [
    { "skillId": "item_skill_equipped_max_life", "params": { "value": 6 } }
  ]
}
```

**Regra de Vida:** equipar amplia apenas a Vida máxima, sem curar; remover limita a Vida atual ao novo máximo. O valor é reconciliado ao mover o aliado, sem acumulação. Aliados ocupam um slot próprio e entram no baralho de itens/recompensas; o tipo de carta é `ally`, não `item` ou `itemClass: ally`.

### Regra definitiva: recrutamento ou descarte

- Uma recompensa do tipo `ally` **não pode ser guardada na mochila**, mesmo quando há espaço.
- Deve ser **recrutada diretamente no slot `ally`** de algum herói ou **descartada definitivamente**; fechar a mesa com um aliado não escolhido equivale a dispensá-lo.
- Ao colocar outro aliado no slot ocupado, o anterior é **dispensado definitivamente** (não vai para mesa nem mochila).
- Mover um aliado equipado para a mesa também significa dispensá-lo definitivamente. Transferência **direta** entre slots de heróis é permitida, desde que não passe pela mochila; a transferência para um slot ocupado dispensa o substituído.
- O jogo armazena `retiredAllyIds`, e esses IDs não podem reaparecer por saques, recompensas ou reinícios da masmorra **na mesma partida**. Uma partida nova restaura o conjunto.
- Em **Saque Mágico**, aliados revelados mas não escolhidos também são dispensados definitivamente, enquanto itens comuns mantêm o descarte tradicional.
- O bot deve preferir um slot livre e nunca gerar a opção de guardar aliados na mochila.


## Mapeamento dos seis aliados

| Aliado | Skills a vincular |
|---|---|
| Centauro Guardião | `item_skill_equipped_max_life`, value = 6 |
| Corcel das Estepes | `item_skill_equipped_accuracy`, value = 2 |
| Cão de Guerra das Planícies | `item_skill_equipped_damage`, value = 1 |
| Égua dos Ventos | `item_skill_equipped_accuracy`, value = 1; `item_skill_equipped_protection`, value = 1 |
| Jumento de Carga | `item_skill_room_damage_protection`, value = 1 |
| Batedor do Horizonte | **Pendente** — necessita definir e implementar precisamente a janela de “primeiro ataque recebido”; não atribuir redução permanente |

## Ambientes e comandos

Adicione à sala uma SkillRef `dungeon_skill_environment_darkness` com `params.value` para a penalidade definida pelo balanceamento. O efeito só ocorre no combate dessa sala. Qualquer item com `item_skill_illumination_against_darkness` passa a conceder seu bônus de Acerto automaticamente nessa sala, inclusive quando o nome da sala for diferente.

Uma criatura ou subchefe pode receber `skill_group_command_accuracy` ou `skill_group_command_protection` com `params.value`. O efeito se aplica à equipe inimiga e é vinculado ao comandante, sem mencionar IDs de Hobgoblin, Marechal ou expansão. O mesmo mecanismo serve a outros comandantes.

## Limites conhecidos desta entrega

- Não há ainda habilidade exclusiva definida para os quatro heróis ou para o ritual de Therion; esses efeitos dependem das descrições funcionais aprovadas.
- O Batedor do Horizonte precisa de regra/semântica específica para primeiro ataque direcionado versus primeiro ataque que causa dano.
- A redução de dano ambiental protege `i_damage` que esteja associado a habilidade `dungeon_skill`, e **não** marca automaticamente como ambiental ticks futuros de veneno originados por sala.
- Os slots de aliado e a apresentação básica no inventário/ficha do herói já estão integrados. As cartas reais de aliado, ilustrações, localização e parametrização final ainda serão integradas na conversa de cartas.
- Os testes unitários foram adicionados, mas não executados aqui; não rodar CI/CD nem `audit` completo neste pacote.
- O Castelo deve continuar desabilitado em `assets/expansions/config.json` até a expansão estar completa.
