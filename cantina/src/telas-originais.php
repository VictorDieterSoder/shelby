<?php
declare(strict_types=1);
function cadastrarTelaOriginal(array $data): array {
    if (!empty($_SESSION['uid'])) throw new ApiError('Saia da conta antes de cadastrar outro aluno.');
    return transaction(function() use($data) {
        $age=positiveId($data['idade']??null);
        if ($age<11||$age>18) throw new ApiError('Idade invalida.');
        $guardianName=textField($data,'responsavel',120,2);
        $phone=textField($data,'telefone',25,8);
        if (!preg_match('/^[+()\d\s-]+$/D',$phone)) throw new ApiError('Telefone invalido.');
        $class=textField($data,'turma',40);
        $allergies=$data['alergias']??[];
        if (!is_array($allergies)||count($allergies)>10) throw new ApiError('Alergias invalidas.');
        $names=['gluten'=>'Glúten','lactose'=>'Lactose','leite'=>'Proteína do leite','ovo'=>'Ovo','soja'=>'Soja','amendoim'=>'Amendoim','castanhas'=>'Castanhas','peixe'=>'Peixes','frutosDoMar'=>'Frutos do mar','corantes'=>'Corantes'];
        $ids=[];
        foreach(array_unique($allergies) as $allergy) {
            if (!is_string($allergy)||!isset($names[$allergy])) throw new ApiError('Alergia invalida.');
            $id=query('SELECT id_alergia FROM alergias WHERE nome=?',[$names[$allergy]])->fetchColumn();
            if (!$id) throw new ApiError('Alergia nao cadastrada no banco.');
            $ids[]=$id;
        }
        $login=textField($data,'login',60,3);
        $data['nome']=$login;
        $uid=createUser($data,'aluno');
        query('INSERT INTO turmas (nome,ano_letivo) VALUES (?,?) ON DUPLICATE KEY UPDATE id_turma=LAST_INSERT_ID(id_turma)',[$class,(int)date('Y')]);
        $classId=(int)db()->lastInsertId();
        query('INSERT INTO alunos (id_usuario,id_turma,data_nascimento,idade_informada) VALUES (?,?,NULL,?)',[$uid,$classId,$age]);
        $studentId=(int)db()->lastInsertId();
        foreach($ids as $id) query('INSERT INTO alunos_alergias (id_aluno,id_alergia) VALUES (?,?)',[$studentId,$id]);
        // Name/phone alone must never attach a child to an existing account.
        $secret=bin2hex(random_bytes(8));
        $guardianLogin='resp.'.bin2hex(random_bytes(8));
        $gid=createUser(['nome'=>$guardianName,'login'=>$guardianLogin,'email'=>$data['email'],'senha'=>$secret,'confirmar_senha'=>$secret],'responsavel');
        query('INSERT INTO responsaveis (id_usuario,telefone) VALUES (?,?)',[$gid,$phone]);
        $guardianId=(int)db()->lastInsertId();
        query('INSERT INTO alunos_responsaveis (id_aluno,id_responsavel,parentesco) VALUES (?,?,?)',[$studentId,$guardianId,'Responsavel informado']);
        return ['mensagem'=>'Aluno cadastrado.','senha_responsavel'=>$secret,'responsavel'=>$guardianName,'aluno'=>$login];
    });
}
function entrarResponsavelOriginal(array $data): void {
    $name=textField($data,'responsavel',120,2);
    $student=textField($data,'aluno',120,2);
    $password=$data['senha']??'';
    if (!is_string($password)||strlen($password)>72) throw new ApiError('Dados de acesso incorretos.',401);
    if (($_SESSION['tentativas']['ate']??0)>time()) throw new ApiError('Aguarde um minuto antes de tentar novamente.',429);
    $users=query("SELECT DISTINCT u.id_usuario,u.senha_hash FROM usuarios u JOIN responsaveis r ON r.id_usuario=u.id_usuario JOIN alunos_responsaveis ar ON ar.id_responsavel=r.id_responsavel JOIN alunos a ON a.id_aluno=ar.id_aluno JOIN usuarios ua ON ua.id_usuario=a.id_usuario WHERE u.tipo_usuario='responsavel' AND (u.nome=? OR u.login=?) AND (ua.nome=? OR ua.login=?)",[$name,$name,$student,$student])->fetchAll();
    foreach($users as $user) if(password_verify($password,$user['senha_hash'])) {
        unset($_SESSION['tentativas']); session_regenerate_id(true); $_SESSION['uid']=(int)$user['id_usuario']; return;
    }
    $attempts=($_SESSION['tentativas']['quantidade']??0)+1;
    $_SESSION['tentativas']=['quantidade'=>$attempts,'ate'=>$attempts>=5?time()+60:0];
    throw new ApiError('Dados de acesso incorretos.',401);
}
