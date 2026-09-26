<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

session_name('cantina_session');
session_start([
    'cookie_httponly' => true,
    'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'cookie_samesite' => 'Lax',
    'use_strict_mode' => true,
]);
if (!isset($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

final class ApiError extends RuntimeException {
    public int $status;
    public function __construct(string $message, int $status = 422) {
        parent::__construct($message);
        $this->status = $status;
    }
}

function reply(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function config(): array {
    static $config;
    if ($config === null) {
        $path = dirname(__DIR__) . '/config/config.php';
        if (!is_file($path)) {
            throw new ApiError('Configure config/config.php seguindo o LEIA-ME.md.', 503);
        }
        $config = require $path;
        date_default_timezone_set($config['timezone'] ?? 'America/Sao_Paulo');
    }
    return $config;
}

function db(): PDO {
    static $pdo;
    if (!$pdo) {
        $c = config();
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        if (!empty($c['ssl_ca'])) {
            $options[PDO::MYSQL_ATTR_SSL_CA] = $c['ssl_ca'];
            $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
        }
        $pdo = new PDO(
            "mysql:host={$c['host']};port={$c['port']};dbname={$c['database']};charset=utf8mb4",
            $c['username'], $c['password'], $options
        );
        $pdo->exec("SET SESSION time_zone = '" . date('P') . "'");
    }
    return $pdo;
}

function query(string $sql, array $params = []): PDOStatement {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function textField(array $data, string $key, int $max, int $min = 1): string {
    if (!isset($data[$key]) || !is_string($data[$key])) {
        throw new ApiError("Informe o campo: $key.");
    }
    $value = trim($data[$key]);
    $length = preg_match_all('/./us', $value);
    if ($length === false || $length < $min || $length > $max) {
        throw new ApiError("O campo $key deve ter entre $min e $max caracteres.");
    }
    return $value;
}

function positiveId(mixed $value): int {
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 4294967295]]);
    if ($id === false) throw new ApiError('Identificador inválido.');
    return $id;
}

function cents(mixed $value): int {
    if (!is_string($value) && !is_int($value)) throw new ApiError('Valor monetário inválido.');
    $value = str_replace(',', '.', trim((string)$value));
    if (!preg_match('/^\d{1,8}(?:\.\d{1,2})?$/D', $value)) throw new ApiError('Informe um valor com até duas casas decimais.');
    $parts = explode('.', $value);
    return ((int)$parts[0] * 100) + (int)str_pad($parts[1] ?? '', 2, '0');
}

function decimal(int $value): string {
    return intdiv($value, 100) . '.' . str_pad((string)($value % 100), 2, '0', STR_PAD_LEFT);
}

function hasStudentAllergen(string $ingredients, array $allergies): bool {
    $normalize = static function (string $value): string {
        $ascii = function_exists('iconv') ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) : false;
        return strtolower($ascii === false ? $value : $ascii);
    };
    $ingredients = $normalize($ingredients);
    foreach ($allergies as $allergy) {
        $allergy = trim($normalize((string)$allergy));
        if ($allergy !== '' && str_contains($ingredients, $allergy)) return true;
    }
    return false;
}

function requireUser(?string $role = null): array {
    if (empty($_SESSION['uid'])) throw new ApiError('Entre para continuar.', 401);
    $user = query('SELECT id_usuario,nome,login,email,tipo_usuario FROM usuarios WHERE id_usuario=?', [$_SESSION['uid']])->fetch();
    if (!$user) throw new ApiError('Sessão inválida.', 401);
    if ($role && $user['tipo_usuario'] !== $role) throw new ApiError('Acesso não permitido.', 403);
    return $user;
}

function guardianId(array $user): int {
    return (int)query('SELECT id_responsavel FROM responsaveis WHERE id_usuario=?', [$user['id_usuario']])->fetchColumn();
}

function linkedStudent(int $id, int $guardian): array {
    $row = query('SELECT a.*,u.nome FROM alunos a JOIN usuarios u ON u.id_usuario=a.id_usuario JOIN alunos_responsaveis ar ON ar.id_aluno=a.id_aluno WHERE a.id_aluno=? AND ar.id_responsavel=?', [$id, $guardian])->fetch();
    if (!$row) throw new ApiError('Aluno não vinculado ao responsável.', 403);
    return $row;
}

function createUser(array $data, string $role): int {
    $name = textField($data, 'nome', 120, 2);
    $login = strtolower(textField($data, 'login', 60, 3));
    if (!preg_match('/^[a-z0-9._-]+$/D', $login)) throw new ApiError('Login: use letras sem acento, números, ponto, hífen ou sublinhado.');
    $email = textField($data, 'email', 254);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ApiError('E-mail inválido.');
    $password = $data['senha'] ?? null;
    if (!is_string($password) || strlen($password) < 8 || strlen($password) > 72) throw new ApiError('A senha deve ter entre 8 e 72 bytes.');
    if ($password !== ($data['confirmar_senha'] ?? null)) throw new ApiError('As senhas não coincidem.');
    query('INSERT INTO usuarios (nome,login,email,senha_hash,tipo_usuario) VALUES (?,?,?,?,?)', [$name,$login,$email,password_hash($password, PASSWORD_DEFAULT),$role]);
    $id = (int)db()->lastInsertId();
    query('INSERT INTO carteiras (id_usuario) VALUES (?)', [$id]);
    return $id;
}

function transaction(callable $work): mixed {
    db()->beginTransaction();
    try {
        $result = $work();
        db()->commit();
        return $result;
    } catch (Throwable $error) {
        if (db()->inTransaction()) db()->rollBack();
        throw $error;
    }
}

function operation(array $user, string $action, array $data, callable $work): array {
    $key = $data['chave'] ?? '';
    if (!is_string($key) || !preg_match('/^[a-f0-9-]{36}$/D', $key)) throw new ApiError('Chave da operação inválida.');
    return transaction(function () use ($user, $action, $key, $work) {
        try {
            query('INSERT INTO requisicoes (id_usuario,chave,acao) VALUES (?,?,?)', [$user['id_usuario'],$key,$action]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) !== 1062) throw $e;
            $old = query('SELECT acao,resposta FROM requisicoes WHERE id_usuario=? AND chave=? FOR UPDATE', [$user['id_usuario'],$key])->fetch();
            if (!$old || $old['acao'] !== $action || !$old['resposta']) throw new ApiError('Operação em conflito. Atualize a página.', 409);
            return json_decode($old['resposta'], true, 512, JSON_THROW_ON_ERROR);
        }
        $result = $work();
        query('UPDATE requisicoes SET resposta=? WHERE id_usuario=? AND chave=?', [json_encode($result, JSON_THROW_ON_ERROR),$user['id_usuario'],$key]);
        return $result;
    });
}
