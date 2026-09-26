# Cantina escolar — PHP + MySQL

Projeto Cantina para alunos e responsáveis, integrado ao MySQL. O SHELBY é outro
projeto independente que usa o mesmo schema `cantina`; cada projeto tem seu backend,
configuração e sessão PHP próprios.

## O que está pronto

- Cadastro e login de responsáveis; cadastro de alunos pelo responsável autenticado.
- Login individual do aluno, senha com hash e sessão PHP.
- Vínculo responsável/aluno, turma e registro de alergias/restrições.
- Cardápio com os 12 produtos e preços do projeto original.
- Carrinho, escolha de data e hora, confirmação e histórico de pedidos.
- Carteiras individuais, recarga fictícia, transferência e extrato.
- Limite diário de compras, incluindo histórico das alterações.
- Consultas parametrizadas, proteção CSRF e verificação de acesso no servidor.
- Operações financeiras em transações, bloqueios de saldo e repetição de requisições
  tratada por chave de operação.

## 1. Requisitos

- **PHP 8.1 ou superior**, com `PDO` e `pdo_mysql` habilitados.
- **MySQL Server 8.0.16 ou superior**, preferencialmente MySQL 8.4.
- MySQL Workbench ou outro cliente SQL para importar o banco.
- Um navegador atualizado. VS Code é o editor; não substitui PHP ou MySQL Server.

Não é necessário Composer, npm nem instalar bibliotecas para executar a aplicação.
O Workbench sozinho não instala necessariamente o servidor MySQL. Confirme que o
servidor da conexão configurada está ativo e acessível. O SQL foi preparado para MySQL,
não para MariaDB.

## 2. Abra a pasta no VS Code

Extraia o ZIP e use **Arquivo > Abrir Pasta**, selecionando `cantina`.
No terminal PowerShell, confira:

```powershell
php --version
php -m
```

Na lista de módulos devem aparecer `PDO` e `pdo_mysql`. Se o comando `php` não for
reconhecido, instale o PHP ou acrescente a pasta do executável ao PATH.
Para localizar o arquivo de configuração ativo, execute `php --ini`.
Se necessário, habilite `extension=pdo_mysql` no `php.ini`, confira `extension_dir`
e reinicie o servidor PHP.

## 3. Importe o banco

1. Abra sua conexão no MySQL Workbench.
2. Vá em **File > Open SQL Script** e selecione `banco/cantina.sql`.
3. Execute o script completo uma única vez em uma base nova.
4. Atualize a lista de schemas: deve aparecer `cantina`, baseado no modelo `Hackathon2.mwb`.

Importe o SQL somente uma vez, escolhendo qualquer um dos projetos. Os dois arquivos
`banco/cantina.sql` são cópias do mesmo esquema compartilhado. O servidor informado já
tem um schema `mydb` de outro sistema, por isso os projetos usam a base isolada `cantina`.
Se `cantina` já tiver tabelas ou dados, não execute o script por cima.
Em uma base já existente, aplique as migrações pelo terminal, uma vez cada:

```powershell
php bin/atualizar-estoque-diario.php
php bin/atualizar-alergenos-inadimplencia.php
```

O estoque é configurado por produto e data na tela Itens do Dia e compartilhado
com as encomendas online e as vendas registradas no balcão.
O cardápio do aluno oculta itens cujos ingredientes correspondem às alergias
informadas no perfil.

Com uma conta administradora do MySQL, crie o usuário da aplicação:

```sql
CREATE USER 'cantina_app'@'%' IDENTIFIED BY 'ESCOLHA_UMA_SENHA_FORTE';
GRANT SELECT, INSERT, UPDATE ON cantina.* TO 'cantina_app'@'%';
```

Substitua a senha antes de executar. Em rede controlada, prefira trocar `%` pelo IP
de saída do computador que executa o PHP. Se o usuário já existir, configure a senha
conhecida dele. Use uma conta separada para administrar o schema.

## 4. Configure a aplicação

No terminal, dentro da pasta do projeto:

```powershell
Copy-Item config/config.example.php config/config.php
```

Edite `config/config.php` e preencha `host`, `port`, `database`, `username` e `password`
com os dados do MySQL. O exemplo aponta para `192.168.20.5:3306`, schema `cantina`, e
usa `cantina_app`. Se necessário,
configure `ssl_ca` com o certificado TLS. O arquivo fica fora da pasta pública e é ignorado pelo Git.
Não repita o comando de cópia sobre uma configuração já preenchida.

O fuso padrão é `America/Sao_Paulo`. O limite diário considera o dia da compra nesse
fuso. Deixe `demo_recharge => true` para testar créditos fictícios.

## 5. Inicie o site

```powershell
php -S localhost:8000 -t public
```

Acesse **http://localhost:8000**. Mantenha o terminal aberto e use `Ctrl+C` para parar.
Também é possível executar `./INICIAR.ps1` no PowerShell, se sua política permitir.
Se a porta estiver ocupada, use `8001` no comando e no navegador.

**Use `public` como raiz do servidor.** Não use o Live Server para executar PHP e não
abra o HTML com duplo clique. As pastas `config`, `banco`, `src`, `tests` e
`referencia-original` devem ficar fora da raiz pública.

