# Verificação da versão atual

## Feito

- PHP lint sem erros nos endpoints Cantina/SHELBY e nas migrações de alergênicos e inadimplência.
- `node --check` sem erros no JavaScript do CRM SHELBY.
- Migração aplicada ao banco compartilhado: `produtos.ingredientes` foi criada; as colunas
  `vendas_balcao.id_aluno`, `observacao` e `data_venda` já existiam.
- ZIPs dos dois projetos atualizados e conferidos; configurações locais não foram incluídas.

## Pendente de teste funcional

O usuário fará a validação funcional pelo navegador. Confirmar com contas de aluno/responsável
e no CRM: filtro de produtos por alergia, bloqueio na API ao tentar comprar item incompatível,
registro de inadimplência no balcão, bloqueio de anotação acima de R$ 250,00 e aceite somente
de Pix/dinheiro quando o limite for alcançado. Conferir também disponibilidade/estoque diário
e os prazos dos intervalos 09:00 e 15:30.
