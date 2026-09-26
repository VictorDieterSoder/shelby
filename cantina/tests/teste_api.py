"""Teste funcional opcional. Cria dados fictícios: usar somente em banco de teste."""
import datetime
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000').rstrip('/')

class Client:
    def __init__(self):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = self.call('sessao')['csrf']

    def call(self, action, data=None, expected=200, token=True):
        headers = {}
        body = None
        if data is not None:
            body = json.dumps(data).encode()
            headers['Content-Type'] = 'application/json'
            if token:
                headers['X-CSRF-Token'] = self.csrf
        request = urllib.request.Request(BASE+'/api.php?acao='+action, data=body, headers=headers)
        try:
            response = self.http.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            result = json.load(response)
            assert response.status == expected, (action, response.status, expected, result)
            return result

def identity(login):
    return dict(nome='Teste '+login, login=login, email=login+'@example.test', senha='Teste-Cantina-938!', confirmar_senha='Teste-Cantina-938!')

def op(**values):
    return dict(chave=str(uuid.uuid4()), **values)

def main():
    suffix = uuid.uuid4().hex[:12]
    guardian = Client()
    guardian.call('painel', expected=401)
    guardian.call('cadastrar_responsavel', dict(identity('resp_'+suffix), telefone='51999999999'), expected=403, token=False)
    guardian.call('cadastrar_responsavel', dict(identity('resp_'+suffix), telefone='51999999999'))
    guardian.call('cadastrar_aluno', dict(identity('aluno_'+suffix), data_nascimento='2012-01-15', turma='Teste', parentesco='Tutor', alergias=[1, 2]))
    state = guardian.call('painel')
    student_id = state['alunos'][0]['id_aluno']
    recharge = op(valor='50.00')
    guardian.call('recarga', recharge)
    guardian.call('recarga', recharge)  # repetir não pode duplicar
    assert guardian.call('painel')['carteira']['saldo'] == '50.00'
    transfer = op(id_aluno=student_id, valor='30.00')
    guardian.call('transferir', transfer)
    guardian.call('transferir', transfer)
    state = guardian.call('painel')
    assert state['carteira']['saldo'] == '20.00'
    assert state['alunos'][0]['saldo'] == '30.00'
    guardian.call('transferir', op(id_aluno=student_id, valor='21.00'), expected=422)
    guardian.call('limite', op(id_aluno=student_id, valor='10.00'))

    other = Client()
    other.call('cadastrar_responsavel', dict(identity('outro_'+suffix), telefone='51999999999'))
    other.call('transferir', op(id_aluno=student_id, valor='1.00'), expected=403)
    other.call('extrato&id_aluno='+str(student_id), expected=403)

    student = Client()
    student.call('entrar', {'login':'aluno_'+suffix, 'senha':'senha-errada'}, expected=401)
    student.call('entrar', {'login':'aluno_'+suffix, 'senha':'Teste-Cantina-938!'})
    student.call('recarga', op(valor='10.00'), expected=403)
    products = student.call('catalogo')['produtos']
    product = next(p for p in products if p['nome']=='Coxinha')
    assert product['preco']=='7.00', 'Teste espera cardápio original (Coxinha = 7).'
    tomorrow = (datetime.date.today()+datetime.timedelta(days=1)).isoformat()
    order = op(data_retirada=tomorrow, hora_retirada='12:00', itens=[dict(id_produto=product['id_produto'], quantidade=1, preco='0.01')], valor_total='0.01')
    result = student.call('comprar', order)
    assert student.call('comprar', order)['id_pedido'] == result['id_pedido']
    assert student.call('painel')['carteira']['saldo']=='23.00', 'O servidor deve usar o preço real.'
    blocked = dict(order, chave=str(uuid.uuid4()))
    student.call('comprar', blocked, expected=422)
    assert student.call('painel')['carteira']['saldo']=='23.00'
    guardian.call('limite', op(id_aluno=student_id, valor='0'))
    student.call('comprar', dict(order, chave=str(uuid.uuid4())), expected=422)
    guardian.call('limite', op(id_aluno=student_id, valor=''))
    student.call('comprar', dict(order, chave=str(uuid.uuid4()), data_retirada='2020-01-01'), expected=422)
    student.call('comprar', dict(order, chave=str(uuid.uuid4()), itens=[]), expected=422)
    assert len(student.call('pedidos')['pedidos'])==1
    assert len(guardian.call('pedidos')['pedidos'])==1
    assert len(other.call('pedidos')['pedidos'])==0
    assert len(student.call('extrato')['movimentacoes'])==2
    assert len(guardian.call('extrato')['movimentacoes'])==2
    assert len(guardian.call('extrato&id_aluno='+str(student_id))['historico_limites'])==3
    student.call('sair', {})
    student.call('painel', expected=401)
    print('OK: cadastro, login, CSRF, isolamento de contas, recarga, transferência, limite, compra, preço do servidor, repetição e histórico.')
    print('Dados de teste mantidos no banco. Sufixo das contas:', suffix)

if __name__ == '__main__':
    main()
