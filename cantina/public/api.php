<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';

try {
    $action = $_GET['acao'] ?? 'sessao';
    if (!is_string($action)) throw new ApiError('Ação inválida.');
    $reads = ['sessao','catalogo','painel','pedidos','extrato'];
    $writes = ['cadastrar_responsavel','entrar','sair','cadastrar_aluno','editar_aluno','recarga','transferir','limite','comprar','cadastro_original','entrar_responsavel'];
    if (!in_array($action, array_merge($reads,$writes), true)) throw new ApiError('Rota não encontrada.',404);
    $method = $_SERVER['REQUEST_METHOD'];
    $data = [];
    if (in_array($action, $writes, true)) {
        if ($method !== 'POST') throw new ApiError('Use POST.',405);
        if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) throw new ApiError('Sessão expirada. Atualize a página.',403);
        $raw = file_get_contents('php://input', false, null, 0, 65537);
        if (strlen($raw) > 65536) throw new ApiError('Requisição muito grande.',413);
        $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($data)) throw new ApiError('Corpo JSON inválido.');
    } elseif ($method !== 'GET') {
        throw new ApiError('Use GET.',405);
    }

    switch ($action) {
        case 'cadastro_original':
            require dirname(__DIR__).'/src/telas-originais.php';
            reply(cadastrarTelaOriginal($data));
        case 'entrar_responsavel':
            require dirname(__DIR__).'/src/telas-originais.php';
            entrarResponsavelOriginal($data);
            reply(['mensagem'=>'Login realizado.']);
        case 'sessao':
            $c = config();
            $user = null;
            if (!empty($_SESSION['uid'])) {
                $user = query('SELECT id_usuario,nome,login,email,tipo_usuario FROM usuarios WHERE id_usuario=?', [$_SESSION['uid']])->fetch();
                if (!$user) unset($_SESSION['uid']);
            }
            reply(['csrf'=>$_SESSION['csrf'], 'usuario'=>$user ?: null, 'recarga_demo'=>(bool)$c['demo_recharge']]);

        case 'cadastrar_responsavel':
            if (!empty($_SESSION['uid'])) throw new ApiError('Saia da conta antes de criar outro responsável.');
            $id = transaction(function () use ($data) {
                $phone = textField($data,'telefone',25,8);
                if (!preg_match('/^[+()\d\s-]+$/D', $phone)) throw new ApiError('Telefone inválido.');
                $id = createUser($data,'responsavel');
                query('INSERT INTO responsaveis (id_usuario,telefone) VALUES (?,?)',[$id,$phone]);
                return $id;
            });
            session_regenerate_id(true);
            $_SESSION['uid']=$id;
            reply(['mensagem'=>'Conta criada. Agora cadastre o aluno.']);

        case 'entrar':
            $login = strtolower(textField($data,'login',60));
            $password = $data['senha'] ?? '';
            if (!is_string($password) || strlen($password)>72) throw new ApiError('Usuário ou senha incorretos.',401);
            if (($_SESSION['tentativas']['ate'] ?? 0) > time()) throw new ApiError('Aguarde um minuto antes de tentar novamente.',429);
            $user = query('SELECT * FROM usuarios WHERE login=?',[$login])->fetch();
            if (!$user || !password_verify($password,$user['senha_hash'])) {
                $count = ($_SESSION['tentativas']['quantidade'] ?? 0)+1;
                $_SESSION['tentativas']=['quantidade'=>$count,'ate'=>$count>=5 ? time()+60 : 0];
                throw new ApiError('Usuário ou senha incorretos.',401);
            }
            unset($_SESSION['tentativas']);
            session_regenerate_id(true);
            $_SESSION['uid']=(int)$user['id_usuario'];
            reply(['mensagem'=>'Login realizado.']);

        case 'sair':
            $_SESSION=[];
            session_regenerate_id(true);
            $_SESSION['csrf']=bin2hex(random_bytes(32));
            reply(['mensagem'=>'Você saiu.']);

        case 'catalogo':
            $user=requireUser();
            $products=query('SELECT p.*,c.nome AS categoria,e.quantidade_total-e.quantidade_vendida AS estoque_restante FROM produtos p JOIN categorias c ON c.id_categoria=p.id_categoria JOIN estoque_diario e ON e.id_produto=p.id_produto AND e.data_estoque=? WHERE p.ativo=1 AND e.quantidade_total>e.quantidade_vendida ORDER BY c.id_categoria,p.id_produto',[date('Y-m-d')])->fetchAll();
            if ($user['tipo_usuario']==='aluno') {
                $allergies=query('SELECT al.nome FROM alunos a JOIN alunos_alergias aa ON aa.id_aluno=a.id_aluno JOIN alergias al ON al.id_alergia=aa.id_alergia WHERE a.id_usuario=?',[$user['id_usuario']])->fetchAll(PDO::FETCH_COLUMN);
                $products=array_values(array_filter($products,fn($product)=>!hasStudentAllergen((string)$product['ingredientes'],$allergies)));
            }
            reply(['produtos'=>$products, 'alergias'=>query('SELECT * FROM alergias ORDER BY id_alergia')->fetchAll()]);

        case 'painel':
            $user=requireUser();
            $wallet=query('SELECT id_carteira,saldo FROM carteiras WHERE id_usuario=?',[$user['id_usuario']])->fetch();
            $students=[];
            if ($user['tipo_usuario']==='responsavel') {
                $students=query('SELECT a.*,u.nome,u.login,u.email,t.nome AS turma,c.saldo FROM alunos a JOIN usuarios u ON u.id_usuario=a.id_usuario JOIN turmas t ON t.id_turma=a.id_turma JOIN carteiras c ON c.id_usuario=a.id_usuario JOIN alunos_responsaveis ar ON ar.id_aluno=a.id_aluno WHERE ar.id_responsavel=? ORDER BY u.nome',[guardianId($user)])->fetchAll();
            } else {
                $students=query('SELECT a.*,u.nome,u.login,t.nome AS turma,c.saldo FROM alunos a JOIN usuarios u ON u.id_usuario=a.id_usuario JOIN turmas t ON t.id_turma=a.id_turma JOIN carteiras c ON c.id_usuario=a.id_usuario WHERE a.id_usuario=?',[$user['id_usuario']])->fetchAll();
            }
            foreach ($students as &$student) {
                $student['alergias']=query('SELECT al.nome FROM alergias al JOIN alunos_alergias aa ON aa.id_alergia=al.id_alergia WHERE aa.id_aluno=?',[$student['id_aluno']])->fetchAll(PDO::FETCH_COLUMN);
                $student['alergias_ids']=query('SELECT id_alergia FROM alunos_alergias WHERE id_aluno=?',[$student['id_aluno']])->fetchAll(PDO::FETCH_COLUMN);
                $student['gasto_hoje']=query("SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE id_aluno=? AND criado_em>=? AND criado_em<? AND status<>'cancelado'",[$student['id_aluno'],date('Y-m-d').' 00:00:00',date('Y-m-d',strtotime('+1 day')).' 00:00:00'])->fetchColumn();
            }
            unset($student);
            $allergies=query('SELECT id_alergia,nome FROM alergias ORDER BY nome')->fetchAll();
            reply(['usuario'=>$user,'carteira'=>$wallet,'alunos'=>$students,'alergias_disponiveis'=>$allergies,'recarga_demo'=>(bool)config()['demo_recharge']]);

        case 'cadastrar_aluno':
            $user=requireUser('responsavel');
            $result=transaction(function () use ($data,$user) {
                $birth=textField($data,'data_nascimento',10,10);
                $date=DateTimeImmutable::createFromFormat('!Y-m-d',$birth);
                if (!$date || $date->format('Y-m-d')!==$birth || $date>=new DateTimeImmutable('today') || $date<new DateTimeImmutable('-120 years')) throw new ApiError('Data de nascimento inválida.');
                $class=textField($data,'turma',40);
                $relation=textField($data,'parentesco',40);
                $allergies=$data['alergias'] ?? [];
                if (!is_array($allergies) || count($allergies)>30) throw new ApiError('Lista de alergias inválida.');
                $valid=query('SELECT id_alergia FROM alergias')->fetchAll(PDO::FETCH_COLUMN);
                $ids=[];
                foreach ($allergies as $allergy) {
                    $allergy=positiveId($allergy);
                    if (!in_array($allergy,array_map('intval',$valid),true)) throw new ApiError('Alergia inválida.');
                    $ids[$allergy]=$allergy;
                }
                $uid=createUser($data,'aluno');
                query('INSERT INTO turmas (nome,ano_letivo) VALUES (?,?) ON DUPLICATE KEY UPDATE id_turma=LAST_INSERT_ID(id_turma)',[$class,(int)date('Y')]);
                $tid=(int)db()->lastInsertId();
                query('INSERT INTO alunos (id_usuario,id_turma,data_nascimento) VALUES (?,?,?)',[$uid,$tid,$birth]);
                $aid=(int)db()->lastInsertId();
                query('INSERT INTO alunos_responsaveis (id_aluno,id_responsavel,parentesco) VALUES (?,?,?)',[$aid,guardianId($user),$relation]);
                foreach ($ids as $allergy) query('INSERT INTO alunos_alergias (id_aluno,id_alergia) VALUES (?,?)',[$aid,$allergy]);
                return ['mensagem'=>'Aluno cadastrado. Ele já pode entrar com o próprio login e senha.'];
            });
            reply($result);

        case 'editar_aluno':
            $user=requireUser('responsavel');
            $guardian=guardianId($user);
            $studentId=positiveId($data['id_aluno']??null);
            $student=linkedStudent($studentId,$guardian);
            $name=textField($data,'nome',120,2);
            $login=strtolower(textField($data,'login',60,3));
            if (!preg_match('/^[a-z0-9._-]+$/D',$login)) throw new ApiError('Usuário: use letras sem acento, números, ponto, hífen ou sublinhado.');
            $email=textField($data,'email',254);
            if (!filter_var($email,FILTER_VALIDATE_EMAIL)) throw new ApiError('E-mail inválido.');
            $age=positiveId($data['idade']??null);
            if ($age<11||$age>18) throw new ApiError('Idade inválida.');
            $class=textField($data,'turma',40);
            $allergies=$data['alergias']??[];
            if (!is_array($allergies)||count($allergies)>30) throw new ApiError('Lista de alergias inválida.');
            $valid=array_map('intval',query('SELECT id_alergia FROM alergias')->fetchAll(PDO::FETCH_COLUMN));
            $ids=[];
            foreach($allergies as $allergy){$id=positiveId($allergy);if(!in_array($id,$valid,true))throw new ApiError('Alergia inválida.');$ids[$id]=$id;}
            $password=$data['senha']??'';
            if (!is_string($password)||strlen($password)>72) throw new ApiError('A senha deve ter no máximo 72 bytes.');
            if ($password!==''&&strlen($password)<8) throw new ApiError('A nova senha deve ter pelo menos 8 caracteres.');
            if ($password!==''&&$password!==($data['confirmar_senha']??null)) throw new ApiError('As senhas não coincidem.');
            transaction(function() use($student,$studentId,$name,$login,$email,$age,$class,$ids,$password){
                query('INSERT INTO turmas (nome,ano_letivo) VALUES (?,?) ON DUPLICATE KEY UPDATE id_turma=LAST_INSERT_ID(id_turma)',[$class,(int)date('Y')]);
                $classId=(int)db()->lastInsertId();
                query('UPDATE usuarios SET nome=?,login=?,email=?'.($password!==''?',senha_hash=?':'').' WHERE id_usuario=?',$password!==''?[$name,$login,$email,password_hash($password,PASSWORD_DEFAULT),$student['id_usuario']]:[$name,$login,$email,$student['id_usuario']]);
                query('UPDATE alunos SET id_turma=?,idade_informada=? WHERE id_aluno=?',[$classId,$age,$studentId]);
                query('DELETE FROM alunos_alergias WHERE id_aluno=?',[$studentId]);
                foreach($ids as $id) query('INSERT INTO alunos_alergias (id_aluno,id_alergia) VALUES (?,?)',[$studentId,$id]);
            });
            reply(['mensagem'=>'Perfil do aluno atualizado.']);

        case 'recarga':
            $user=requireUser('responsavel');
            if (!config()['demo_recharge']) throw new ApiError('Recarga de demonstração desativada.',403);
            $amount=cents($data['valor'] ?? '');
            if ($amount<1 || $amount>100000) throw new ApiError('Recarga de demonstração: de R$ 0,01 até R$ 1.000,00.');
            reply(operation($user,$action,$data,function () use ($user,$amount) {
                $wallet=query('SELECT * FROM carteiras WHERE id_usuario=? FOR UPDATE',[$user['id_usuario']])->fetch();
                $balance=cents($wallet['saldo'])+$amount;
                if ($balance>9999999999) throw new ApiError('Saldo máximo excedido.');
                query('UPDATE carteiras SET saldo=? WHERE id_carteira=?',[decimal($balance),$wallet['id_carteira']]);
                query("INSERT INTO movimentacoes (id_carteira_destino,tipo,valor,descricao,criado_em) VALUES (?,'recarga_demo',?,'Crédito fictício para demonstração',?)",[$wallet['id_carteira'],decimal($amount),date('Y-m-d H:i:s')]);
                return ['mensagem'=>'Crédito de demonstração adicionado. Nenhum pagamento foi cobrado.'];
            }));

        case 'transferir':
            $user=requireUser('responsavel');
            $student=linkedStudent(positiveId($data['id_aluno'] ?? null),guardianId($user));
            $amount=cents($data['valor'] ?? '');
            if ($amount<1) throw new ApiError('Informe um valor maior que zero.');
            reply(operation($user,$action,$data,function () use ($user,$student,$amount) {
                // Mesma ordem de bloqueio em todas as transferências.
                $wallets=query('SELECT * FROM carteiras WHERE id_usuario IN (?,?) ORDER BY id_carteira FOR UPDATE',[$user['id_usuario'],$student['id_usuario']])->fetchAll();
                $byUser=[];
                foreach ($wallets as $wallet) $byUser[$wallet['id_usuario']]=$wallet;
                $from=$byUser[$user['id_usuario']]; $to=$byUser[$student['id_usuario']];
                if (cents($from['saldo'])<$amount) throw new ApiError('Saldo do responsável insuficiente.');
                if (cents($to['saldo'])+$amount>9999999999) throw new ApiError('Saldo máximo excedido.');
                query('UPDATE carteiras SET saldo=? WHERE id_carteira=?',[decimal(cents($from['saldo'])-$amount),$from['id_carteira']]);
                query('UPDATE carteiras SET saldo=? WHERE id_carteira=?',[decimal(cents($to['saldo'])+$amount),$to['id_carteira']]);
                query("INSERT INTO movimentacoes (id_carteira_origem,id_carteira_destino,tipo,valor,descricao,criado_em) VALUES (?,?,'transferencia',?,?,?)",[$from['id_carteira'],$to['id_carteira'],decimal($amount),'Saldo enviado para '.$student['nome'],date('Y-m-d H:i:s')]);
                return ['mensagem'=>'Saldo transferido para '.$student['nome'].'.'];
            }));

        case 'limite':
            $user=requireUser('responsavel');
            $gid=guardianId($user);
            $student=linkedStudent(positiveId($data['id_aluno'] ?? null),$gid);
            $amount=($data['valor'] ?? '')==='' ? null : cents($data['valor']);
            reply(operation($user,$action,$data,function () use ($student,$gid,$amount) {
                $old=query('SELECT limite_gasto FROM alunos WHERE id_aluno=? FOR UPDATE',[$student['id_aluno']])->fetchColumn();
                $new=$amount===null ? null : decimal($amount);
                query('UPDATE alunos SET limite_gasto=? WHERE id_aluno=?',[$new,$student['id_aluno']]);
                query('INSERT INTO historico_limites (id_aluno,id_responsavel,valor_anterior,valor_novo,alterado_em) VALUES (?,?,?,?,?)',[$student['id_aluno'],$gid,$old,$new,date('Y-m-d H:i:s')]);
                return ['mensagem'=>'Limite diário atualizado.'];
            }));

        case 'comprar':
            $user=requireUser('aluno');
            $day=textField($data,'data_retirada',10,10);
            $hour=textField($data,'hora_retirada',5,5);
            $cutoffs=['09:00'=>'08:45','15:30'=>'15:15'];
            if ($day!==date('Y-m-d')||!isset($cutoffs[$hour])) throw new ApiError('Escolha um dos intervalos de hoje: 09:00 ou 15:30.');
            $cutoff=new DateTimeImmutable($day.' '.$cutoffs[$hour].':00');
            if (new DateTimeImmutable()>$cutoff) throw new ApiError('O prazo para encomendar esse intervalo terminou 15 minutos antes do horário.');
            $items=$data['itens'] ?? null;
            if (!is_array($items) || count($items)<1 || count($items)>100) throw new ApiError('Pedido vazio ou com itens demais.');
            $quantities=[];
            foreach ($items as $item) {
                if (!is_array($item)) throw new ApiError('Item inválido.');
                $id=positiveId($item['id_produto'] ?? null);
                $qty=positiveId($item['quantidade'] ?? null);
                if ($qty>99 || isset($quantities[$id])) throw new ApiError('Quantidade inválida ou produto repetido.');
                $quantities[$id]=$qty;
            }
            reply(operation($user,$action,$data,function () use ($user,$quantities,$day,$hour) {
                // O bloqueio do aluno serializa compras e alterações de limite.
                $student=query('SELECT * FROM alunos WHERE id_usuario=? FOR UPDATE',[$user['id_usuario']])->fetch();
                $wallet=query('SELECT * FROM carteiras WHERE id_usuario=? FOR UPDATE',[$user['id_usuario']])->fetch();
                $marks=implode(',',array_fill(0,count($quantities),'?'));
                $products=query("SELECT p.*,e.quantidade_total,e.quantidade_vendida FROM produtos p JOIN estoque_diario e ON e.id_produto=p.id_produto AND e.data_estoque=? WHERE p.ativo=1 AND p.id_produto IN ($marks) FOR UPDATE",[$day,...array_keys($quantities)])->fetchAll();
                if (count($products)!==count($quantities)) throw new ApiError('Um produto está indisponível. Atualize o cardápio.');
                $allergies=query('SELECT al.nome FROM alunos a JOIN alunos_alergias aa ON aa.id_aluno=a.id_aluno JOIN alergias al ON al.id_alergia=aa.id_alergia WHERE a.id_aluno=?',[$student['id_aluno']])->fetchAll(PDO::FETCH_COLUMN);
                $total=0;
                foreach ($products as $product) {
                    $id=(int)$product['id_produto'];
                    if (hasStudentAllergen((string)$product['ingredientes'],$allergies)) throw new ApiError('O cardápio mudou e contém ingrediente relacionado a uma alergia do aluno. Remova esse item.');
                    if ((int)$product['quantidade_total']-(int)$product['quantidade_vendida']<$quantities[$id]) throw new ApiError('Estoque insuficiente para '.$product['nome'].'.');
                    $total+=cents($product['preco'])*$quantities[$id];
                }
                if ($total<1 || $total>9999999999) throw new ApiError('Total inválido.');
                if ($total>cents($wallet['saldo'])) throw new ApiError('Saldo insuficiente.');
                if ($student['limite_gasto']!==null) {
                    $spent=query("SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE id_aluno=? AND criado_em>=? AND criado_em<? AND status<>'cancelado'",[$student['id_aluno'],date('Y-m-d').' 00:00:00',date('Y-m-d',strtotime('+1 day')).' 00:00:00'])->fetchColumn();
                    if (cents($spent)+$total>cents($student['limite_gasto'])) throw new ApiError('A compra ultrapassa o limite diário definido pelo responsável.');
                }
                query('INSERT INTO pedidos (id_aluno,criado_em,data_retirada,hora_retirada,valor_total) VALUES (?,?,?,?,?)',[$student['id_aluno'],date('Y-m-d H:i:s'),$day,$hour,decimal($total)]);
                $order=(int)db()->lastInsertId();
                foreach ($products as $product) {
                    $id=(int)$product['id_produto'];$qty=$quantities[$id];
                    query('INSERT INTO itens_pedido (id_pedido,id_produto,nome_produto,quantidade,preco_unitario) VALUES (?,?,?,?,?)',[$order,$id,$product['nome'],$qty,$product['preco']]);
                    query('UPDATE estoque_diario SET quantidade_vendida=quantidade_vendida+? WHERE id_produto=? AND data_estoque=? AND quantidade_total-quantidade_vendida>=?',[$qty,$id,$day,$qty]);
                }
                query('UPDATE carteiras SET saldo=? WHERE id_carteira=?',[decimal(cents($wallet['saldo'])-$total),$wallet['id_carteira']]);
                query("INSERT INTO movimentacoes (id_carteira_origem,id_pedido,tipo,valor,descricao,criado_em) VALUES (?,?,'compra',?,?,?)",[$wallet['id_carteira'],$order,decimal($total),'Pedido #'.$order,date('Y-m-d H:i:s')]);
                return ['mensagem'=>'Pedido #'.$order.' confirmado!','id_pedido'=>$order];
            }));

        case 'pedidos':
            $user=requireUser();
            if ($user['tipo_usuario']==='aluno') {
                $orders=query('SELECT p.*,u.nome AS aluno FROM pedidos p JOIN alunos a ON a.id_aluno=p.id_aluno JOIN usuarios u ON u.id_usuario=a.id_usuario WHERE a.id_usuario=? ORDER BY p.id_pedido DESC LIMIT 50',[$user['id_usuario']])->fetchAll();
            } else {
                $orders=query('SELECT p.*,u.nome AS aluno FROM pedidos p JOIN alunos a ON a.id_aluno=p.id_aluno JOIN usuarios u ON u.id_usuario=a.id_usuario JOIN alunos_responsaveis ar ON ar.id_aluno=a.id_aluno WHERE ar.id_responsavel=? ORDER BY p.id_pedido DESC LIMIT 50',[guardianId($user)])->fetchAll();
            }
            foreach ($orders as &$order) $order['itens']=query('SELECT nome_produto,quantidade,preco_unitario FROM itens_pedido WHERE id_pedido=?',[$order['id_pedido']])->fetchAll();
            unset($order);
            reply(['pedidos'=>$orders]);

        case 'extrato':
            $user=requireUser();
            $uid=(int)$user['id_usuario'];
            if ($user['tipo_usuario']==='responsavel' && !empty($_GET['id_aluno'])) {
                $student=linkedStudent(positiveId($_GET['id_aluno']),guardianId($user));
                $uid=(int)$student['id_usuario'];
            }
            $wallet=(int)query('SELECT id_carteira FROM carteiras WHERE id_usuario=?',[$uid])->fetchColumn();
            $entries=query('SELECT m.*,CASE WHEN id_carteira_destino=? THEN 1 ELSE -1 END AS sentido FROM movimentacoes m WHERE id_carteira_origem=? OR id_carteira_destino=? ORDER BY id_movimentacao DESC LIMIT 100',[$wallet,$wallet,$wallet])->fetchAll();
            $history=query('SELECT h.*,u.nome AS responsavel FROM historico_limites h JOIN alunos a ON a.id_aluno=h.id_aluno JOIN responsaveis r ON r.id_responsavel=h.id_responsavel JOIN usuarios u ON u.id_usuario=r.id_usuario WHERE a.id_usuario=? ORDER BY id_historico DESC LIMIT 50',[$uid])->fetchAll();
            reply(['movimentacoes'=>$entries,'historico_limites'=>$history]);
    }
} catch (ApiError $error) {
    reply(['erro'=>$error->getMessage()],$error->status);
} catch (JsonException $error) {
    reply(['erro'=>'JSON inválido.'],400);
} catch (PDOException $error) {
    error_log((string)$error);
    if (($error->errorInfo[1] ?? 0)===1062) reply(['erro'=>'Este login já está em uso. Escolha outro.'],409);
    reply(['erro'=>'Não foi possível acessar o banco. Confira a configuração e a importação do SQL.'],503);
} catch (Throwable $error) {
    error_log((string)$error);
    reply(['erro'=>'Não foi possível concluir a operação. Consulte o terminal do servidor.'],500);
}
