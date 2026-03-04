const API_URL = \"https://script.google.com/macros/s/AKfycbwUBmnkEkUKJGfCoDcu547QNlqzpmjuyT-iLDshB1gJWYgRmi6fnPLiCJTWpBAzKSfjZw/exec\";
const App = (() => {
  let TOKEN = \"\";
  let USER = null;
  let WORKS = [];
  let CATEGORIAS = [];
  let primaryObraId = \"\";
  let currentObraId = \"\";
  let brand = { name:'Controle Financeiro de Obras', color:'#0b2a4a', logo_url:'' };
  let notaSelectedFile = null;
  let notaUploaded = { fileId:'', url:'' };
  let lineChart = null;

  function $(id){ return document.getElementById(id); }

  function setMsg(id, text, ok=false){
    const el = $(id);
    if(!el) return;
    el.className = \"msg \" + (ok ? \"ok\":\"err\");
    el.textContent = text || \"\";
  }

  function brl(n){
    const v = Number(n||0);
    return v.toLocaleString(\"pt-BR\",{style:\"currency\",currency:\"BRL\"});
  }

  function currentMonth(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function setDefaultDate(){
    const d = new Date();
    const el = $(\"inpData\");
    if(el) el.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  async function api(action, payload = {}) {
    const res = await fetch(API_URL, {
      method: \"POST\",
      headers: { \"Content-Type\": \"text/plain;charset=utf-8\" },
      body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) throw new Error(\"Erro na comunicação com servidor\");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || \"Erro desconhecido\");
    return data.data;
  }

  function applyBrand(){
    document.documentElement.style.setProperty(\"--brand\", brand.color || \"#0b2a4a\");
    const el = $(\"brandTitle\");
    if(el) el.textContent = brand.name || \"Controle Financeiro de Obras\";
  }

  function togglePass(inputId){
    const el = $(inputId);
    if(el) el.type = (el.type === \"password\") ? \"text\" : \"password\";
  }

  // ---------------- AUTH ----------------
  async function login(){
    setMsg(\"loginMsg\",\"\");
    try{
      const role = $(\"loginRole\").value;
      const username = $(\"loginUser\").value.trim();
      const password = $(\"loginPass\").value;
      const r = await api(\"auth.login\", { role, username, password });
      TOKEN = r.token;
      USER = r.user;
      WORKS = r.works || [];
      CATEGORIAS = r.categorias || [];
      brand = r.brand || brand;
      applyBrand();
      $(\"pillUser\").textContent = `${USER.role} • ${USER.username}`;
      $(\"pillUser\").classList.remove(\"hidden\");
      $(\"btnLogout\").classList.remove(\"hidden\");
      if(USER.primeiro_acesso){
        $(\"loginArea\").classList.add(\"hidden\");
        $(\"pwArea\").classList.remove(\"hidden\");
        return;
      }
      await initApp();
    } catch(e){
      setMsg(\"loginMsg\", e.message);
    }
  }

  async function changePassword(){
    setMsg(\"pwMsg\",\"\");
    try{
      const p1 = $(\"pw1\").value;
      const p2 = $(\"pw2\").value;
      if(!p1 || p1.length < 4) throw new Error(\"Senha muito curta (mín. 4).\");
      if(p1 !== p2) throw new Error(\"As senhas não conferem.\");
      await api(\"auth.changePassword\", { token: TOKEN, newPassword: p1 });
      const r = await api(\"auth.me\", { token: TOKEN });
      USER = r.user;
      $(\"pwArea\").classList.add(\"hidden\");
      await initApp();
    } catch(e){
      setMsg(\"pwMsg\", e.message);
    }
  }

  async function logout(){
    try{ if(TOKEN) await api(\"auth.logout\", { token: TOKEN }); } catch(_e){}
    location.reload();
  }

  // ---------------- INIT ----------------
  async function initApp(){
    WORKS = (await api(\"app.init\", { token: TOKEN })).works || WORKS;
    primaryObraId = WORKS[0]?.obra_id || \"\";
    currentObraId = primaryObraId;
    fillWorks();
    fillCategories();
    setDefaultDate();
    const fMes = $(\"fMes\");
    if(fMes) fMes.value = currentMonth();
    $(\"loginArea\").classList.add(\"hidden\");
    $(\"appArea\").classList.remove(\"hidden\");
    if(USER.role === \"ADMIN\") $(\"btnAdmin\").classList.remove(\"hidden\");
    refreshAll();
  }

  function fillWorks(){
    const s = $(\"obraSelect\");
    if(!s) return;
    s.innerHTML = \"\";
    WORKS.forEach(w=>{
      const o = document.createElement(\"option\");
      o.value = w.obra_id;
      o.textContent = `${w.obra_id} — ${w.obra_nome}`;
      s.appendChild(o);
    });
    if(currentObraId) s.value = currentObraId;
  }

  function onChangeObra(){
    currentObraId = $(\"obraSelect\").value;
    refreshAll();
  }

  function fillCategories(){
    const s = $(\"inpCat\");
    if(!s) return;
    s.innerHTML = \"\";
    CATEGORIAS.forEach(c=>{
      const o = document.createElement(\"option\");
      o.value = c; o.textContent = c;
      s.appendChild(o);
    });
  }

  // ---------------- ACTIONS ----------------
  async function registerExpense(){
    setMsg(\"msg\",\"\");
    try{
      const valor = Number($(\"inpVal\").value.replace(/\\./g,'').replace(',','.'));
      const payload = {
        obra_id: currentObraId,
        categoria: $(\"inpCat\").value,
        detalhes: $(\"inpDet\").value.trim(),
        valor,
        data: $(\"inpData\").value,
        reembolsavel: $(\"inpReemb\").value
      };
      if(!payload.obra_id || !payload.detalhes || !payload.valor) throw new Error(\"Preencha os campos obrigatórios.\");
      await api(\"expense.create\", { token: TOKEN, payload });
      $(\"inpDet\").value = \"\"; $(\"inpVal\").value = \"\";
      setMsg(\"msg\",\"Registrado!\", true);
      refreshAll();
    } catch(e){ setMsg(\"msg\", e.message); }
  }

  async function refreshAll(){
    try{
      const monthRef = $(\"fMes\").value;
      const res = await api(\"dash.summary\", { token: TOKEN, monthRef, obra_id: currentObraId });
      $(\"kTotal\").textContent = brl(res.totalGeral);
      $(\"kStatus\").textContent = res.isClosed ? \"FECHADO\" : \"ABERTO\";
      $(\"kTop\").textContent = res.maiorCategoria;
      $(\"kBottom\").textContent = res.menorCategoria;
      const tb = $(\"tbResumo\");
      tb.innerHTML = \"\";
      Object.entries(res.totals).forEach(([cat, val])=>{
        const tr = document.createElement(\"tr\");
        tr.innerHTML = `<td><b>${cat}</b></td><td>${brl(val)}</td>`;
        tb.appendChild(tr);
      });
      const series = await api(\"dash.series\", { token: TOKEN, monthRef, obra_id: currentObraId });
      renderLine(series);
    } catch(e){ console.error(e); }
  }

  function renderLine(series){
    const pts = series.points || [];
    const labels = pts.map(p=>p.date);
    const values = pts.map(p=>p.total);
    if(lineChart) lineChart.destroy();
    lineChart = new Chart($(\"chartLine\"), {
      type:\"line\",
      data:{ labels, datasets:[{ data: values, tension:.3, borderColor:'#0b2a4a' }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } } }
    });
  }

  function toggleAdmin(){
    $(\"adminArea\").classList.toggle(\"hidden\");
    adminTab(\"users\");
  }

  async function adminTab(tab){
    setMsg(\"admMsg\",\"\");
    [\"users\",\"works\",\"emails\",\"logo\",\"month\"].forEach(t=>$(\"adm_\"+t).classList.add(\"hidden\"));
    $(\"adm_\"+tab).classList.remove(\"hidden\");
    if(tab===\"users\") await renderUsers();
    if(tab===\"works\") await renderWorks();
  }

  async function renderUsers(){
    const list = await api(\"admin.users.list\", { token: TOKEN });
    $(\"adm_users\").innerHTML = `
      <input id=\"au_user\" placeholder=\"user\" />
      <input id=\"au_nome\" placeholder=\"nome\" />
      <select id=\"au_role\"><option value=\"USER\">USER</option><option value=\"ADMIN\">ADMIN</option></select>
      <button class=\"btn full\" onclick=\"App.adminUserUpsert()\">Salvar</button>
      <hr/>
      <table>${list.map(u=>`<tr><td>${u.username}</td><td>${u.role}</td><td><button onclick=\"App.adminResetPass('${u.username}')\">Reset</button></td></tr>`).join('')}</table>
    `;
  }

  async function adminUserUpsert(){
    const user = { username:$(\"au_user\").value, nome:$(\"au_nome\").value, role:$(\"au_role\").value, ativo:true };
    await api(\"admin.users.upsert\", { token: TOKEN, user });
    renderUsers();
  }

  async function adminResetPass(username){
    await api(\"admin.users.resetPassword\", { token: TOKEN, username });
    setMsg(\"admMsg\",\"Resetado para user123\", true);
  }

  async function renderWorks(){
    const list = await api(\"admin.works.list\", { token: TOKEN });
    $(\"adm_works\").innerHTML = `
      <input id=\"aw_id\" placeholder=\"ID\" />
      <input id=\"aw_nome\" placeholder=\"Nome\" />
      <button class=\"btn full\" onclick=\"App.adminWorkUpsert()\">Salvar</button>
      <hr/>
      <table>${list.map(w=>`<tr><td>${w.obra_id}</td><td>${w.obra_nome}</td></tr>`).join('')}</table>
    `;
  }

  async function adminWorkUpsert(){
    const work = { obra_id:$(\"aw_id\").value, obra_nome:$(\"aw_nome\").value, ativa:true };
    await api(\"admin.works.upsert\", { token: TOKEN, work });
    renderWorks();
  }

  return {
    login, logout, togglePass, changePassword,
    registerExpense, refreshAll, onChangeObra,
    toggleAdmin, adminTab, adminUserUpsert, adminResetPass, adminWorkUpsert
  };
})();
