'use strict';
const app = document.querySelector('#app');
const account = document.querySelector('#account');
const notice = document.querySelector('#notice');
let csrf = '', current = null, catalog = [], allergies = [], panel = null;
let selectedStudent = '', activeTab = 'principal', cart = {}, checkout = false;
const pending = new Map();
const money = value => Number(value).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleString('pt-BR'); };
const dateOnly = value => String(value).split('-').reverse().join('/');
const limitLabel = value => value === null ? 'Sem limite' : money(value);
const uuid = () => crypto.randomUUID();

function flash(message, error = false) {
  notice.textContent = message; notice.className = error ? 'error' : ''; notice.hidden = false;
}
async function api(action, data, extra = '') {
  const opts = {credentials:'same-origin',headers:{}};
  if (data !== undefined) {
    opts.method = 'POST'; opts.headers = {'Content-Type':'application/json','X-CSRF-Token':csrf};
    opts.body = JSON.stringify(data);
  }
  let response;
  try { response = await fetch(`api.php?acao=${action}${extra}`, opts); }
  catch { throw new Error('Não foi possível conectar. Verifique o servidor e tente novamente.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Resposta inválida. Abra o projeto pelo servidor PHP e consulte o terminal.'); }
  if (!response.ok) { const e = new Error(result.erro || 'A operação falhou.'); e.definitive = true; throw e; }
  return result;
}
async function mutate(action, data) {
  const fingerprint = action + JSON.stringify(data);
  if (!pending.has(fingerprint)) pending.set(fingerprint, uuid());
  try {
    const result = await api(action, {...data,chave:pending.get(fingerprint)});
    pending.delete(fingerprint); return result;
  } catch (e) { if (e.definitive) pending.delete(fingerprint); throw e; }
}
function input(label, name, type = 'text', extra = '') {
  return `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;
}
function identityFields() {
  return `${input('Nome completo','nome','text','required minlength="2" maxlength="120" autocomplete="name"')}
  ${input('Login','login','text','required minlength="3" maxlength="60" pattern="[a-zA-Z0-9._-]+" autocomplete="username"')}
  ${input('E-mail','email','email','required maxlength="254" autocomplete="email"')}
  ${input('Senha (mínimo 8 caracteres)','senha','password','required minlength="8" maxlength="72" autocomplete="new-password"')}
  ${input('Confirme a senha','confirmar_senha','password','required minlength="8" maxlength="72" autocomplete="new-password"')}`;
}
function renderAuth() {
  account.innerHTML = '<span class="badge">Área de alunos e responsáveis</span>';
  app.innerHTML = `<section class="hero"><p class="eyebrow">Bem-vindo à cantina</p><h1>Seu lanche, com tudo organizado.</h1><p>Alunos fazem seus pedidos. Responsáveis acompanham o saldo, os gastos e as próximas retiradas.</p></section>
  <div class="auth"><section class="card"><h2>Entrar na minha conta</h2><p class="muted">Use seu login de aluno ou responsável.</p><form id="login" class="form">
  ${input('Login','login','text','required maxlength="60" autocomplete="username"')}${input('Senha','senha','password','required maxlength="72" autocomplete="current-password"')}
  <button>Entrar</button></form><div class="separator"></div><p class="hint">Primeiro acesso do aluno? O responsável deve criar a própria conta e cadastrar o aluno pelo painel.</p></section>
  <section class="card"><h2>Sou responsável</h2><p class="muted">Crie sua conta para cadastrar seus alunos.</p><form id="register" class="form">${identityFields()}${input('Telefone','telefone','tel','required minlength="8" maxlength="25" autocomplete="tel"')}<button>Criar conta de responsável</button></form></section></div>`;
}
function nav() {
  return `<div class="tabs" aria-label="Seções"><button data-tab="principal" class="${activeTab==='principal'?'active':''}">${current.tipo_usuario==='aluno'?'Cardápio':'Meus alunos'}</button><button data-tab="pedidos" class="${activeTab==='pedidos'?'active':''}">Pedidos</button><button data-tab="extrato" class="${activeTab==='extrato'?'active':''}">Extrato</button></div><div id="content"></div>`;
}
async function refresh() {
  panel = await api('painel'); current = panel.usuario;
  account.innerHTML = `<span>${esc(current.nome)}</span><button data-action="logout" class="ghost small">Sair</button>`;
  app.innerHTML = `<div class="page-title"><p class="eyebrow">${current.tipo_usuario==='aluno'?'Área do aluno':'Área do responsável'}</p><h1>Olá, ${esc(current.nome.split(' ')[0])}.</h1><p class="muted">${current.tipo_usuario==='aluno'?'Escolha seu lanche e combine a retirada.':'Cuide do saldo e acompanhe os pedidos dos seus alunos.'}</p></div>${nav()}`;
  await renderTab();
}
function studentOptions(blank = false) {
  return `${blank?'<option value="">Minha carteira</option>':''}${panel.alunos.map(s=>`<option value="${s.id_aluno}" ${String(s.id_aluno)===selectedStudent?'selected':''}>${esc(s.nome)}</option>`).join('')}`;
}
function renderGuardian() {
  if (!panel.alunos.some(s=>String(s.id_aluno)===selectedStudent)) selectedStudent = panel.alunos[0] ? String(panel.alunos[0].id_aluno) : '';
  const student = panel.alunos.find(s=>String(s.id_aluno)===selectedStudent);
  document.querySelector('#content').innerHTML = `<div class="layout"><div>
  <section class="card"><div class="row"><h2>Meus alunos</h2><span class="badge">${panel.alunos.length} cadastrado(s)</span></div>
  ${student ? `<label>Selecionar aluno<select id="student-select">${studentOptions()}</select></label><div class="separator"></div><h2>${esc(student.nome)}</h2><p class="student-info muted">Turma ${esc(student.turma)} · Login: ${esc(student.login)}<br>Restrições informadas: ${esc(student.alergias.join(', ')||'Nenhuma')}<br>Gasto hoje: ${money(student.gasto_hoje)}</p><div class="row"><span>Saldo do aluno</span><strong>${money(student.saldo)}</strong></div><div class="separator"></div>
  <form id="transfer" class="form"><input type="hidden" name="id_aluno" value="${student.id_aluno}">${input('Valor para transferir (R$)','valor','number','required min="0.01" max="99999999.99" step="0.01" inputmode="decimal"')}<button>Transferir para ${esc(student.nome.split(' ')[0])}</button></form><div class="separator"></div>
  <form id="limit" class="form"><input type="hidden" name="id_aluno" value="${student.id_aluno}">${input('Limite diário de compras (R$)','valor','number',`min="0" max="99999999.99" step="0.01" value="${student.limite_gasto===null?'':esc(student.limite_gasto)}"`)}<p class="hint muted">Deixe vazio para não limitar. Zero bloqueia novas compras. O limite considera o dia da compra, não o da retirada.</p><button class="secondary">Salvar limite diário</button></form>` : '<p class="empty">Cadastre seu primeiro aluno abaixo para começar.</p>'}</section>
  <section class="card"><details ${!student?'open':''}><summary>Cadastrar novo aluno</summary><form id="student-register" class="form"><div class="fields">${identityFields()}${input('Data de nascimento','data_nascimento','date','required')}${input('Turma','turma','text','required maxlength="40" placeholder="Ex.: 1º A"')}${input('Parentesco','parentesco','text','required maxlength="40" placeholder="Ex.: mãe, pai, tutor"')}</div><fieldset><legend>Alergias e restrições informadas</legend><p class="hint muted">Se não houver, deixe todas desmarcadas.</p><div class="checkboxes">${allergies.map(a=>`<label><input name="alergias" type="checkbox" value="${a.id_alergia}">${esc(a.nome)}</label>`).join('')}</div></fieldset><p class="hint muted">Os dados ficam registrados no cadastro. O cardápio não verifica ingredientes automaticamente.</p><button>Cadastrar aluno</button></form></details></section></div>
  <aside><section class="card balance-card"><p>Minha carteira</p><div class="balance">${money(panel.carteira.saldo)}</div><p class="muted">Saldo disponível para transferir aos alunos.</p></section><section class="card"><h2>Adicionar saldo</h2>${panel.recarga_demo?`<div class="demo"><strong>Modo demonstração</strong><br>Créditos fictícios. Nenhum pagamento será cobrado.</div><form id="recharge" class="form">${input('Crédito de teste (R$)','valor','number','required min="0.01" max="1000" step="0.01"')}<button>Adicionar crédito de demonstração</button></form>`:'<p class="muted">A recarga de demonstração está desativada. Este projeto não tem integração de pagamentos.</p>'}</section></aside></div>`;
}
function totalCents() { return catalog.reduce((sum,p)=>sum+Math.round(Number(p.preco)*100)*(cart[p.id_produto]||0),0); }
function renderCart() {
  const products = catalog.filter(p=>cart[p.id_produto]);
  const student = panel.alunos[0];
  return `<section class="card sticky"><h2>${checkout?'Confirmar pedido':'Seu pedido'}</h2>${products.length?products.map(p=>`<div class="cart-item"><div class="row"><strong>${esc(p.nome)}</strong><span>${money(Number(p.preco)*cart[p.id_produto])}</span></div><div class="row"><small>${money(p.preco)} por unidade</small><div class="quantity"><button class="secondary small" data-change="-1" data-id="${p.id_produto}" aria-label="Diminuir ${esc(p.nome)}">−</button><span>${cart[p.id_produto]}</span><button class="secondary small" data-change="1" data-id="${p.id_produto}" aria-label="Adicionar ${esc(p.nome)}">+</button></div></div></div>`).join(''):'<p class="empty">Escolha um produto do cardápio.</p>'}
  <div class="row total"><span>Total</span><strong>${money(totalCents()/100)}</strong></div>
  ${checkout?`<form id="buy" class="form">${input('Data da retirada','data_retirada','date','required')}${input('Hora da retirada','hora_retirada','time','required')}<p class="hint muted">Retirada futura, em até 90 dias. Saldo após a compra: ${money(Number(panel.carteira.saldo)-totalCents()/100)}.</p><button ${products.length?'':'disabled'}>Confirmar compra</button><button type="button" class="secondary" data-action="back-cart">Voltar ao cardápio</button></form>`:`<button class="wide" data-action="checkout" ${products.length?'':'disabled'}>Escolher retirada</button>`}
  <p class="hint muted" style="margin-top:16px">Limite diário: ${limitLabel(student.limite_gasto)}. Comprado hoje: ${money(student.gasto_hoje)}.</p></section>`;
}
function renderStudent() {
  const groups = [...new Set(catalog.map(p=>p.categoria))];
  document.querySelector('#content').innerHTML = `<div class="layout"><div><section class="card balance-card"><div class="row"><span>Seu saldo</span><span>${esc(panel.alunos[0].turma)}</span></div><div class="balance">${money(panel.carteira.saldo)}</div><p class="muted">Seu responsável pode transferir novos créditos.</p></section>${groups.map(group=>`<h2>${esc(group)}</h2><div class="products">${catalog.filter(p=>p.categoria===group).map(p=>`<button class="product" data-change="1" data-id="${p.id_produto}" aria-label="Adicionar ${esc(p.nome)}"><span class="emoji">${esc(p.icone)}</span><span><strong>${esc(p.nome)}</strong><small>${money(p.preco)}</small></span><span class="plus">+</span></button>`).join('')}</div>`).join('')}</div><div>${renderCart()}</div></div>`;
}
async function renderTab() {
  const content = document.querySelector('#content');
  if (activeTab==='principal') { current.tipo_usuario==='aluno'?renderStudent():renderGuardian(); return; }
  content.innerHTML = '<section class="card"><p>Carregando…</p></section>';
  if (activeTab==='pedidos') {
    const result = await api('pedidos');
    content.innerHTML = `<section class="card"><h2>Últimos 50 pedidos</h2>${result.pedidos.length?result.pedidos.map(o=>`<article class="order"><div class="row"><h3>Pedido #${o.id_pedido} · ${esc(o.aluno)}</h3><span class="badge">${esc(o.status)}</span></div><p class="muted">Retirada: ${esc(dateOnly(o.data_retirada))} às ${esc(o.hora_retirada.slice(0,5))}<br>Comprado em ${localDate(o.criado_em.replace(' ','T'))}</p><ul>${o.itens.map(i=>`<li>${i.quantidade} × ${esc(i.nome_produto)} — ${money(i.preco_unitario)} cada</li>`).join('')}</ul><strong>Total: ${money(o.valor_total)}</strong></article>`).join(''):'<p class="empty">Nenhum pedido realizado.</p>'}</section>`;
  } else {
    content.innerHTML = `<section class="card"><h2>Extrato</h2>${current.tipo_usuario==='responsavel'?`<label>Carteira<select id="statement-select">${studentOptions(true)}</select></label>`:''}<div id="statement"></div></section>`;
    await renderStatement();
  }
}
async function renderStatement() {
  const selected = document.querySelector('#statement-select')?.value || '';
  const result = await api('extrato',undefined,selected?`&id_aluno=${encodeURIComponent(selected)}`:'');
  document.querySelector('#statement').innerHTML = `<p class="hint muted" style="margin-top:20px">Últimas 100 movimentações da carteira selecionada.</p>${result.movimentacoes.length?result.movimentacoes.map(m=>`<div class="entry row"><div><strong>${esc(m.descricao)}</strong><br><small>${localDate(m.criado_em.replace(' ','T'))}</small></div><strong class="${Number(m.sentido)>0?'positive':'negative'}">${Number(m.sentido)>0?'+':'−'} ${money(m.valor)}</strong></div>`).join(''):'<p class="empty">Nenhuma movimentação.</p>'}${result.historico_limites.length?`<div class="separator"></div><h3>Alterações de limite diário</h3>${result.historico_limites.map(h=>`<div class="entry"><strong>${limitLabel(h.valor_anterior)} → ${limitLabel(h.valor_novo)}</strong><br><small>${esc(h.responsavel)} · ${localDate(h.alterado_em.replace(' ','T'))}</small></div>`).join('')}` : ''}`;
}
async function loadSession() {
  const session = await api('sessao'); csrf = session.csrf; current = session.usuario;
  if (!current) { renderAuth(); return; }
  const data = await api('catalogo'); catalog=data.produtos; allergies=data.alergias;
  await refresh();
}
document.addEventListener('submit', async event => {
  const form=event.target; if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault(); notice.hidden=true;
  const submit=form.querySelector('button:not([type="button"])'); if(submit.disabled) return;
  const data=Object.fromEntries(new FormData(form));
  submit.disabled=true;
  try {
    let result;
    if (form.id==='login') { await api('entrar',data); activeTab='principal'; await loadSession(); return; }
    if (form.id==='register') { result=await api('cadastrar_responsavel',data); await loadSession(); }
    if (form.id==='student-register') { data.alergias=new FormData(form).getAll('alergias'); result=await api('cadastrar_aluno',data); await refresh(); }
    if (form.id==='recharge') { result=await mutate('recarga',data); await refresh(); }
    if (form.id==='transfer') { result=await mutate('transferir',data); await refresh(); }
    if (form.id==='limit') { result=await mutate('limite',data); await refresh(); }
    if (form.id==='buy') {
      data.itens=Object.entries(cart).filter(([,q])=>q>0).map(([id,q])=>({id_produto:Number(id),quantidade:q}));
      result=await mutate('comprar',data); cart={}; checkout=false; activeTab='pedidos'; await refresh();
    }
    if(result) flash(result.mensagem);
  } catch(e) { flash(e.message,true); }
  finally { submit.disabled=false; }
});
document.addEventListener('click', async event => {
  const target=event.target.closest('button'); if(!target || target.disabled) return;
  try {
    if(target.dataset.action==='logout') { await api('sair',{}); cart={};pending.clear();checkout=false;selectedStudent='';activeTab='principal';notice.hidden=true;await loadSession(); }
    if(target.dataset.tab) { activeTab=target.dataset.tab; await refresh(); }
    if(target.dataset.change) {
      const id=target.dataset.id;
      const qty=Math.min(99,Math.max(0,(cart[id]||0)+Number(target.dataset.change)));
      if(qty)cart[id]=qty;else delete cart[id];
      const form=document.querySelector('#buy'); const draft=form?Object.fromEntries(new FormData(form)):null;
      renderStudent();
      if(draft) { document.querySelector('[name="data_retirada"]').value=draft.data_retirada;document.querySelector('[name="hora_retirada"]').value=draft.hora_retirada; }
    }
    if(target.dataset.action==='checkout') {checkout=true;renderStudent();document.querySelector('#buy').scrollIntoView({behavior:'smooth',block:'center'});}
    if(target.dataset.action==='back-cart') {checkout=false;renderStudent();}
  } catch(e) {flash(e.message,true);}
});
document.addEventListener('change', async event => {
  try {
    if(event.target.id==='student-select') {selectedStudent=event.target.value;renderGuardian();}
    if(event.target.id==='statement-select') await renderStatement();
  } catch(e) {flash(e.message,true);}
});
loadSession().catch(e=>{app.innerHTML=`<section class="card fatal"><h1>Vamos conectar a cantina.</h1><p>${esc(e.message)}</p><p>Confira os passos do arquivo <strong>LEIA-ME.md</strong>, dentro do ZIP.</p><button onclick="location.reload()">Tentar novamente</button></section>`;});
