# Efeito periódico configurável (DoT)

Cada habilidade pode declarar o kind `i_apply_damage_over_time` (nenhuma carta migrou nesta etapa).
A implementação fica no motor comum, não em uma expansão:

```yaml
- kind: i_apply_damage_over_time
  to: $target
  status: poison # ou bleed, burn, etc.
  effectId: toxic_blade # identifica a origem quando houver várias por habilidade
  damage: 2 # inteiro positivo
  rounds: 3 # 0 = até o fim do combate, morte ou remoção
  increaseOverTime: false # se true, +1 no dano a cada rodada
  decreaseOverTime: true  # se true, -1 no dano a cada rodada
```

Regras:
- Os dois booleanos devem ser mutuamente exclusivos; ambos false produzem dano constante.
- O primeiro tick acontece no fim da rodada **seguinte** à aplicação.
- Dano decrecente é removido ao chegar a zero.
- Cada combinação `status + sourceId + effectId` possui um stack; outras fontes acumulam.
- Reaplicar a mesma fonte renova a duração, sem duplicar o stack nem adiar ticks; nunca diminui a potência já alcançada.
- `rounds=0` não atravessa combates; efeitos são eliminados na vitória, derrota, fuga e ao concluir a sala.
- `i_remove_status` e `i_dispel` aceitam os tipos de status novos.
- Dano por tempo usa `damageType: condition`, não é acerto de arma.
- **Convenção para expansões futuras:** pelo menos 80% dos itens devem interagir com a mecânica característica; isso é uma diretriz de design, não uma validação automática das cartas nesta etapa.

A habilidade existente `i_apply_poison` permanece compatível e não foi migrada nesta implementação.
