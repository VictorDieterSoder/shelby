<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';

try {
    $action=$_GET['acao']??'sessao';
    if (!is_string($action)) throw new ApiError('Ação inválida.');
    $reads=['sessao','gestao','telas'];
    $writes=['entrar','sair','produto_salvar','produto_status','pedido_status','venda_balcao','venda_pagamento','disponibilidade','cadastrar_operador'];
    if (!in_array($action,array_merge($reads,$writes),true)) throw new ApiError('Rota não encontrada.',404);
    $data=[];
    if (in_array($action,$writes,true)) {
        if (($_SERVER['REQUEST_METHOD']??'GET')!=='POST') throw new ApiError('Use POST.',405);
        if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) throw new ApiError('Sessão expirada. Atualize a página.',403);
        $raw=file_get_contents('php://input',false,null,0,65537);
        if (strlen($raw)>65536) throw new ApiError('Requisição muito grande.',413);
        $data=json_decode($raw,true,32,JSON_THROW_ON_ERROR);
        if (!is_array($data)) throw new ApiError('Corpo JSON inválido.');
    } elseif (($_SERVER['REQUEST_METHOD']??'GET')!=='GET') {
        throw new ApiError('Use GET.',405);
    }

    switch ($action) {
        case 'telas':
            requireUser('cantineiro');
            require dirname(__DIR__) . '/src/dados-telas.php';
            reply(dadosTelas());
        case 'cadastrar_operador':
            requireUser('cantineiro');
            $id = transaction(fn() => createUser($data, 'cantineiro'));
            reply(['mensagem'=>'Operador cadastrado.', 'id_usuario'=>$id]);
        case 'disponibilidade':
            requireUser('cantineiro');
            $ids = $data['produtos'] ?? null;
            if (!is_array($ids) || count($ids)>1000) throw new ApiError('Lista de produtos invalida.');
            $ids = array_values(array_unique(array_map('positiveId', $ids)));
            $stock = $data['estoques'] ?? [];
            if (!is_array($stock)) throw new ApiError('Quantidades de estoque inválidas.');
            $quantities=[];
            foreach($ids as $id){
                if(!array_key_exists($id,$stock)) throw new ApiError('Informe a quantidade de cada item selecionado.');
                $quantity=filter_var($stock[$id],FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>9999]]);
                if($quantity===false) throw new ApiError('Cada item selecionado precisa ter entre 1 e 9.999 unidades.');
                $quantities[$id]=$quantity;
            }
            transaction(function() use($ids,$quantities) {
                $existing=array_map('intval',query('SELECT id_produto FROM produtos FOR UPDATE')->fetchAll(PDO::FETCH_COLUMN));
                foreach($ids as $id) if(!in_array($id,$existing,true)) throw new ApiError('Produto não encontrado. Atualize a lista.');
                $today=date('Y-m-d');
                foreach($quantities as $id=>$quantity){
                    $row=query('SELECT quantidade_vendida FROM estoque_diario WHERE id_produto=? AND data_estoque=? FOR UPDATE',[$id,$today])->fetch();
                    if($row){
                        if((int)$row['quantidade_vendida']>$quantity) throw new ApiError('A quantidade não pode ficar abaixo das unidades já vendidas.');
                        query('UPDATE estoque_diario SET quantidade_total=? WHERE id_produto=? AND data_estoque=?',[$quantity,$id,$today]);
                    }else query('INSERT INTO estoque_diario (id_produto,data_estoque,quantidade_total) VALUES (?,?,?)',[$id,$today,$quantity]);
                }
                if($ids){
                    $marks=implode(',',array_fill(0,count($ids),'?'));
                    query("UPDATE estoque_diario SET quantidade_total=quantidade_vendida WHERE data_estoque=? AND id_produto NOT IN ($marks)",[$today,...$ids]);
                    query('UPDATE produtos SET ativo=0');
                    query("UPDATE produtos SET ativo=1 WHERE id_produto IN ($marks)",$ids);
                }else{
                    query('UPDATE estoque_diario SET quantidade_total=quantidade_vendida WHERE data_estoque=?',[$today]);
                    query('UPDATE produtos SET ativo=0');
                }
            });
            reply(['mensagem'=>'Disponibilidade salva.']);
        case 'sessao':
            $sessionUser = null;
            if (!empty($_SESSION['uid'])) {
                $sessionUser = query('SELECT id_usuario,nome,login,email,tipo_usuario FROM usuarios WHERE id_usuario=?', [$_SESSION['uid']])->fetch();
                if (!$sessionUser) unset($_SESSION['uid']);
            }
            reply(['csrf'=>$_SESSION['csrf'],'usuario'=>$sessionUser ?: null]);

        case 'entrar':
            $login=strtolower(textField($data,'login',254));
            $password=$data['senha']??'';
            if (!is_string($password)||strlen($password)>72) throw new ApiError('Usuário ou senha incorretos.',401);
            if (($_SESSION['tentativas']['ate']??0)>time()) throw new ApiError('Aguarde um minuto antes de tentar novamente.',429);
            $user=query("SELECT id_usuario,senha_hash,tipo_usuario FROM usuarios WHERE (login=? OR email=?) AND tipo_usuario='cantineiro' ORDER BY id_usuario LIMIT 1",[$login,$login])->fetch();
            if (!$user||!password_verify($password,$user['senha_hash'])) {
                $count=($_SESSION['tentativas']['quantidade']??0)+1;
                $_SESSION['tentativas']=['quantidade'=>$count,'ate'=>$count>=5?time()+60:0];
                throw new ApiError('Usuário ou senha incorretos.',401);
            }
            if ($user['tipo_usuario']!=='cantineiro') throw new ApiError('Esta conta não tem acesso à gestão.',403);
            unset($_SESSION['tentativas']);
            session_regenerate_id(true);
            $_SESSION['uid']=(int)$user['id_usuario'];
            reply(['mensagem'=>'Login realizado.']);

        case 'sair':
            $_SESSION=[];
            session_regenerate_id(true);
            $_SESSION['csrf']=bin2hex(random_bytes(32));
            reply(['mensagem'=>'Você saiu.']);

        case 'gestao':
            requireUser('cantineiro');
            $today=date('Y-m-d');
            $products=query('SELECT p.*,c.nome AS categoria FROM produtos p JOIN categorias c ON c.id_categoria=p.id_categoria ORDER BY p.ativo DESC,c.id_categoria,p.nome')->fetchAll();
            $orders=query('SELECT p.*,u.nome AS aluno FROM pedidos p JOIN alunos a ON a.id_aluno=p.id_aluno JOIN usuarios u ON u.id_usuario=a.id_usuario ORDER BY p.id_pedido DESC LIMIT 100')->fetchAll();
            foreach ($orders as &$order) $order['itens']=query('SELECT nome_produto,quantidade,preco_unitario FROM itens_pedido WHERE id_pedido=?',[$order['id_pedido']])->fetchAll();
            unset($order);
            $sales=query('SELECT v.*,u.nome AS operador FROM vendas_balcao v JOIN usuarios u ON u.id_usuario=v.id_usuario ORDER BY v.id_venda DESC LIMIT 100')->fetchAll();
            foreach ($sales as &$sale) $sale['itens']=query('SELECT nome_produto,quantidade,preco_unitario FROM itens_venda_balcao WHERE id_venda=?',[$sale['id_venda']])->fetchAll();
            unset($sale);
            $summary=query("SELECT COUNT(*) AS pedidos,COALESCE(SUM(valor_total),0) AS total FROM pedidos WHERE DATE(criado_em)=? AND status<>'cancelado'",[$today])->fetch();
            $counter=query("SELECT COUNT(*) AS vendas,COALESCE(SUM(CASE WHEN pagamento<>'pendente' THEN valor_total ELSE 0 END),0) AS total FROM vendas_balcao WHERE DATE(criado_em)=?",[$today])->fetch();
            $ranking=query("SELECT i.nome_produto,SUM(i.quantidade) AS quantidade FROM itens_pedido i JOIN pedidos p ON p.id_pedido=i.id_pedido WHERE p.criado_em>=DATE_FORMAT(CURDATE(),'%Y-%m-01') AND p.status<>'cancelado' GROUP BY i.nome_produto ORDER BY quantidade DESC LIMIT 5")->fetchAll();
            $students=query("SELECT a.id_aluno,u.nome,t.nome AS turma,c.saldo,COALESCE(SUM(CASE WHEN p.status<>'cancelado' AND DATE(p.criado_em)=CURDATE() THEN p.valor_total ELSE 0 END),0) AS gasto_hoje FROM alunos a JOIN usuarios u ON u.id_usuario=a.id_usuario JOIN turmas t ON t.id_turma=a.id_turma JOIN carteiras c ON c.id_usuario=a.id_usuario LEFT JOIN pedidos p ON p.id_aluno=a.id_aluno GROUP BY a.id_aluno,u.nome,t.nome,c.saldo ORDER BY u.nome")->fetchAll();
            $entries=query("SELECT m.id_movimentacao,m.tipo,m.valor,m.descricao,m.criado_em,uo.nome AS origem,ud.nome AS destino FROM movimentacoes m LEFT JOIN carteiras co ON co.id_carteira=m.id_carteira_origem LEFT JOIN usuarios uo ON uo.id_usuario=co.id_usuario LEFT JOIN carteiras cd ON cd.id_carteira=m.id_carteira_destino LEFT JOIN usuarios ud ON ud.id_usuario=cd.id_usuario ORDER BY m.id_movimentacao DESC LIMIT 100")->fetchAll();
            reply(['produtos'=>$products,'pedidos'=>$orders,'vendas_balcao'=>$sales,'alunos'=>$students,'movimentacoes'=>$entries,'resumo'=>['pedidos'=>(int)$summary['pedidos'],'vendas'=>(int)$counter['vendas'],'total'=>number_format((float)$summary['total']+(float)$counter['total'],2,'.','')],'mais_vendidos'=>$ranking]);

        case 'produto_salvar':
            requireUser('cantineiro');
            $name=textField($data,'nome',100,2);
            $category=$data['categoria']??'';
            if (!in_array($category,['salgados','doces','bebidas','lanches','outros'],true)) throw new ApiError('Categoria inválida.');
            $price=cents($data['preco']??'');
            $description=isset($data['descricao'])&&is_string($data['descricao'])?trim($data['descricao']):'';
            $ingredients=isset($data['ingredientes'])&&is_string($data['ingredientes'])?trim($data['ingredientes']):'';
            if (preg_match_all('/./us',$ingredients)>2000) throw new ApiError('Ingredientes: use no máximo 2.000 caracteres.');
            $id=empty($data['id_produto'])?null:positiveId($data['id_produto']);
            $categoryId=(int)query('SELECT id_categoria FROM categorias WHERE nome=?',[$category])->fetchColumn();
            if ($id) query('UPDATE produtos SET id_categoria=?,nome=?,descricao=?,ingredientes=?,preco=? WHERE id_produto=?',[$categoryId,$name,$description,$ingredients,decimal($price),$id]);
            else query('INSERT INTO produtos (id_categoria,nome,descricao,ingredientes,preco,ativo) VALUES (?,?,?,?,?,1)',[$categoryId,$name,$description,$ingredients,decimal($price)]);
            reply(['mensagem'=>'Produto salvo.']);

        case 'produto_status':
            requireUser('cantineiro');
            query('UPDATE produtos SET ativo=IF(ativo=1,0,1) WHERE id_produto=?',[positiveId($data['id_produto']??null)]);
            reply(['mensagem'=>'Disponibilidade atualizada.']);

        case 'pedido_status':
            requireUser('cantineiro');
            $status=$data['status']??'';
            if (!in_array($status,['pago','preparando','pronto','entregue','retirado'],true)) throw new ApiError('Situação inválida.');
            query("UPDATE pedidos SET status=? WHERE id_pedido=? AND status<>'cancelado'",[$status,positiveId($data['id_pedido']??null)]);
            reply(['mensagem'=>'Pedido atualizado.']);

        case 'venda_balcao':
            $user=requireUser('cantineiro');
            $customer=textField($data,'cliente',120,2);
            $studentId=empty($data['id_aluno'])?null:positiveId($data['id_aluno']);
            if ($studentId) {
                $student=query('SELECT u.nome FROM alunos a JOIN usuarios u ON u.id_usuario=a.id_usuario WHERE a.id_aluno=?',[$studentId])->fetch();
                if (!$student) throw new ApiError('Aluno nao encontrado.');
                $customer=$student['nome'];
            }
            $note=$data['observacao']??'';
            if (!is_string($note)||preg_match_all('/./us',$note)>500) throw new ApiError('Observacao invalida.');
            $soldAt=$data['data_venda']??date('Y-m-d H:i:s');
            $date=is_string($soldAt)?DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$soldAt):false;
            if (!$date||$date->format('Y-m-d H:i:s')!==$soldAt||$date>new DateTimeImmutable('+5 minutes')) throw new ApiError('Data da venda invalida.');
            $payment=$data['pagamento']??'';
            if (!in_array($payment,['dinheiro','pix','cartao','pendente'],true)) throw new ApiError('Forma de pagamento inválida.');
            $items=$data['itens']??null;
            if (!is_array($items)||count($items)<1||count($items)>100) throw new ApiError('Venda sem itens.');
            $quantities=[];
            foreach($items as $item){
                if(!is_array($item)) throw new ApiError('Item inválido.');
                $id=positiveId($item['id_produto']??null);
                $quantity=positiveId($item['quantidade']??null);
                if($quantity>99||isset($quantities[$id])) throw new ApiError('Quantidade inválida.');
                $quantities[$id]=$quantity;
            }
            $result=operation($user,$action,$data,function()use($user,$customer,$payment,$quantities,$studentId,$note,$soldAt){
                if ($studentId && !query('SELECT id_aluno FROM alunos WHERE id_aluno=? FOR UPDATE',[$studentId])->fetch()) throw new ApiError('Aluno nao encontrado.');
                $marks=implode(',',array_fill(0,count($quantities),'?'));
                $today=date('Y-m-d');
                $products=query("SELECT p.*,e.quantidade_total,e.quantidade_vendida FROM produtos p JOIN estoque_diario e ON e.id_produto=p.id_produto AND e.data_estoque=? WHERE p.ativo=1 AND p.id_produto IN ($marks) FOR UPDATE",[$today,...array_keys($quantities)])->fetchAll();
                if(count($products)!==count($quantities)) throw new ApiError('Produto indisponível. Atualize a lista.');
                $total=0;
                foreach($products as $product){
                    $id=(int)$product['id_produto'];
                    if((int)$product['quantidade_total']-(int)$product['quantidade_vendida']<$quantities[$id]) throw new ApiError('Estoque insuficiente para '.$product['nome'].'.');
                    $total+=cents($product['preco'])*$quantities[$id];
                }
                if($total<1||$total>9999999999) throw new ApiError('Total da venda inválido.');
                if ($studentId) {
                    $debt=cents(query("SELECT COALESCE(SUM(valor_total),0) FROM vendas_balcao WHERE id_aluno=? AND pagamento='pendente'",[$studentId])->fetchColumn());
                    $limit=25000;
                    $limitMessage='Não pode anotar, limite atingido. Requer pagamento à vista. Apenas Pix ou dinheiro serão aceitos.';
                    if (($debt >= $limit || $debt+$total>$limit) && !in_array($payment,['pix','dinheiro'],true)) throw new ApiError($limitMessage);
                    if ($payment==='pendente' && $debt+$total>$limit) throw new ApiError($limitMessage);
                }
                query('INSERT INTO vendas_balcao (id_usuario,cliente,pagamento,valor_total,criado_em,id_aluno,observacao,data_venda) VALUES (?,?,?,?,?,?,?,?)',[$user['id_usuario'],$customer,$payment,decimal($total),date('Y-m-d H:i:s'),$studentId,$note,$soldAt]);
                $saleId=(int)db()->lastInsertId();
                foreach($products as $product){
                    $id=(int)$product['id_produto'];$qty=$quantities[$id];
                    query('INSERT INTO itens_venda_balcao (id_venda,id_produto,nome_produto,quantidade,preco_unitario) VALUES (?,?,?,?,?)',[$saleId,$id,$product['nome'],$qty,$product['preco']]);
                    query('UPDATE estoque_diario SET quantidade_vendida=quantidade_vendida+? WHERE id_produto=? AND data_estoque=? AND quantidade_total-quantidade_vendida>=?',[$qty,$id,$today,$qty]);
                }
                return ['mensagem'=>'Venda registrada.','id_venda'=>$saleId];
            });
            reply($result);

        case 'venda_pagamento':
            requireUser('cantineiro');
            $payment=$data['pagamento']??'';
            if (!in_array($payment,['dinheiro','pix','cartao'],true)) throw new ApiError('Forma de pagamento inválida.');
            query("UPDATE vendas_balcao SET pagamento=? WHERE id_venda=? AND pagamento='pendente'",[$payment,positiveId($data['id_venda']??null)]);
            reply(['mensagem'=>'Recebimento atualizado.']);
    }
} catch (ApiError $error) {
    reply(['erro'=>$error->getMessage()],$error->status);
} catch (JsonException $error) {
    reply(['erro'=>'JSON inválido.'],400);
} catch (PDOException $error) {
    error_log((string)$error);
    if (($error->errorInfo[1]??0)===1062) reply(['erro'=>'Este login já está em uso. Escolha outro.'],409);
    reply(['erro'=>'Não foi possível acessar o banco. Confira a configuração e a importação do SQL.'],503);
} catch (Throwable $error) {
    error_log((string)$error);
    reply(['erro'=>'Não foi possível concluir a operação. Consulte o terminal do servidor.'],500);
}
