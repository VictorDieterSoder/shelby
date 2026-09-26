<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/bootstrap.php';
if ((int)query("SELECT COUNT(*) FROM usuarios WHERE tipo_usuario='cantineiro'")->fetchColumn() > 0) {
    echo "Ja existe operador. Nenhuma senha alterada.\n";
    exit;
}
$login = 'operador.local.' . bin2hex(random_bytes(3));
$password = bin2hex(random_bytes(12));
query("INSERT INTO usuarios (nome,login,email,senha_hash,tipo_usuario) VALUES (?,?,?,?, 'cantineiro')", [
    'Operador de teste local', $login, 'operador@example.test', password_hash($password, PASSWORD_DEFAULT),
]);
file_put_contents(dirname(__DIR__) . '/config/acesso-local.json', json_encode([
    'login' => $login, 'senha' => $password,
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
echo "Operador criado. Acesso salvo em shelby/config/acesso-local.json.\n";
