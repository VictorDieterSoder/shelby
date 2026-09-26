SHELBY - gestao da cantina

Este repositorio contem o codigo-fonte atual do CRM SHELBY e o pacote atualizado
`shelby-projeto.zip`. O projeto de alunos e responsaveis, Cantina, e separado; ambos
usam o mesmo banco MySQL `cantina`.

## O que faz

- Gerencia produtos e seus ingredientes/alergenicos.
- Configura estoque diario compartilhado entre pedidos online e vendas no balcao.
- Mostra pedidos dos intervalos das 09:00 e 15:30.
- Registra vendas no balcao e pendencias por aluno.
- Limita anotacoes a R$ 250,00 em aberto por aluno; no limite, aceita somente pagamento
  imediato por Pix ou dinheiro.

## Banco e execucao

Consulte `LEIA-ME.md` para configurar PHP/MySQL, aplicar as migracoes e iniciar o CRM.
Use `banco/cantina.sql` somente para criar um banco novo. Em uma base existente, execute
as migracoes indicadas no guia, sem reimportar o SQL.

Preencha os ingredientes de cada produto no CRM para que as alergias registradas no
perfil do aluno possam filtrar o cardapio. O repositorio preserva os arquivos antigos
de referencia e os projetos continuam separados.
