<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

$name = getenv('SHELBY_NOME') ?: '';
$login = strtolower(getenv('SHELBY_LOGIN') ?: '');
$email = getenv('SHELBY_EMAIL') ?: '';
$password = getenv('SHELBY_SENHA') ?: '';

if (preg_match_all('/./us', $name) < 2 || preg_match_all('/./us', $name) > 120 ||
    !preg_match('/^[a-z0-9._-]{3,60}$/D', $login) ||
    !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8 || strlen($password) > 72) {
    fwrite(STDERR, "Defina SHELBY_NOME, SHELBY_LOGIN, SHELBY_EMAIL e SHELBY_SENHA válidos no ambiente.\n");
    exit(1);
}

try {
    query('INSERT INTO usuarios (nome,login,email,senha_hash,tipo_usuario) VALUES (?,?,?,?,\'cantineiro\')', [
        $name,
        $login,
        $email,
        password_hash($password, PASSWORD_DEFAULT),
    ]);
    fwrite(STDOUT, "Acesso SHELBY criado para o login {$login}.\n");
} catch (PDOException $error) {
    fwrite(STDERR, ($error->errorInfo[1] ?? 0) === 1062
        ? "Esse login já está cadastrado.\n"
        : "Não foi possível criar o usuário. Confira a conexão e o SQL.\n");
    exit(1);
}
