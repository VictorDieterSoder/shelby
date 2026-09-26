<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/bootstrap.php';
foreach (['id_aluno'=>'INT UNSIGNED NULL','observacao'=>"VARCHAR(500) NOT NULL DEFAULT ''",'data_venda'=>'DATETIME NULL'] as $name=>$definition) {
    if (!query('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', ['vendas_balcao',$name])->fetchColumn()) {
        db()->exec("ALTER TABLE vendas_balcao ADD COLUMN $name $definition");
        echo "Campo criado: $name\n";
    }
}
if (!query("SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='vendas_balcao' AND constraint_name='fk_balcao_aluno'")->fetchColumn()) db()->exec('ALTER TABLE vendas_balcao ADD CONSTRAINT fk_balcao_aluno FOREIGN KEY (id_aluno) REFERENCES alunos(id_aluno)');
db()->exec("ALTER TABLE categorias MODIFY nome ENUM('salgados','doces','bebidas','lanches','outros') NOT NULL");
foreach (['lanches','outros'] as $name) query('INSERT INTO categorias (nome) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nome=?)', [$name,$name]);
echo "Banco atualizado sem apagar registros.\n";