## 6. Primeiro uso

1. Crie uma conta no formulário **Sou responsável**. Não há senhas padrão.
2. No painel, abra **Cadastrar novo aluno** e preencha os dados e o login do aluno.
3. Adicione R$ 50,00 em **Crédito de teste** na carteira do responsável.
4. Transfira R$ 30,00 para o aluno cadastrado.
5. Se desejar, defina um limite diário. Vazio significa sem limite; zero bloqueia compras.
6. Saia e entre usando o login e a senha do aluno.
7. Escolha os produtos, clique em **Escolher retirada** e informe data/hora futuras.
8. Confirme a compra e consulte **Pedidos** e **Extrato**.
9. Entre novamente como responsável para acompanhar o pedido e os saldos.

Para testar aluno e responsável ao mesmo tempo, use navegadores diferentes ou uma
janela anônima: abas do mesmo perfil compartilham a sessão.

## Regras adotadas

- Novas carteiras começam zeradas.
- Cada login é único entre perfis. O e-mail pode ser compartilhado.
- O responsável autenticado cadastra o aluno e o vínculo é criado automaticamente.
  O banco suporta vários responsáveis, mas a interface não oferece vínculo adicional
  com um aluno existente; isso evita associação arbitrária de contas.
- O limite é diário e considera o total comprado no dia, mesmo que a retirada seja
  em outra data. Alterar o limite não muda o saldo nem cancela pedidos existentes.
- A retirada precisa estar no futuro e pode ser agendada em até 90 dias.
- Os preços são consultados no servidor no momento da compra. Valores enviados pelo
  navegador não determinam o débito. Nome e preço de cada item são preservados no pedido.
- Recargas de demonstração aceitam entre R$ 0,01 e R$ 1.000,00 por operação.
- O extrato mostra até 100 movimentações; pedidos mostram os 50 mais recentes.
  O histórico completo permanece no banco.
- A segurança do filtro de alergias depende de preencher corretamente os ingredientes de
  cada produto no CRM SHELBY. Produtos antigos ficam com esse campo vazio até a edição.
- Esta aplicação é a área escolar. A gestão de produtos e balcão fica no projeto SHELBY
  separado, que usa o mesmo schema MySQL. Produtos usados em pedidos devem ser desativados,
  não apagados.
- Pedidos são criados como `confirmado`. Retirada, cancelamento e estorno não têm fluxos
  administrativos nesta versão. Não altere status manualmente para simular um estorno.

## Recarga e uso real

**A recarga é fictícia e não cobra dinheiro.** Isso está identificado na interface e
no extrato. Desative `demo_recharge` antes de qualquer uso real. Uma integração de
pagamentos futura deverá liberar crédito somente após confirmação do provedor.

O servidor `php -S` é de desenvolvimento local. Para disponibilizar a aplicação na
internet, configure hospedagem PHP com raiz em `public`, HTTPS, controle persistente
de tentativas de login (a versão local limita por sessão), recuperação de senha,
backups e o fluxo real de pagamento/atendimento da cantina.

## Verificação

Veja `VALIDACAO.md` para o que foi verificado durante a montagem e o que depende do
seu ambiente. Para conferir sintaxe PHP na sua máquina:

```powershell
Get-ChildItem public,src,config -Filter *.php -Recurse | ForEach-Object { php -l $_.FullName }
```

Há um teste funcional opcional em `tests/teste_api.py`, com Python 3, sem bibliotecas
externas. Ele cria contas e movimentações fictícias: execute somente em uma base de
teste, após iniciar o servidor:

```powershell
python tests/teste_api.py http://localhost:8000
```

## Problemas comuns

| Mensagem | O que conferir |
|---|---|
| Configure config/config.php | Copie o exemplo e preencha suas credenciais. |
| Não foi possível acessar o banco | MySQL Server iniciado, host, porta, nome do banco, senha e SQL importado. O terminal registra o erro técnico. |
| could not find driver no terminal | Habilite `pdo_mysql` no PHP. |
| Access denied no terminal | Usuário/senha e permissão do usuário para a base e host configurados. |
| Table doesn't exist | Execute o SQL completo no banco indicado em `config.php`. |
| Sessão expirada | Atualize a página; confirme que o navegador aceita cookies. |
| Saldo insuficiente | Adicione crédito fictício ao responsável e transfira para o aluno. |
| Limite diário ultrapassado | Ajuste o limite no painel do responsável ou aguarde o próximo dia. |

## Estrutura

```text
cantina/
├── public/                  # Única pasta servida pelo PHP
│   ├── index.html           # Telas integradas
│   ├── api.php              # Rotas JSON
│   └── assets/              # CSS e JavaScript
├── src/bootstrap.php        # PDO, sessão, validações e transações
├── config/config.example.php
├── banco/cantina.sql        # Esquema Hackathon2 compartilhado e cardápio inicial
├── docs/BANCO.md            # Campos e relacionamentos
├── tests/teste_api.py       # Teste funcional para banco de teste
├── referencia-original/     # Arquivos originais preservados
├── INICIAR.ps1
├── VALIDACAO.md
└── LEIA-ME.md
```
