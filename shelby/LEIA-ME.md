# SHELBY Gestão da Cantina

Projeto independente para operação da cantina. O Cantina de alunos/responsáveis é
outro projeto PHP; os dois usam o mesmo schema MySQL `cantina`, porém têm backends,
configurações e sessões separados.

## Funções

- Login restrito ao perfil `cantineiro`.
- Cadastro, edição e disponibilidade de produtos.
- Fila de pedidos de alunos e atualização do andamento.
- Registro de venda de balcão e conciliação de recebimentos pendentes.
- Indicadores, movimentações de carteira e saldos/gastos dos alunos.

## Requisitos

- PHP 8.1+ com `PDO` e `pdo_mysql`.
- MySQL 8.0.16+.
- MySQL Workbench para importar o modelo SQL compartilhado.

## Banco compartilhado

Use `banco/cantina.sql` para criar o schema `cantina`, baseado em `Hackathon2.mwb`.
Esse arquivo é igual ao SQL incluído no projeto Cantina. Importe-o **uma única vez**
no servidor compartilhado; não execute a cópia de cada projeto.

Em uma base já criada, aplique as migrações uma vez cada:

```powershell
php bin/atualizar-estoque-diario.php
php bin/atualizar-alergenos-inadimplencia.php
```

O Cantina aceita encomendas para o mesmo dia nos intervalos de 09:00 e 15:30,
com encerramento às 08:45 e 15:15. O estoque configurado em Itens do Dia é
compartilhado pelos pedidos online e pelas vendas no balcão.

Cadastre os ingredientes/alergênicos de cada produto. O cardápio do aluno oculta
itens que correspondem às alergias informadas no perfil, e o servidor também valida
o pedido. Vendas anotadas ficam limitadas a R$ 250,00 em aberto por aluno; ao atingir
o limite, novas vendas exigem pagamento imediato em Pix ou dinheiro.

Crie um usuário de aplicação com permissão de leitura e gravação:

```sql
CREATE USER 'cantina_app'@'%' IDENTIFIED BY 'ESCOLHA_UMA_SENHA_FORTE';
GRANT SELECT, INSERT, UPDATE ON cantina.* TO 'cantina_app'@'%';
```

Em uma rede controlada, substitua `%` pelo IP de saída do servidor PHP.

## Configuração e execução

No PowerShell, na pasta `shelby`:

```powershell
Copy-Item config/config.example.php config/config.php
```

Edite `config/config.php` com usuário e senha do MySQL. O exemplo aponta para
`192.168.20.5:3306`, schema `cantina`, conforme a imagem fornecida. Se o servidor exigir
TLS com certificado próprio, informe seu caminho em `ssl_ca`.

Crie o acesso de gestão. O cadastro não é público:

```powershell
$env:SHELBY_NOME = 'Operador da cantina'
$env:SHELBY_LOGIN = 'cantina'
$env:SHELBY_EMAIL = 'cantina@escola.local'
$env:SHELBY_SENHA = 'TROQUE_POR_UMA_SENHA_FORTE'
php bin/criar-cantineiro.php
Remove-Item Env:SHELBY_NOME, Env:SHELBY_LOGIN, Env:SHELBY_EMAIL, Env:SHELBY_SENHA
```

Inicie o SHELBY na porta `8001`:

```powershell
php -S localhost:8001 -t public
```

Abra `http://localhost:8001/` e use o login criado. A raiz pública do servidor deve
ser `public`; `config`, `src`, `bin` e `banco` precisam ficar fora dela.

O SHELBY registra vendas, mas não processa pagamentos eletrônicos. Vendas marcadas
como pendentes podem ser conciliadas depois com dinheiro, Pix ou cartão. Ao atingir
o teto de R$ 250,00 em aberto (ou se a próxima anotação o ultrapassar), a venda exige
pagamento imediato em Pix ou dinheiro. O bloqueio e o cálculo são feitos no servidor.
