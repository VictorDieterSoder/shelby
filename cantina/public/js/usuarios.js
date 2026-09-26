'use strict';
(() => {
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const page=location.pathname.split('/').pop()||'index.html';
  const prefix=location.pathname.includes('/telas/')?'../':'';
  const lowBalanceThresholdCents=2000;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let csrf='',user,panel,catalog=[],cart={},busy=false,cartKey='',operationKey='';
  async function api(action,data) {
    const response=await fetch(prefix+'api.php?acao='+action,{credentials:'same-origin',method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data)});
    const body=await response.json();if(!response.ok)throw new Error(body.erro||'Não foi possível acessar o banco.');return body;
  }
  async function run(fn) {if(busy)return;busy=true;try{await fn();}catch(e){alert(e.message);}finally{busy=false;}}
  function persist(){sessionStorage.setItem(cartKey,JSON.stringify(cart));sessionStorage.removeItem(cartKey+'-compra');}
  function items(){return catalog.filter(p=>cart[p.id_produto]).map(p=>({...p,quantidade:cart[p.id_produto]}));}
  function total(){return items().reduce((s,p)=>s+Math.round(Number(p.preco)*100)*p.quantidade,0)/100;}
  function change(id,delta){cart[id]=Math.max(0,Math.min(99,(cart[id]||0)+delta));if(!cart[id])delete cart[id];persist();renderCart();}
  function configurarRetirada(){
    const now=new Date();
    const day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const input=$('#dataRetirada');input.value=day;input.min=day;input.max=day;
    const cutoffs={'09:00':'08:45','15:30':'15:15'};
    const options=[...$('#horaRetirada').options].filter(option=>option.value);
    for(const option of options){
      const [hour,minute]=cutoffs[option.value].split(':').map(Number);
      const cutoff=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hour,minute);
      option.disabled=now>cutoff;
    }
    if($('#horaRetirada').selectedOptions[0]?.disabled)$('#horaRetirada').value='';
    const open=options.filter(option=>!option.disabled);
    $('#avisoIntervalo').textContent=open.length?'Encomendas somente para hoje, até 15 minutos antes de cada intervalo.': 'Os prazos de encomenda de hoje já encerraram.';
    $('.btn-comprar').disabled=!open.length;
  }
  function renderCart(){
    const list=$('#listaPedido');list.replaceChildren();
    if(!items().length)list.innerHTML='<p class="pedido-vazio">Nenhum item selecionado.</p>';
    for(const p of items()){
      const row=document.createElement('div');row.className='item-pedido';
      if(page==='resumoPedido.html')row.innerHTML=`<div><strong>${esc(p.nome)}</strong><span>${p.quantidade} x ${money(p.preco)}</span></div><strong>${money(p.preco*p.quantidade)}</strong>`;
      else {
        row.innerHTML=`<div class="item-info"><strong>${esc(p.nome)}</strong><span>${money(p.preco)}</span></div><div class="quantidade"><button type="button" aria-label="Diminuir">−</button><span>${p.quantidade}</span><button type="button" aria-label="Adicionar">+</button></div><strong class="subtotal">${money(p.preco*p.quantidade)}</strong><button class="remover" type="button" aria-label="Remover">×</button>`;
        const buttons=row.querySelectorAll('button');buttons[0].onclick=()=>change(p.id_produto,-1);buttons[1].onclick=()=>change(p.id_produto,1);buttons[2].onclick=()=>{delete cart[p.id_produto];persist();renderCart();};
      }
      list.append(row);
    }
    if($('#totalPedido'))$('#totalPedido').textContent=money(total());
    if($('#valorTotal')){$('#valorTotal').textContent=money(total());$('#saldo').textContent=money(panel.carteira.saldo);$('#saldoDepois').textContent=money(Number(panel.carteira.saldo)-total());}
  }
  function renderCatalog(){
    $('#saldoAluno').textContent=money(panel.carteira.saldo);$('.aluno strong').textContent=user.nome;
    const template=$('.categoria').cloneNode(true);$$('.categoria').forEach(el=>el.remove());
    for(const category of [...new Set(catalog.map(p=>p.categoria))]){
      const section=template.cloneNode(true);section.querySelector('h2').textContent=category[0].toUpperCase()+category.slice(1);const list=section.querySelector('.produtos');list.replaceChildren();
      for(const p of catalog.filter(p=>p.categoria===category)){
        const node=document.createElement('div');node.className='produto';node.tabIndex=0;node.setAttribute('role','button');node.innerHTML=`<div class="icone">${esc(p.icone||'')}</div><div><strong>${esc(p.nome)}</strong><span>${money(p.preco)}</span></div>`;node.onclick=()=>change(p.id_produto,1);node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();node.click();}};list.append(node);
      }
      $('.pedido').before(section);
    }
  }
  async function guardianPanel(){
    const selected=$('#filho').value;panel=await api('painel');$('#saldoTotal').textContent=money(panel.carteira.saldo);
    $('#filho').innerHTML=panel.alunos.map(a=>`<option value="${a.id_aluno}">${esc(a.nome)}</option>`).join('');
    if(panel.alunos.some(a=>String(a.id_aluno)===selected))$('#filho').value=selected;
    $('.btn-saldo').disabled=!panel.recarga_demo;
    await guardianStudent();
  }
  async function guardianStudent(){
    const student=panel.alunos.find(a=>String(a.id_aluno)===$('#filho').value);
    $('#nomeAluno').textContent=student?.nome||'Nenhum aluno vinculado';$('#saldoFilho').textContent=money(student?.saldo);$('#limiteFilho').textContent=student?.limite_gasto==null?'Sem limite':money(student.limite_gasto);
    $$('.acoes button').forEach(b=>b.disabled=!student);
    const lowBalanceNotice=$('#saldoBaixoAviso');
    const balance=Number(student?.saldo??0);
    const isLowBalance=Boolean(student)&&Number.isFinite(balance)&&Math.round(balance*100)<=lowBalanceThresholdCents;
    lowBalanceNotice.hidden=!isLowBalance;
    lowBalanceNotice.textContent=isLowBalance?`Atenção: o saldo de ${student.nome} está baixo. Ainda restam ${money(balance)}.`:'';
    if(!student){$('#listaExtrato').textContent='Nenhuma movimentação.';return;}
    const ledger=await api('extrato&id_aluno='+encodeURIComponent(student.id_aluno));
    $('#listaExtrato').innerHTML=ledger.movimentacoes.map(m=>`<div class="movimentacao"><div><strong>${esc(m.descricao)}</strong><span>${esc(student.nome)} • ${esc(m.criado_em)}</span></div><strong class="${Number(m.sentido)>0?'entrada':'saida'}">${Number(m.sentido)>0?'+':'−'} ${money(m.valor)}</strong></div>`).join('')||'<p>Nenhuma movimentação.</p>';
  }
  window.entrar=()=>{const type=$('input[name="tipoUsuario"]:checked')?.value;if(!type){alert('Selecione Aluno ou Responsável.');return;}location.href='telas/'+(type==='aluno'?'loginAluno.html':'loginResp.html');};
  window.limparPedido=()=>{cart={};persist();renderCart();};
  window.fazerPedido=()=>{if(!items().length){alert('Selecione pelo menos um item.');return;}if(total()>Number(panel.carteira.saldo)){alert('Saldo insuficiente.');return;}persist();location.href='resumoPedido.html';};
  window.comprar=()=>run(async()=>{
    const day=$('#dataRetirada').value,hour=$('#horaRetirada').value;
    if(!day||!hour)throw new Error('Escolha a data de hoje e um intervalo disponível.');
    if(!items().length)throw new Error('Seu pedido está vazio.');
    const signature=JSON.stringify({cart,day,hour});
    const saved=JSON.parse(sessionStorage.getItem(cartKey+'-compra')||'null');
    const key=saved?.signature===signature?saved.key:crypto.randomUUID();sessionStorage.setItem(cartKey+'-compra',JSON.stringify({signature,key}));
    const result=await api('comprar',{chave:key,data_retirada:day,hora_retirada:hour,itens:items().map(p=>({id_produto:p.id_produto,quantidade:p.quantidade}))});
    cart={};persist();alert(result.mensagem);location.href='painelAluno.html';
  });
  window.trocarFilho=()=>run(guardianStudent);
  window.adicionarSaldoTotal=()=>run(async()=>{const amount=prompt('Crédito fictício de teste: quanto deseja adicionar? Nenhum pagamento será cobrado.');if(amount===null)return;const result=await api('recarga',{chave:crypto.randomUUID(),valor:amount.trim()});await guardianPanel();alert(result.mensagem);});
  window.adicionarSaldoFilho=()=>run(async()=>{const amount=prompt('Quanto deseja transferir para o aluno?');if(amount===null)return;await api('transferir',{chave:crypto.randomUUID(),id_aluno:$('#filho').value,valor:amount.trim()});await guardianPanel();});
  window.definirLimite=()=>run(async()=>{const amount=prompt('Limite diário (0 bloqueia compras; vazio remove o limite):');if(amount===null)return;await api('limite',{chave:crypto.randomUUID(),id_aluno:$('#filho').value,valor:amount.trim()});await guardianPanel();});
  window.editarPerfilAluno=()=>{
    const student=panel?.alunos.find(a=>String(a.id_aluno)===$('#filho').value);
    if(!student)return;
    $('#perfilNome').value=student.nome||'';
    $('#perfilLogin').value=student.login||'';
    $('#perfilEmail').value=student.email||'';
    $('#perfilTurma').value=student.turma||'';
    $('#perfilIdade').value=student.idade_informada||'';
    $('#perfilSenha').value='';$('#perfilConfirmarSenha').value='';
    $('#alergiasPerfil').innerHTML=panel.alergias_disponiveis.map(a=>`<label><input type="checkbox" value="${Number(a.id_alergia)}" ${student.alergias_ids.some(id=>Number(id)===Number(a.id_alergia))?'checked':''}>${esc(a.nome)}</label>`).join('');
    $('#dialogEditarPerfil').showModal();
  };
  window.fecharEdicaoPerfil=()=>$('#dialogEditarPerfil').close();
  window.sairPerfilAluno=()=>run(async()=>{
    if(cartKey){sessionStorage.removeItem(cartKey);sessionStorage.removeItem(cartKey+'-compra');}
    await api('sair',{});location.href='../index.html';
  });
  async function init(){
    if(page==='index.html')return;
    // Prevent native form submission while the session is loading.
    const form=$('form');if(form)form.onsubmit=e=>e.preventDefault();
    const session=await api('sessao');csrf=session.csrf;user=session.usuario;
    if(page==='loginAluno.html'||page==='loginResp.html'){
      form.onsubmit=e=>{e.preventDefault();run(async()=>{
        if(page==='loginAluno.html'){
          await api('entrar',{login:$('#usuario').value,senha:$('#senha').value});const logged=await api('sessao');
          if(logged.usuario.tipo_usuario!=='aluno'){await api('sair',{});throw new Error('Use uma conta de aluno.');}
          location.href='painelAluno.html';
        }else{await api('entrar_responsavel',{responsavel:$('#responsavel').value,aluno:$('#aluno').value,senha:$('#senha').value});location.href='painelResp.html';}
      });};return;
    }
    if(page==='cadastroAluno.html'){
      $$('[name="alergias"]').forEach(el=>el.onchange=()=>{if(el.value==='nenhuma'&&el.checked)$$('[name="alergias"]').forEach(x=>{if(x!==el)x.checked=false;});else if(el.checked)$('[value="nenhuma"]').checked=false;});
      form.onsubmit=e=>{e.preventDefault();run(async()=>{
        if($('#senha').value!==$('#confirmarSenha').value){$('#erroSenha').textContent='As senhas não são iguais.';return;}
        $('#erroSenha').textContent='';
        const result=await api('cadastro_original',{login:$('#usuario').value,senha:$('#senha').value,confirmar_senha:$('#confirmarSenha').value,email:$('#email').value,turma:$('#turma').value,idade:$('#idade').value,responsavel:$('#responsavel').value,telefone:$('#telefone').value,alergias:$$('[name="alergias"]:checked').map(x=>x.value).filter(x=>x!=='nenhuma')});
        alert('Cadastro concluído. Anote o acesso separado do responsável:\nNome: '+result.responsavel+'\nAluno: '+result.aluno+'\nSenha do responsável: '+result.senha_responsavel+'\n\nO aluno entra com a senha escolhida no cadastro.');location.href='loginAluno.html';
      });};return;
    }
    const role=page==='painelResp.html'?'responsavel':'aluno';
    if(!user||user.tipo_usuario!==role){location.replace(role==='aluno'?'loginAluno.html':'loginResp.html');return;}
    if(role==='responsavel'){
      $('.btn-sair').onclick=()=>run(async()=>{await api('sair',{});location.href='../index.html';});
      $('#formEditarPerfil').onsubmit=e=>{e.preventDefault();run(async()=>{
        const senha=$('#perfilSenha').value;
        if(senha!==$('#perfilConfirmarSenha').value)throw new Error('As senhas não coincidem.');
        const result=await api('editar_aluno',{id_aluno:$('#filho').value,nome:$('#perfilNome').value,login:$('#perfilLogin').value,email:$('#perfilEmail').value,turma:$('#perfilTurma').value,idade:$('#perfilIdade').value,alergias:$$('#alergiasPerfil input:checked').map(input=>input.value),senha,confirmar_senha:$('#perfilConfirmarSenha').value});
        $('#dialogEditarPerfil').close();await guardianPanel();alert(result.mensagem);
      });};
      await guardianPanel();return;
    }
    panel=await api('painel');catalog=(await api('catalogo')).produtos;
    cartKey='cantina-carrinho-'+user.id_usuario;
    try{cart=JSON.parse(sessionStorage.getItem(cartKey)||'{}');}catch{cart={};}
    if(!cart||typeof cart!=='object'||Array.isArray(cart))cart={};
    for(const id of Object.keys(cart))if(!Number.isInteger(cart[id])||cart[id]<1||cart[id]>99||!catalog.some(p=>String(p.id_produto)===id))delete cart[id];
    if(page==='painelAluno.html')renderCatalog();
    if(page==='resumoPedido.html')configurarRetirada();
    renderCart();
  }
  init().catch(e=>alert(e.message));
})();

