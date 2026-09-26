<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/bootstrap.php';

$exists = query("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='estoque_diario'")->fetchColumn();
if (!$exists) {
    db()->exec("CREATE TABLE estoque_diario (
        id_produto INT UNSIGNED NOT NULL,
        data_estoque DATE NOT NULL,
        quantidade_total SMALLINT UNSIGNED NOT NULL,
        quantidade_vendida SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (id_produto, data_estoque),
        INDEX ix_estoque_data (data_estoque),
        FOREIGN KEY (id_produto) REFERENCES produtos(id_produto),
        CHECK (quantidade_vendida <= quantidade_total)
    ) ENGINE=InnoDB");
    echo "Tabela de estoque diário criada.\n";
} else {
    echo "Tabela de estoque diário já existe.\n";
}
