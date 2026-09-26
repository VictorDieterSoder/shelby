-- MySQL 8.0.16+ / 8.4. Importar uma vez em uma base nova.
-- Não apaga nem substitui dados existentes.
CREATE DATABASE IF NOT EXISTS cantina CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE cantina;

CREATE TABLE usuarios (
 id_usuario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(120) NOT NULL,
 login VARCHAR(60) NOT NULL UNIQUE,
 email VARCHAR(254) NOT NULL,
 senha_hash VARCHAR(255) NOT NULL,
 tipo_usuario ENUM('aluno','responsavel','cantineiro') NOT NULL,
 criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE turmas (
 id_turma INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(40) NOT NULL,
 ano_letivo SMALLINT UNSIGNED NOT NULL,
 UNIQUE KEY uq_turma (nome, ano_letivo)
) ENGINE=InnoDB;

CREATE TABLE alunos (
 id_aluno INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT UNSIGNED NOT NULL UNIQUE,
 id_turma INT UNSIGNED NOT NULL,
 data_nascimento DATE NULL,
 idade_informada TINYINT UNSIGNED NULL,
 limite_gasto DECIMAL(10,2) NULL,
 periodo_limite ENUM('diario','semanal','mensal') NOT NULL DEFAULT 'diario',
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 FOREIGN KEY (id_turma) REFERENCES turmas(id_turma),
 CHECK (limite_gasto IS NULL OR limite_gasto >= 0)
) ENGINE=InnoDB;

CREATE TABLE responsaveis (
 id_responsavel INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT UNSIGNED NOT NULL UNIQUE,
 telefone VARCHAR(25) NOT NULL,
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

CREATE TABLE alunos_responsaveis (
 id_aluno INT UNSIGNED NOT NULL,
 id_responsavel INT UNSIGNED NOT NULL,
 parentesco VARCHAR(40) NOT NULL,
 PRIMARY KEY (id_aluno, id_responsavel),
 FOREIGN KEY (id_aluno) REFERENCES alunos(id_aluno),
 FOREIGN KEY (id_responsavel) REFERENCES responsaveis(id_responsavel)
) ENGINE=InnoDB;

CREATE TABLE alergias (
 id_alergia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nome VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE alunos_alergias (
 id_aluno INT UNSIGNED NOT NULL,
 id_alergia INT UNSIGNED NOT NULL,
 PRIMARY KEY (id_aluno, id_alergia),
 FOREIGN KEY (id_aluno) REFERENCES alunos(id_aluno),
 FOREIGN KEY (id_alergia) REFERENCES alergias(id_alergia)
) ENGINE=InnoDB;

CREATE TABLE categorias (
 id_categoria INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 nome ENUM('salgados','doces','bebidas','lanches','outros') NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE produtos (
 id_produto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_categoria INT UNSIGNED NOT NULL,
 nome VARCHAR(100) NOT NULL,
 descricao TEXT NOT NULL DEFAULT (''),
 ingredientes VARCHAR(2000) NOT NULL DEFAULT '',
 preco DECIMAL(10,2) NOT NULL,
 icone VARCHAR(20) NOT NULL DEFAULT '',
 ativo BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria),
 CHECK (preco >= 0)
) ENGINE=InnoDB;

CREATE TABLE estoque_diario (
 id_produto INT UNSIGNED NOT NULL,
 data_estoque DATE NOT NULL,
 quantidade_total SMALLINT UNSIGNED NOT NULL,
 quantidade_vendida SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY (id_produto, data_estoque),
 INDEX ix_estoque_data (data_estoque),
 FOREIGN KEY (id_produto) REFERENCES produtos(id_produto),
 CHECK (quantidade_vendida <= quantidade_total)
) ENGINE=InnoDB;

CREATE TABLE carteiras (
 id_carteira INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT UNSIGNED NOT NULL UNIQUE,
 saldo DECIMAL(10,2) NOT NULL DEFAULT 0,
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 CHECK (saldo >= 0)
) ENGINE=InnoDB;

CREATE TABLE pedidos (
 id_pedido INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_aluno INT UNSIGNED NOT NULL,
 criado_em DATETIME NOT NULL,
 data_retirada DATE NOT NULL,
 hora_retirada TIME NOT NULL,
 valor_total DECIMAL(10,2) NOT NULL,
 status ENUM('pendente','pago','preparando','pronto','entregue','cancelado','confirmado','retirado') NOT NULL DEFAULT 'confirmado',
 FOREIGN KEY (id_aluno) REFERENCES alunos(id_aluno),
 INDEX ix_pedido_aluno_data (id_aluno, criado_em),
 CHECK (valor_total > 0)
) ENGINE=InnoDB;

CREATE TABLE itens_pedido (
 id_item_pedido INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_pedido INT UNSIGNED NOT NULL,
 id_produto INT UNSIGNED NOT NULL,
 nome_produto VARCHAR(100) NOT NULL,
 quantidade SMALLINT UNSIGNED NOT NULL,
 preco_unitario DECIMAL(10,2) NOT NULL,
 UNIQUE KEY uq_item (id_pedido, id_produto),
 FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido),
 FOREIGN KEY (id_produto) REFERENCES produtos(id_produto),
 CHECK (quantidade > 0),
 CHECK (preco_unitario >= 0)
) ENGINE=InnoDB;

CREATE TABLE movimentacoes (
 id_movimentacao INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_carteira_origem INT UNSIGNED NULL,
 id_carteira_destino INT UNSIGNED NULL,
 id_pedido INT UNSIGNED NULL UNIQUE,
 tipo ENUM('recarga','transferencia','compra','estorno','recarga_demo') NOT NULL,
 valor DECIMAL(10,2) NOT NULL,
 descricao VARCHAR(255) NOT NULL,
 criado_em DATETIME NOT NULL,
 FOREIGN KEY (id_carteira_origem) REFERENCES carteiras(id_carteira),
 FOREIGN KEY (id_carteira_destino) REFERENCES carteiras(id_carteira),
 FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido),
 CHECK (valor > 0),
 CHECK (
  (tipo IN ('recarga','recarga_demo') AND id_carteira_origem IS NULL AND id_carteira_destino IS NOT NULL AND id_pedido IS NULL)
  OR (tipo = 'transferencia' AND id_carteira_origem IS NOT NULL AND id_carteira_destino IS NOT NULL AND id_carteira_origem <> id_carteira_destino AND id_pedido IS NULL)
  OR (tipo = 'compra' AND id_carteira_origem IS NOT NULL AND id_carteira_destino IS NULL AND id_pedido IS NOT NULL)
 )
) ENGINE=InnoDB;

CREATE TABLE historico_limites (
 id_historico INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_aluno INT UNSIGNED NOT NULL,
 id_responsavel INT UNSIGNED NOT NULL,
 valor_anterior DECIMAL(10,2) NULL,
 valor_novo DECIMAL(10,2) NULL,
 alterado_em DATETIME NOT NULL,
 FOREIGN KEY (id_aluno) REFERENCES alunos(id_aluno),
 FOREIGN KEY (id_responsavel) REFERENCES responsaveis(id_responsavel)
) ENGINE=InnoDB;

-- Impede repetição de uma operação se o navegador reenviar a mesma requisição.
CREATE TABLE requisicoes (
 id_usuario INT UNSIGNED NOT NULL,
 chave CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 acao VARCHAR(30) NOT NULL,
 resposta JSON NULL,
 criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (id_usuario, chave),
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
) ENGINE=InnoDB;

-- Extensões da gestão SHELBY: vendas avulsas e estado diário dos produtos.
CREATE TABLE vendas_balcao (
 id_venda INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_usuario INT UNSIGNED NOT NULL,
 cliente VARCHAR(120) NOT NULL,
 id_aluno INT UNSIGNED NULL,
 observacao VARCHAR(500) NOT NULL DEFAULT '',
 data_venda DATETIME NULL,
 pagamento ENUM('dinheiro','pix','cartao','pendente') NOT NULL,
 valor_total DECIMAL(10,2) NOT NULL,
 criado_em DATETIME NOT NULL,
 FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
 INDEX ix_venda_data (criado_em)
) ENGINE=InnoDB;

CREATE TABLE itens_venda_balcao (
 id_item INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 id_venda INT UNSIGNED NOT NULL,
 id_produto INT UNSIGNED NOT NULL,
 nome_produto VARCHAR(100) NOT NULL,
 quantidade SMALLINT UNSIGNED NOT NULL,
 preco_unitario DECIMAL(10,2) NOT NULL,
 FOREIGN KEY (id_venda) REFERENCES vendas_balcao(id_venda),
 FOREIGN KEY (id_produto) REFERENCES produtos(id_produto),
 CHECK (quantidade > 0),
 CHECK (preco_unitario >= 0)
) ENGINE=InnoDB;

INSERT INTO alergias (nome) VALUES
 ('Glúten'),('Lactose'),('Proteína do leite'),('Ovo'),('Soja'),
 ('Amendoim'),('Castanhas'),('Peixes'),('Frutos do mar'),('Corantes');

INSERT INTO categorias (nome) VALUES ('salgados'),('doces'),('bebidas');
INSERT INTO produtos (id_categoria, nome, preco, icone) VALUES
 (1,'Coxinha',7.00,'🥟'),(1,'Pastel',8.00,'🥟'),
 (1,'Pão de queijo',5.00,'🧀'),(1,'Sanduíche',10.00,'🥪'),
 (2,'Brigadeiro',4.00,'🍫'),(2,'Chocolate',6.00,'🍫'),
 (2,'Cookie',5.00,'🍪'),(2,'Bolo',7.00,'🍰'),
 (3,'Água',3.00,'💧'),(3,'Suco',6.00,'🧃'),
 (3,'Refrigerante',6.00,'🥤'),(3,'Achocolatado',5.00,'🥛');
