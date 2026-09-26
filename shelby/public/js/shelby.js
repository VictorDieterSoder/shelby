'use strict';
const apiUrl = location.pathname.includes('/telas/') ? '../api.php' : 'api.php';
let csrf = '';
let state = null;
let cart = {};
const money = value => Number(value || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(action, data) {
  const options = {credentials:'same-origin',headers:{}};
  if (data !== undefined) {
    options.method='POST';
    options.headers={'Content-Type':'application/json','X-CSRF-Token':csrf};
    options.body=JSON.stringify(data);
  }
  const response=await fetch(`${apiUrl}?acao=${encodeURIComponent(action)}`,options);
  const result=await response.json();
  if (!response.ok) throw new Error(result.erro || 'Não foi possível concluir a operação.');
  return result;
}
function notice(message, error=false) {
  let node=document.querySelector('#shelby-notice');
  if (!node) { node=document.createElement('div'); node.id='shelby-notice'; document.body.prepend(node); }
  node.textContent=message; node.dataset.error=String(error); node.hidden=false;
}
function table(headers, rows) {
  return `<div class="shelby-table-wrap"><table class="shelby-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody></table></div>`;
}
function productRows(editable=false) {
  return state.produtos.map(p=>`<tr><td>${esc(p.nome)}</td><td>${esc(p.categoria)}</td><td>${money(p.preco)}</td><td>${p.ativo?'Disponível':'Indisponível'}</td><td>${editable?`<button type="button" data-edit-product="${p.id_produto}">Editar</button> <button type="button" data-toggle-product="${p.id_produto}">${p.ativo?'Pausar':'Ativar'}</button>`:''}</td></tr>`).join('');
}
function orderRows() {
  return state.pedidos.map(o=>`<tr><td>#${o.id_pedido}</td><td>${esc(o.aluno)}</td><td>${esc(o.data_retirada)} ${esc(String(o.hora_retirada).slice(0,5))}</td><td>${o.itens.map(i=>`${i.quantidade}x ${esc(i.nome_produto)}`).join(', ')}</td><td>${money(o.valor_total)}</td><td>${o.status==='cancelado'?esc(o.status):`<select data-order-status="${o.id_pedido}">${['confirmado','pago','preparando','pronto','entregue','retirado'].map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select>`}</td></tr>`).join('');
}
function salesRows(receivedOnly=false) {
  const sales=state.vendas_balcao.filter(s=>!receivedOnly||s.pagamento!=='pendente');
  return sales.map(s=>`<tr><td>#${s.id_venda}</td><td>${esc(s.cliente)}</td><td>${s.itens.map(i=>`${i.quantidade}x ${esc(i.nome_produto)}`).join(', ')}</td><td>${s.pagamento==='pendente'?`<select data-sale-payment="${s.id_venda}"><option value="">Pendente</option><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="cartao">Cartão</option></select>`:esc(s.pagamento)}</td><td>${money(s.valor_total)}</td><td>${esc(s.criado_em)}</td></tr>`).join('');
}
function frame(content) {
  const main=document.querySelector('.conteudo');
  if (main) main.innerHTML=`<header class="shelby-heading"><div><p>Gestão da cantina</p><h1>${esc(document.querySelector('main h1')?.textContent||'SHELBY')}</h1></div><button type="button" data-logout aria-label="Sair">Sair</button></header>${content}`;
}
function render() {
  const page=location.pathname.split('/').pop();
  const summary=state.resumo;
  if (page==='painel.html') {
    frame(`<section class="shelby-kpis"><article><span>Faturamento hoje</span><strong>${money(summary.total)}</strong></article><article><span>Pedidos de alunos</span><strong>${summary.pedidos}</strong></article><article><span>Vendas no balcão</span><strong>${summary.vendas}</strong></article><article><span>Produtos ativos</span><strong>${state.produtos.filter(p=>p.ativo).length}</strong></article></section><section class="shelby-section"><h2>Mais vendidos no mês</h2>${table(['Produto','Unidades'],state.mais_vendidos.map(p=>`<tr><td>${esc(p.nome_produto)}</td><td>${p.quantidade}</td></tr>`).join(''))}</section><section class="shelby-section"><h2>Pedidos recentes</h2>${table(['Pedido','Aluno','Retirada','Total','Status'],state.pedidos.slice(0,8).map(o=>`<tr><td>#${o.id_pedido}</td><td>${esc(o.aluno)}</td><td>${esc(o.data_retirada)} ${esc(String(o.hora_retirada).slice(0,5))}</td><td>${money(o.valor_total)}</td><td>${esc(o.status)}</td></tr>`).join(''))}</section>`);
  } else if (page==='cadastro-itens.html') {
    frame(`<section class="shelby-section"><h2>Novo produto</h2><form id="product-form" class="shelby-form"><input type="hidden" name="id_produto"><label>Nome<input name="nome" required maxlength="100"></label><label>Categoria<select name="categoria"><option value="salgados">Salgados</option><option value="doces">Doces</option><option value="bebidas">Bebidas</option></select></label><label>Preço (R$)<input name="preco" type="number" required min="0.01" step="0.01"></label><label>Descrição<input name="descricao" maxlength="255"></label><button>Salvar produto</button></form></section><section class="shelby-section"><h2>Produtos cadastrados</h2>${table(['Produto','Categoria','Preço','Estado',''],productRows(true))}</section>`);
  } else if (page==='itens-dia.html') {
    frame(`<section class="shelby-section"><h2>Disponibilidade do cardápio</h2><p>Deixe os produtos disponíveis para compra ou pause a venda.</p>${table(['Produto','Categoria','Preço','Estado',''],productRows(true))}</section>`);
  } else if (page==='pedidos-intervalo.html') {
    frame(`<section class="shelby-section"><h2>Pedidos de retirada</h2>${table(['Pedido','Aluno','Retirada','Itens','Total','Situação'],orderRows())}</section>`);
  } else if (page==='pedidos-balcao.html') {
    const options=state.produtos.filter(p=>p.ativo).map(p=>`<label class="shelby-sale-item"><span>${esc(p.nome)} · ${money(p.preco)}</span><input type="number" min="0" max="99" value="${cart[p.id_produto]||0}" data-cart-product="${p.id_produto}" aria-label="Quantidade de ${esc(p.nome)}"></label>`).join('');
    frame(`<section class="shelby-section"><h2>Registrar venda</h2><form id="sale-form" class="shelby-form"><label>Cliente<input name="cliente" required maxlength="120" placeholder="Nome do cliente"></label><label>Pagamento<select name="pagamento"><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="pendente">Pendente</option></select></label><fieldset><legend>Produtos</legend>${options||'<p>Nenhum produto disponível.</p>'}</fieldset><p>Total: <strong id="sale-total">${money(state.produtos.reduce((sum,p)=>sum+p.preco*(cart[p.id_produto]||0),0))}</strong></p><button>Registrar venda</button></form></section><section class="shelby-section"><h2>Vendas recentes</h2>${table(['Venda','Cliente','Itens','Pagamento','Total','Data'],salesRows())}</section>`);
  } else if (page==='financeiro.html'||page==='extrato-geral.html'||page==='extrato-recebidos.html') {
    const received=page==='extrato-recebidos.html';
    const sales=state.vendas_balcao.filter(s=>!received||s.pagamento!=='pendente');
    const movements=state.movimentacoes.filter(m=>!received||m.tipo==='compra');
    const total=sales.reduce((sum,s)=>sum+Number(s.valor_total),0)+state.movimentacoes.filter(m=>m.tipo==='compra').reduce((sum,m)=>sum+Number(m.valor),0);
    const ledgerRows=movements.map(m=>`<tr><td>${esc(m.descricao)}</td><td>${esc(m.tipo)}</td><td>${esc(m.origem||m.destino||'')}</td><td>${money(m.valor)}</td><td>${esc(m.criado_em)}</td></tr>`).join('');
    frame(`<section class="shelby-kpis"><article><span>${received?'Total de entradas confirmadas':'Total de vendas e compras'}</span><strong>${money(total)}</strong></article><article><span>Vendas no balcão</span><strong>${sales.length}</strong></article><article><span>Recebimentos pendentes</span><strong>${state.vendas_balcao.filter(s=>s.pagamento==='pendente').length}</strong></article></section><section class="shelby-section"><h2>${received?'Movimentações recebidas':'Movimentações de carteiras'}</h2>${table(['Descrição','Tipo','Conta','Valor','Data'],ledgerRows)}</section><section class="shelby-section"><h2>${received?'Vendas recebidas':'Vendas no balcão'}</h2>${table(['Venda','Cliente','Itens','Pagamento','Total','Data'],salesRows(received))}</section>`);
  } else if (page==='financeiro-aluno.html') {
    frame(`<section class="shelby-section"><h2>Carteiras e gastos de hoje</h2>${table(['Aluno','Turma','Saldo','Gasto hoje'],state.alunos.map(a=>`<tr><td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td>${money(a.saldo)}</td><td>${money(a.gasto_hoje)}</td></tr>`).join(''))}</section>`);
  }
}
async function refresh() { state=await api('gestao'); render(); }
async function start() {
  const session=await api('sessao'); csrf=session.csrf;
  if (location.pathname.endsWith('/')||location.pathname.endsWith('/index.html')) {
    if (session.usuario?.tipo_usuario==='cantineiro') { location.href='telas/painel.html'; return; }
    const card=document.querySelector('.login-card');
    if (card) card.innerHTML=`<div class="logo"><div class="logo-icon"></div><h1>SHELBY</h1><p>Gestão da cantina</p></div><form id="manager-login"><div class="campo"><label for="login">Login</label><input id="login" name="login" required autocomplete="username"></div><div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" required autocomplete="current-password"></div><p id="login-error" role="status"></p><button class="botao-login">Entrar</button></form>`;
    return;
  }
  if (session.usuario?.tipo_usuario!=='cantineiro') { location.href='../index.html'; return; }
  if (location.pathname.endsWith('/cadastro.html')) { location.href='painel.html'; return; }
  await refresh();
}
document.addEventListener('submit',async event=>{
  if (!(event.target instanceof HTMLFormElement)) return;
  event.preventDefault();
  try {
    const form=event.target;
    if (form.id==='manager-login') {
      await api('entrar',Object.fromEntries(new FormData(form)));
      const current=await api('sessao');
      if (current.usuario?.tipo_usuario!=='cantineiro') { await api('sair',{}); throw new Error('Esta conta não tem acesso à gestão.'); }
      location.href='telas/painel.html'; return;
    }
    if (form.id==='product-form') { await api('produto_salvar',Object.fromEntries(new FormData(form))); notice('Produto salvo.'); await refresh(); }
    if (form.id==='sale-form') {
      const submit=form.querySelector('button[type="submit"],button:not([type])');
      if (submit) submit.disabled=true;
      form.dataset.operationKey ||= crypto.randomUUID();
      const items=Object.entries(cart).filter(([,qty])=>qty>0).map(([id_produto,quantidade])=>({id_produto:Number(id_produto),quantidade}));
      try { await api('venda_balcao',{...Object.fromEntries(new FormData(form)),itens:items,chave:form.dataset.operationKey}); delete form.dataset.operationKey; cart={}; notice('Venda registrada.'); await refresh(); }
      finally { if (submit) submit.disabled=false; }
    }
  } catch(error) { notice(error.message,true); }
});
document.addEventListener('click',async event=>{
  const edit=event.target.closest('[data-edit-product]');
  if (edit) { const product=state.produtos.find(p=>String(p.id_produto)===edit.dataset.editProduct); const form=document.querySelector('#product-form'); if(product&&form){ for(const [key,value] of Object.entries({id_produto:product.id_produto,nome:product.nome,categoria:product.categoria,preco:product.preco,descricao:product.descricao})){ const field=form.elements.namedItem(key); if(field) field.value=value; } form.scrollIntoView({behavior:'smooth',block:'center'}); form.elements.namedItem('nome').focus(); } }
  const toggle=event.target.closest('[data-toggle-product]');
  if (toggle) { try { await api('produto_status',{id_produto:Number(toggle.dataset.toggleProduct)}); await refresh(); } catch(error) { notice(error.message,true); } }
  if (event.target.closest('[data-logout]')) { try { await api('sair',{}); location.href='../index.html'; } catch(error) { notice(error.message,true); } }
  if (event.target.closest('a.sair')) { event.preventDefault(); try { await api('sair',{}); location.href='../index.html'; } catch(error) { notice(error.message,true); } }
});
document.addEventListener('change',async event=>{
  const payment=event.target.closest('[data-sale-payment]');
  if (payment&&payment.value) { try { await api('venda_pagamento',{id_venda:Number(payment.dataset.salePayment),pagamento:payment.value}); notice('Recebimento atualizado.'); await refresh(); } catch(error) { notice(error.message,true); } }
  const status=event.target.closest('[data-order-status]');
  if (status) { try { await api('pedido_status',{id_pedido:Number(status.dataset.orderStatus),status:status.value}); notice('Situação do pedido atualizada.'); } catch(error) { notice(error.message,true); } }
  const quantity=event.target.closest('[data-cart-product]');
  if (quantity) { cart[quantity.dataset.cartProduct]=Math.max(0,Math.min(99,Number(quantity.value)||0)); const total=state.produtos.reduce((sum,p)=>sum+Number(p.preco)*(cart[p.id_produto]||0),0); const target=document.querySelector('#sale-total'); if(target) target.textContent=money(total); }
});
start().catch(error=>{
  const card=document.querySelector('.login-card');
  if (card) card.innerHTML=`<div class="logo"><div class="logo-icon"></div><h1>SHELBY</h1><p>Gestão da cantina</p></div><p id="login-error" role="status">${esc(error.message)}</p><form id="manager-login"><div class="campo"><label for="login">Login</label><input id="login" name="login" required autocomplete="username"></div><div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" required autocomplete="current-password"></div><button class="botao-login">Entrar</button></form>`;
  else notice(error.message,true);
  document.querySelector('.conteudo')?.replaceChildren();
});
