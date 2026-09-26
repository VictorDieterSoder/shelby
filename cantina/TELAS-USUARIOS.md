# Telas do usuarios.zip

O HTML e o CSS usados em public foram trazidos do usuarios.zip. Os scripts de
demonstracao foram substituidos por public/js/usuarios.js, ligado a public/api.php.
Saldos, limites, cadastro e pedidos sao gravados no MySQL configurado.

O cadastro cria o aluno e um acesso separado para o responsavel informado.
A senha do responsavel aparece uma unica vez na confirmacao. Para entrar na
area do responsavel, use o nome informado, o usuario do aluno e essa senha.
Contas existentes continuam usando suas senhas anteriores.

O campo Usuario tambem e usado como nome do aluno porque o formulario original
nao tem um campo separado para nome. A idade informada e armazenada em
alunos.idade_informada; nao e criada uma data de nascimento ficticia.

Para atualizar uma base existente, execute bin/atualizar-telas.php com PHP.
Essa atualizacao adiciona idade_informada e permite data_nascimento vazia,
preservando datas e registros existentes. Ja foi aplicada na base local configurada.

Adicionar saldo continua sendo credito ficticio para demonstracao, sem cobranca.
O perfil do aluno mantem as alergias registradas. O catalogo agora oculta produtos
cujo campo `produtos.ingredientes` contenha uma alergia selecionada; a API valida
novamente os itens na compra para impedir envio manual de um produto incompativel.
O cadastro de ingredientes e feito no CRM SHELBY e deve ser preenchido para todos os
produtos, inclusive os ja existentes.

As encomendas usam o estoque diario compartilhado com o balcao. Encomendas online
continuam limitadas aos intervalos do mesmo dia: 09:00 (ate 08:45) e 15:30 (ate 15:15).

Os testes funcionais finais ficam a cargo do usuario, conforme solicitado. As
verificacoes de sintaxe nao substituem o teste integrado com login e MySQL.
