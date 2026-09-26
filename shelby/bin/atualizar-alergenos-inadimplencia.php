<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/bootstrap.php';

$columns = [
    'produtos' => ['ingredientes' => "VARCHAR(2000) NOT NULL DEFAULT ''"],
    'vendas_balcao' => [
        'id_aluno' => 'INT UNSIGNED NULL',
        'observacao' => "VARCHAR(500) NOT NULL DEFAULT ''",
        'data_venda' => 'DATETIME NULL',
    ],
];
foreach ($columns as $table => $fields) {
    foreach ($fields as $column => $definition) {
        $exists = query('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [$table, $column])->fetchColumn();
        if (!$exists) {
            db()->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
            echo "Coluna $table.$column criada.\n";
        } else echo "Coluna $table.$column já existe.\n";
    }
}
$index = query("SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='vendas_balcao' AND index_name='ix_venda_aluno_pagamento'")->fetchColumn();
if (!$index) db()->exec('CREATE INDEX ix_venda_aluno_pagamento ON vendas_balcao (id_aluno, pagamento)');
$constraint = query("SELECT 1 FROM information_schema.key_column_usage WHERE constraint_schema=DATABASE() AND table_name='vendas_balcao' AND column_name='id_aluno' AND referenced_table_name='alunos'")->fetchColumn();
if (!$constraint) db()->exec('ALTER TABLE vendas_balcao ADD CONSTRAINT fk_venda_aluno FOREIGN KEY (id_aluno) REFERENCES alunos(id_aluno)');
echo "Migração de ingredientes e limite de inadimplência concluída.\n";
