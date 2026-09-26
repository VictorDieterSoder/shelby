<?php
declare(strict_types=1);
function dadosTelas(): array {
    $today=date('Y-m-d');
    $products=query('SELECT p.*,c.nome AS categoria,COALESCE(e.quantidade_total,0) AS estoque_total,COALESCE(e.quantidade_vendida,0) AS estoque_vendido,COALESCE(e.quantidade_total-e.quantidade_vendida,0) AS estoque_restante FROM produtos p JOIN categorias c ON c.id_categoria=p.id_categoria LEFT JOIN estoque_diario e ON e.id_produto=p.id_produto AND e.data_estoque=? ORDER BY p.id_produto',[$today])->fetchAll();
    $students=query('SELECT a.id_aluno,u.nome,t.nome AS turma,c.saldo FROM alunos a JOIN usuarios u ON u.id_usuario=a.id_usuario JOIN turmas t ON t.id_turma=a.id_turma JOIN carteiras c ON c.id_usuario=a.id_usuario ORDER BY u.nome')->fetchAll();
    foreach ($students as &$student) $student['responsaveis']=query('SELECT u.nome,r.telefone FROM alunos_responsaveis ar JOIN responsaveis r ON r.id_responsavel=ar.id_responsavel JOIN usuarios u ON u.id_usuario=r.id_usuario WHERE ar.id_aluno=?',[$student['id_aluno']])->fetchAll();
    unset($student);
    $orders=query('SELECT p.*,u.nome AS aluno,t.nome AS turma FROM pedidos p JOIN alunos a ON a.id_aluno=p.id_aluno JOIN usuarios u ON u.id_usuario=a.id_usuario JOIN turmas t ON t.id_turma=a.id_turma ORDER BY p.criado_em DESC')->fetchAll();
    foreach ($orders as &$order) $order['itens']=query('SELECT id_produto,nome_produto,quantidade,preco_unitario FROM itens_pedido WHERE id_pedido=?',[$order['id_pedido']])->fetchAll();
    unset($order);
    $sales=query('SELECT *,COALESCE(data_venda,criado_em) AS data_efetiva FROM vendas_balcao ORDER BY COALESCE(data_venda,criado_em) DESC')->fetchAll();
    foreach ($sales as &$sale) $sale['itens']=query('SELECT id_produto,nome_produto,quantidade,preco_unitario FROM itens_venda_balcao WHERE id_venda=?',[$sale['id_venda']])->fetchAll();
    unset($sale);
    return ['produtos'=>$products,'alunos'=>$students,'pedidos'=>$orders,'vendas'=>$sales,'hoje'=>date('Y-m-d')];
}
