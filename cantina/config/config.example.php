<?php
declare(strict_types=1);

return [
    'host' => '192.168.20.5',
    'port' => 3306,
    'database' => 'cantina',
    'username' => 'cantina_app',
    'password' => 'SUBSTITUA_PELA_SENHA_DO_MYSQL',
    'timezone' => 'America/Sao_Paulo',
    // Informe o caminho do certificado da autoridade MySQL se o servidor exigir TLS.
    'ssl_ca' => '',
    // Somente para estudo: permite adicionar crédito fictício. Não processa pagamentos.
    'demo_recharge' => true,
];
