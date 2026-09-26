'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const page = location.pathname.split('/').pop() || 'index.html';
  const nested = location.pathname.includes('/telas/');
  const prefix = nested ? '../' : '';
  const money = n => Number(n || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = (s, value, root = document) => { const el = $(s, root); if (el) el.textContent = value; };
  const html = (s, value, root = document) => { const el = $(s, root); if (el) el.innerHTML = value; };
  const initials = name => name.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('');
  const dateLabel = d => String(d || '').slice(0,10).split('-').reverse().join('/');
  const itemsLabel = items => items.map(i => `${i.quantidade}x ${i.nome_produto}`).join(', ');
  let csrf, user, state, editId = null, selected = new Set(), dailyStock = {}, chosenStudent = null, payment = '', saleKey = crypto.randomUUID();
  let interval = '', search = '', exported = [];
  const templates = new Map();
  function rows(parentSelector, itemSelector, values, fill) {
    const parent = $(parentSelector);
    if (!parent) return;
    const key = parentSelector + itemSelector;
    if (!templates.has(key)) templates.set(key, $(itemSelector,parent)?.cloneNode(true));
    $$(itemSelector + ', .empty-result', parent).forEach(el => el.remove());
    const template = templates.get(key);
    if (!values.length) { const empty=document.createElement('p'); empty.className='empty-result'; empty.textContent='Nenhum registro encontrado.'; parent.append(empty); return; }
    for (const value of values) { const node=template.cloneNode(true); fill(node,value); parent.append(node); }
  }
  function notice(message, error = false) {
    let box=$('#connection-notice');
    if (!box) { box=document.createElement('div'); box.id='connection-notice'; box.setAttribute('role','status'); document.body.append(box); }
    box.textContent=message; box.dataset.error=String(error); box.hidden=false;
    clearTimeout(notice.timer); notice.timer=setTimeout(()=>box.hidden=true,8000);
  }
  async function api(action, data) {
    const response=await fetch(prefix+'api.php?acao='+action,{credentials:'same-origin',method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf||''},body:data===undefined?undefined:JSON.stringify(data)});
    const result=await response.json();
    if (!response.ok) throw new Error(result.erro || 'Falha ao acessar o banco.');
    return result;
  }
  async function run(button, fn) {
    if (button?.disabled) return;
    if (button) button.disabled=true;
    try { await fn(); } catch(e) { notice(e.message,true); } finally { if(button) button.disabled=false; }
  }
  function sales() {
    return [...state.pedidos.filter(o=>o.status!=='cancelado').map(o=>({...o,date:o.criado_em,customer:o.aluno,payment:'carteira',paid:true,total:Number(o.valor_total),student:o.id_aluno})),
      ...state.vendas.map(v=>({...v,date:v.data_efetiva,customer:v.cliente,payment:v.pagamento,paid:v.pagamento!=='pendente',total:Number(v.valor_total),student:v.id_aluno}))].sort((a,b)=>b.date.localeCompare(a.date));
  }
  function periodRows(select, values=sales()) {
    const days=[1,7,30,90,180,365][select?.selectedIndex ?? 2];
    const end=new Date(state.hoje+'T23:59:59'); const start=new Date(state.hoje+'T00:00:00'); start.setDate(start.getDate()-days+1);
    return values.filter(v=>new Date(v.date.replace(' ','T'))>=start && new Date(v.date.replace(' ','T'))<=end);
  }
  const total = list => list.reduce((sum,v)=>sum+v.total,0);
  function ranking(list) {
    const map=new Map();
    for(const v of list) for(const i of v.itens) { const p=map.get(i.id_produto)||{nome:i.nome_produto,quantidade:0,total:0,icone:state.produtos.find(p=>p.id_produto==i.id_produto)?.icone||''}; p.quantidade+=Number(i.quantidade); p.total+=Number(i.preco_unitario)*Number(i.quantidade); map.set(i.id_produto,p); }
    return [...map.values()].sort((a,b)=>b.quantidade-a.quantidade);
  }
  function panel() {
    const month=state.hoje.slice(0,7), current=sales().filter(v=>v.date.startsWith(month));
    const previousDate=new Date(state.hoje+'T12:00:00'); previousDate.setDate(1); previousDate.setMonth(previousDate.getMonth()-1);
    const prevMonth=`${previousDate.getFullYear()}-${String(previousDate.getMonth()+1).padStart(2,'0')}`;
    const previous=sales().filter(v=>v.date.startsWith(prevMonth));
    const debt=sales().filter(v=>!v.paid), debtors=new Set(debt.map(v=>v.student||v.customer));
    const indicators=$$('.indicador h2');
    [money(total(current)),current.length,state.alunos.length,money(total(debt))].forEach((v,i)=>indicators[i].textContent=v);
    $$('.crescimento').forEach((el,i)=>{ const a=i?current.length:total(current), b=i?previous.length:total(previous); el.textContent=b?`${((a-b)*100/b).toFixed(1)}% em relação ao mês anterior`:'Sem movimento no mês anterior'; });
    text('.alerta',`${debtors.size} alunos/clientes com pendências`);
    const chartList=$('.grafico-card select').selectedIndex ? previous : current;
    const ranks=ranking(chartList), units=ranks.reduce((s,p)=>s+p.quantidade,0);
    const colors=['#3b82f6','#facc15','#22c55e','#ef4444','#a855f7'];
    html('.legenda',ranks.length?ranks.map((p,i)=>`<div class="legenda-item"><span class="bolinha" style="background:${colors[i%5]}"></span><div><strong>${esc(p.nome)}</strong><p>${units?Math.round(p.quantidade*100/units):0}% — ${p.quantidade} vendidos</p></div></div>`).join(''):'Nenhuma venda no período.');
    text('.pizza-centro strong',units); let offset=0;
    $('.pizza').style.background=units?'conic-gradient('+ranks.map((p,i)=>{const start=offset; offset+=p.quantidade*100/units; return `${colors[i%5]} ${start}% ${offset}%`;}).join(',')+')':'#e5e7eb';
    const summaries=$$('.resumo-item strong');
    [money(current.length?total(current)/current.length:0),`${new Set(current.filter(v=>v.student).map(v=>v.student)).size} alunos`,ranking(current)[0]?.nome||'Nenhum',`${debtors.size} alunos/clientes`].forEach((v,i)=>summaries[i].textContent=v);
    html('tbody',sales().slice(0,8).map(v=>`<tr><td>${esc(v.customer)}</td><td>${esc(itemsLabel(v.itens))}</td><td>${money(v.total)}</td><td>${esc(v.date.slice(11,16))}</td><td><span class="status ${v.paid?'concluido':'pendente'}">${v.paid?'Pago':'Pendente'}</span></td></tr>`).join(''));
    text('.usuario strong',user.nome); text('.usuario-icon',initials(user.nome));
  }
  function products() {
    rows('.lista','.item',state.produtos,(node,p)=>{
      text('.item-info strong',p.nome,node); text('.item-info span',p.categoria,node); text('.item-preco',money(p.preco),node); text('.item-icone',p.icone||'',node);
      let ingredients=$('.ingredientes-produto',node); if(!ingredients){ingredients=document.createElement('small');ingredients.className='ingredientes-produto';$('.item-info',node).append(ingredients);} ingredients.textContent=p.ingredientes?`Contém: ${p.ingredientes}`:'Ingredientes não informados';
      $('.editar',node).onclick=()=>{ editId=p.id_produto; $('.nome input').value=p.nome; $('.categoria select').value=p.categoria; $('.preco input').value=p.preco; $('.ingredientes textarea').value=p.ingredientes||''; text('.botao-cadastrar','Salvar alterações'); $('.nome input').focus(); };
    });
    text('.quantidade',`${state.produtos.length} itens`);
  }
  function availability() {
    const term=$('.pesquisa input').value.toLowerCase(), cat=$('.barra select').value;
    rows('.itens','.item',state.produtos.filter(p=>p.nome.toLowerCase().includes(term)&&(!cat||p.categoria===cat)),(node,p)=>{
      const active=selected.has(p.id_produto); node.classList.toggle('selecionado',active);
      text('.item-info strong',p.nome,node); text('.item-info span',p.categoria,node); text('.item-icone',p.icone||'',node); text('.preco',money(p.preco),node);
      let editor=$('.estoque-editor',node);
      if(!editor){editor=document.createElement('div');editor.className='estoque-editor';editor.innerHTML='<label>Unidades do dia<input class="estoque-dia" type="number" min="0" max="9999" step="1"></label><small class="estoque-restante"></small>';node.append(editor);}
      const total=Number(dailyStock[p.id_produto]??p.estoque_total??0),sold=Number(p.estoque_vendido||0);
      const stockInput=$('.estoque-dia',node);stockInput.value=total;
      text('.estoque-restante',`Restantes: ${Math.max(0,total-sold)}`,node);
      stockInput.oninput=()=>{
        dailyStock[p.id_produto]=Number(stockInput.value);
        const remaining=Math.max(0,Number(stockInput.value)-sold);
        text('.estoque-restante',`Restantes após vendas: ${remaining}`,node);
        const currentStatus=$('.status',node);
        if(active&&remaining>0){currentStatus.textContent='Disponível';currentStatus.className='status disponivel';}
        else if(active&&Number(stockInput.value)>0){currentStatus.textContent='Esgotado';currentStatus.className='status indisponivel';}
        else if(active){currentStatus.textContent='Defina unidades';currentStatus.className='status indisponivel';}
      };
      const check=$('.checkbox',node); check.textContent=active?'✓':''; check.classList.toggle('vazio',!active); node.tabIndex=0; node.setAttribute('role','checkbox'); node.setAttribute('aria-checked',active);
      const status=$('.status',node); status.textContent=active?(total>sold?'Disponível':total?'Esgotado':'Defina unidades'):'Indisponível'; status.className='status '+(active&&total>sold?'disponivel':'indisponivel');
      node.onclick=e=>{if(e.target.closest('.estoque-editor'))return;active?selected.delete(p.id_produto):selected.add(p.id_produto);availability();};
      node.onkeydown=e=>{ if(!e.target.closest('.estoque-editor')&&(e.key===' '||e.key==='Enter')){e.preventDefault();node.click();} };
    });
    text('.contador strong',selected.size); text('.salvar-area p',`${selected.size} itens selecionados para hoje`);
  }
  function initializeAvailability(){
    selected=new Set(state.produtos.filter(p=>Number(p.ativo)&&Number(p.estoque_total)>0).map(p=>Number(p.id_produto)));
    dailyStock=Object.fromEntries(state.produtos.map(p=>[p.id_produto,Number(p.estoque_total)||0]));
  }
  function orders() {
    const today=state.pedidos.filter(o=>o.data_retirada===state.hoje&&['09:00','15:30'].includes(String(o.hora_retirada).slice(0,5))&&o.status!=='cancelado');
    $$('.resumo-card strong').forEach((el,i)=>el.textContent=i?today.filter(o=>o.hora_retirada.startsWith(i===1?'09:00':'15:30')).length:today.length);
    rows('.pedidos','.pedido',today.filter(o=>(!interval||o.hora_retirada.startsWith(interval))&&o.aluno.toLowerCase().includes(search)),(node,o)=>{
      text('.aluno strong',o.aluno,node); text('.aluno span',o.turma,node); text('.avatar',initials(o.aluno),node); text('.pedido-item strong',itemsLabel(o.itens),node); text('.intervalo strong',o.hora_retirada.slice(0,5),node);
      let placed=$('.hora-encomenda',node);
      if(!placed){placed=document.createElement('div');placed.className='hora-encomenda';placed.innerHTML='<span>Encomendado às</span><strong></strong>';$('.intervalo',node).before(placed);}
      text('strong',String(o.criado_em||'').slice(11,16),placed);
      const done=['entregue','retirado'].includes(o.status); text('.status',done?'Entregue':o.status,node); $('.status',node).className='status '+(done?'entregue':'pendente');
      const button=$('.entregar',node); button.textContent=done?'Entregue':'Entregar'; button.disabled=done; button.classList.toggle('desativado',done);
      button.onclick=()=>run(button,async()=>{await api('pedido_status',{id_pedido:o.id_pedido,status:'entregue'}); await refresh();});
    });
  }
  function studentSelection(input) {
    const value=input.value.trim().toLowerCase(); chosenStudent=state.alunos.find(a=>`${a.nome} (#${a.id_aluno})`.toLowerCase()===value)||null;
  }
  function addStudents(input) {
    const list=document.createElement('datalist'); list.id='student-options'; list.innerHTML=state.alunos.map(a=>`<option value="${esc(a.nome)} (#${a.id_aluno})">${esc(a.turma)}</option>`).join(''); document.body.append(list); input.setAttribute('list',list.id);
  }
  function saleSummary() {
    const product=state.produtos.find(p=>p.id_produto==$('.item-linha select').value), qty=Number($('.quantidade').value)||0;
    const total=product?Number(product.preco)*qty:0;
    const debt=chosenStudent?state.vendas.filter(v=>Number(v.id_aluno)===Number(chosenStudent.id_aluno)&&v.pagamento==='pendente').reduce((sum,v)=>sum+Math.round(Number(v.valor_total)*100),0):0;
    const limit=25000, reached=debt>=limit, wouldExceed=debt+Math.round(total*100)>limit;
    for(const selector of ['.aluno-selecionado','.resumo-aluno']) { text(selector+' strong',chosenStudent?.nome||'Selecione o aluno'); text(selector+' span:not(.check)',chosenStudent?.turma||''); text(selector+' .avatar',chosenStudent?initials(chosenStudent.nome):''); }
    text('.resumo-produto strong',product?`${qty}x ${product.nome}`:'Selecione o item'); text('.resumo-produto span',product?money(product.preco):''); text('.resumo-total strong',money(total));
    let debtNotice=$('.aviso-inadimplencia'); if(!debtNotice){debtNotice=document.createElement('p');debtNotice.className='aviso-inadimplencia';$('.aluno-selecionado').after(debtNotice);}
    debtNotice.hidden=!chosenStudent||(!reached&&!wouldExceed);
    debtNotice.textContent=chosenStudent?`Anotado em aberto: ${money(debt/100)} de R$ 250,00. ${reached||wouldExceed?'Não pode anotar, limite atingido. Requer pagamento à vista. Apenas Pix ou dinheiro serão aceitos.':''}`:'';
    $$('.forma').forEach((button,index)=>{const value=['cartao','pix','dinheiro','pendente'][index];button.disabled=Boolean(chosenStudent&&(reached||wouldExceed)&&!['pix','dinheiro'].includes(value));if(button.disabled&&button.classList.contains('selecionada')){button.classList.remove('selecionada');payment='';}});
    text('.resumo-topo span','Novo');
    rows('.ultimos','.ultimo',state.vendas.slice(0,5),(node,v)=>{text('strong',v.cliente,node);text('span',itemsLabel(v.itens),node);text('b',money(v.valor_total),node);});
  }
  function statement() {
    const all=periodRows($('.data select')), received=page==='extrato-recebidos.html', list=received?all.filter(v=>v.paid):all;
    exported=list;
    const values=received?[money(total(list)),list.length,`${all.length?(list.length*100/all.length).toFixed(1):0}%`]:[money(total(all)),money(total(all.filter(v=>v.paid))),money(total(all.filter(v=>!v.paid)))];
    $$('.resumo-card strong').forEach((el,i)=>el.textContent=values[i]);
    rows('section.card','.linha',list,(node,v)=>{
      const cells=[...node.children]; cells[0].innerHTML=`${dateLabel(v.date)}<small>${esc(v.date.slice(11,16))}</small>`;
      cells[1].textContent=v.customer; cells[2].textContent=itemsLabel(v.itens); cells[3].textContent=v.payment; cells[4].textContent=money(v.total); cells[5].textContent=v.paid?'Pago':'Pendente'; cells[5].className='status '+(v.paid?'pago':'pendente');
      if(!v.paid) { const select=document.createElement('select'); select.setAttribute('aria-label','Registrar recebimento'); select.innerHTML='<option value="">Receber...</option><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option>'; cells[3].replaceChildren(select); select.onchange=()=>run(select,async()=>{if(select.value){await api('venda_pagamento',{id_venda:v.id_venda,pagamento:select.value}); await refresh();}}); }
    });
  }
  function finance() {
    const selects=$$('.periodo'), all=periodRows(selects[0]); text('.valor-principal strong',money(total(all))); text('.comparacao','');
    const ranks=ranking(periodRows(selects[1])), max=Math.max(1,...ranks.map(p=>p.total));
    rows('.itens-financeiro','.linha-item',ranks,(node,p)=>{text('.item-nome strong',p.nome,node);text('.item-nome small',`${p.quantidade} unidades`,node);text('.icone-item',p.icone,node);text('.valor-item',money(p.total),node);$('.barra',node).style.width=(p.total*100/max)+'%';});
    $$('.extrato-card').forEach((card,i)=>{const all=periodRows(selects[i+2]), list=i?all.filter(v=>v.paid):all; text('.extrato-resumo strong',money(total(list)),card);text('.diferenca strong',money(total(all.filter(v=>!v.paid))),card); html('.movimentos',list.slice(0,5).map(v=>`<div class="movimento"><div><strong>${esc(v.customer)}</strong><span>${esc(itemsLabel(v.itens))}</span></div><strong class="${v.paid?'entrada':'pendente-valor'}">${money(v.total)}</strong></div>`).join('')||'<p>Nenhuma movimentação.</p>',card);});
  }
  function studentFinance() {
    const student=chosenStudent, list=student?periodRows($('.periodo select'),sales().filter(v=>v.student==student.id_aluno)):[];
    text('.aluno-identificacao h2',student?.nome||'Selecione um aluno');text('.aluno-identificacao p',student?.turma||'');text('.avatar',student?initials(student.nome):'');
    text('.total-gasto > div > strong',money(total(list)));text('.total-pedidos strong',list.length);
    const contacts=$$('.responsavel-info strong'); contacts[0].textContent=student?.responsaveis.map(r=>r.nome).join(', ')||'—';contacts[1].textContent=student?.responsaveis.map(r=>r.telefone).join(', ')||'—';
    rows('.historico','.linha',list,(node,v)=>{const c=[...node.children];c[0].innerHTML=`${dateLabel(v.date)}<small>${esc(v.date.slice(11,16))}</small>`;c[1].textContent=itemsLabel(v.itens);c[2].textContent=v.payment;c[3].textContent=money(v.total);});
  }
  function render() {
    if(page==='painel.html') panel();
    if(page==='cadastro-itens.html') products();
    if(page==='itens-dia.html') availability();
    if(page==='pedidos-intervalo.html') orders();
    if(page==='pedidos-balcao.html') saleSummary();
    if(page.startsWith('extrato-')) statement();
    if(page==='financeiro.html') finance();
    if(page==='financeiro-aluno.html') studentFinance();
  }
  async function refresh() {state=await api('telas');render();}
  async function init() {
    const session=await api('sessao');csrf=session.csrf;user=session.usuario;
    if(page==='index.html') {
      const email=$('#email'); email.type='text'; email.required=true; $('#senha').required=true;
      $('form').onsubmit=e=>{e.preventDefault();run($('.botao-login'),async()=>{await api('entrar',{login:email.value,senha:$('#senha').value});location.href='telas/painel.html';});};
      $('.opcoes a').onclick=e=>{e.preventDefault();notice('Solicite a redefinição da senha ao administrador da cantina.');};
      $('.lembrar input').checked=Boolean(localStorage.getItem('shelby-login'));
      email.value=localStorage.getItem('shelby-login')||'';
      $('form').addEventListener('submit',()=>{if($('.lembrar input').checked)localStorage.setItem('shelby-login',email.value);else localStorage.removeItem('shelby-login');});
      document.body.dataset.ready='true'; return;
    }
    if(!user||user.tipo_usuario!=='cantineiro'){location.replace(prefix+'index.html');return;}
    const nav=$('aside.menu nav');
    if(nav&&!nav.querySelector('[data-cadastrar-operador]')){
      const link=document.createElement('a');
      link.href=prefix+'telas/cadastro.html';
      link.target='_blank';
      link.rel='noopener';
      link.className='menu-item';
      link.dataset.cadastrarOperador='';
      link.innerHTML='<span>+</span><span>Cadastrar operador</span>';
      nav.append(link);
    }
    if(page==='cadastro.html') {
      $('form').onsubmit=e=>{e.preventDefault();run($('.botao-cadastro'),async()=>{await api('cadastrar_operador',{nome:$('#usuario').value,login:$('#usuario').value,email:$('#email').value,senha:$('#senha').value,confirmar_senha:$('#confirmar-senha').value});notice('Operador cadastrado.');$('form').reset();});};
      $$('input').forEach(el=>el.required=true);document.body.dataset.ready='true';return;
    }
    state=await api('telas');
    const logout=$$('.menu a').find(a=>a.textContent.includes('Sair'));
    if(logout){logout.href=prefix+'index.html';logout.onclick=e=>{e.preventDefault();run(null,async()=>{await api('sair',{});location.href=prefix+'index.html';});};}
    if($('.data strong'))text('.data strong',dateLabel(state.hoje));
    if(page==='cadastro-itens.html') {
      $$('.categoria option').forEach((o,i)=>o.value=i?o.textContent.trim().toLowerCase():'');
      $('.botao-cadastrar').onclick=e=>run(e.currentTarget,async()=>{await api('produto_salvar',{id_produto:editId,nome:$('.nome input').value,categoria:$('.categoria select').value,preco:$('.preco input').value.replace(',','.'),ingredientes:$('.ingredientes textarea').value}); editId=null;$('.nome input').value='';$('.preco input').value='';$('.ingredientes textarea').value='';text('.botao-cadastrar','Cadastrar item');await refresh();notice('Produto salvo.');});
    }
    if(page==='itens-dia.html') {
      initializeAvailability();
      $$('.barra select option').forEach((o,i)=>o.value=i?o.textContent.trim().toLowerCase():'');
      const other=document.createElement('option');other.value='outros';other.textContent='Outros';$('.barra select').append(other);
      $('.pesquisa input').oninput=availability;$('.barra select').onchange=availability;
      $('.salvar').onclick=e=>run(e.currentTarget,async()=>{const stocks=Object.fromEntries([...selected].map(id=>[id,Number(dailyStock[id])||0]));await api('disponibilidade',{produtos:[...selected],estoques:stocks});await refresh();initializeAvailability();availability();notice('Estoque e disponibilidade salvos.');});
    }
    if(page==='pedidos-intervalo.html') {
      $('.pesquisa input').oninput=e=>{search=e.target.value.toLowerCase();orders();};
      $$('.filtro').forEach((b,i)=>b.onclick=()=>{$$('.filtro').forEach(x=>x.classList.remove('ativo'));b.classList.add('ativo');interval=i?b.textContent.trim():'';orders();});
    }
    if(page==='painel.html')$('.grafico-card select').onchange=panel;
    if(page==='pedidos-balcao.html') {
      const input=$('.pesquisa input');addStudents(input);input.oninput=()=>{studentSelection(input);saleSummary();};$('.pesquisa button').onclick=()=>{studentSelection(input);saleSummary();};
      html('.item-linha select','<option value="">Selecione o item</option>'+state.produtos.filter(p=>Number(p.ativo)&&Number(p.estoque_restante)>0).map(p=>`<option value="${p.id_produto}" data-restante="${p.estoque_restante}">${esc(p.nome)} — ${money(p.preco)} (${p.estoque_restante} un.)</option>`).join(''));
      $('.item-linha select').onchange=()=>{const rest=Number($('.item-linha select').selectedOptions[0]?.dataset.restante||0);$('.quantidade').max=rest;$('.quantidade').value=Math.min(Number($('.quantidade').value)||1,rest)||1;saleSummary();};$('.quantidade').oninput=()=>{const max=Number($('.quantidade').max)||0;if(max&&Number($('.quantidade').value)>max) $('.quantidade').value=max;saleSummary();};
      $('#data-venda').value=state.hoje;$('#hora-venda').value=new Date().toTimeString().slice(0,5);text('.topo .data','Hoje, '+dateLabel(state.hoje));
      $$('.forma').forEach((b,i)=>b.onclick=()=>{if(b.disabled)return;payment=['cartao','pix','dinheiro','pendente'][i];$$('.forma').forEach(x=>x.classList.remove('selecionada'));b.classList.add('selecionada');saleSummary();});
      $('.registrar').onclick=e=>run(e.currentTarget,async()=>{if(!chosenStudent)throw new Error('Selecione um aluno da lista.');const result=await api('venda_balcao',{chave:saleKey,id_aluno:chosenStudent.id_aluno,cliente:chosenStudent.nome,pagamento:payment,observacao:$('.observacao input').value,data_venda:$('#data-venda').value+' '+$('#hora-venda').value+':00',itens:[{id_produto:$('.item-linha select').value,quantidade:$('.quantidade').value}]});saleKey=crypto.randomUUID();await refresh();notice(result.mensagem);});
    }
    if(page==='financeiro.html')$$('.periodo').forEach(s=>s.onchange=finance);
    if(page.startsWith('extrato-')) {
      $('.data select').onchange=statement;
      $('.exportar').onclick=()=>{const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"';const csv=[['Data','Aluno','Itens','Pagamento','Valor'],...exported.map(v=>[v.date,v.customer,itemsLabel(v.itens),v.payment,v.total])].map(r=>r.map(cell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=page.replace('.html','.csv');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    }
    if(page==='financeiro-aluno.html') {const input=$('.barra-pesquisa input');addStudents(input);input.oninput=()=>{studentSelection(input);studentFinance();};$('.barra-pesquisa button').onclick=()=>{studentSelection(input);studentFinance();};$('.periodo select').onchange=studentFinance;}
    render();document.body.dataset.ready='true';
  }
  init().catch(e=>{notice(e.message,true);document.body.dataset.ready='error';});
})();
