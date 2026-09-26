<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/src/bootstrap.php';
if (!query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='alunos' AND column_name='idade_informada'")->fetchColumn()) db()->exec('ALTER TABLE alunos ADD COLUMN idade_informada TINYINT UNSIGNED NULL');
db()->exec('ALTER TABLE alunos MODIFY data_nascimento DATE NULL');
echo "Cadastro por idade habilitado. Datas existentes preservadas.\n";
