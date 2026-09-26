<?php
// Verificação de requisitos para o inicializador PowerShell.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
if (version_compare(PHP_VERSION, '8.1.0', '<') || !extension_loaded('pdo_mysql')) {
    fwrite(STDERR, "Requer PHP 8.1+ com PDO MySQL habilitado.\n");
    exit(1);
}
echo 'PHP ' . PHP_VERSION . " com PDO MySQL disponível.\n";
