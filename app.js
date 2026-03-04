const API_URL = "https://script.google.com/macros/s/AKfycbzMwvV9rippp06nXgwfYPpvgQ0bbczDbZimIKw5sTdcliZDEFtn2KspDvYjU71Z76CXog/exec";

const App = (() => {
  let TOKEN = "";
  let USER = null;
  let WORKS = [];
  let CATEGORIAS = [];
  let primaryObraId = "";
  let currentObraId = "";
  let brand = { name:'Controle Financeiro de Obras', color:'#0b2a4a', logo_url:'' };

  let notaSelectedFile = null;
  let notaUploaded = { fileId:'', url:'' };
  let lineChart = null;

  function $(id){ return document.getElementById(id); }

  function setMsg(id, text, ok=false){
    const el = $(id);
    if(!el) return;
    el.className = "msg " + (ok ? "ok":"err");
    el.textContent = text || "";
  }

  function brl(n){
    const v = Number(n||0);
    return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  }

  function currentMonth(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function setDefaultDate(){
    const d = new Date();
    $("inpData").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  async function api(action, payload){
const res = await fetch(API_URL, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify({ action, ...payload })
});
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || "Erro na API");
    return json.data;
  }

  function applyBrand(){
    document.documentElement.style.setProperty("--brand", brand.color || "#0b2a4a");
    $("brandTitle").textContent = brand.name || "Controle Financeiro de Obras";
  }

  function togglePass(inputId){
    const el = $(inputId);
    el.type = (el.type === "password") ? "text" : "password";
  }

  // ---------------- AUTH ----------------
  async function login(){
    setMsg("loginMsg","");
    try{
      const role = $("loginRole").value;
      const username = $("loginUser").value.trim();
      const password = $("loginPass").value;

      const r = await api("auth.login", { role, username, password });
      TOKEN = r.token;
      USER = r.user;
      WORKS = r.works || [];
      CATEGORIAS = r.categorias || [];
      brand = r.brand || brand;

      applyBrand();

      $("pillUser").textContent = `${USER.role} • ${USER.username}`;
      $("pillUser").classList.remove("hidden");
      $("btnLogout").classList.remove("hidden");

      // forced password change
      if(USER.primeiro_acesso){
        $("loginArea").classList.add("hidden");
        $("pwArea").classList.remove("hidden");
        return;
      }

      await initApp();
    } catch(e){
      setMsg("loginMsg", e.message || String(e));
    }
  }

  async function changePassword(){
    setMsg("pwMsg","");
    try{
      const p1 = $("pw1").value;
      const p2 = $("pw2").value;
      if(!p1 || p1.length < 4) throw new Error("Senha muito curta (mín. 4).");
      if(p1 !== p2) throw new Error("As senhas não conferem.");

      await api("auth.changePassword", { token: TOKEN, newPassword: p1 });

      // recarrega sessão
      const me = await api("auth.me", { token: TOKEN });
      USER = me.user;
      WORKS = me.works || WORKS;
      CATEGORIAS = me.categorias || CATEGORIAS;
      brand = me.brand || brand;
      applyBrand();

      $("pwArea").classList.add("hidden");
      await initApp();
    } catch(e){
      setMsg("pwMsg", e.message || String(e));
    }
  }

  async function logout(){
    try{ if(TOKEN) await api("auth.logout", { token: TOKEN }); } catch(_e){}
    location.reload();
  }

  // ---------------- INIT ----------------
  async function initApp(){
    const init = await api("app.init", { token: TOKEN });
    WORKS = init.works || WORKS;
    CATEGORIAS = init.categorias || CATEGORIAS;
    primaryObraId = init.primaryObraId || (WORKS[0]?.obra_id || "");
    currentObraId = primaryObraId;
    brand = init.brand || brand;
    applyBrand();

    fillWorks();
    fillCategories();
    setDefaultDate();

    $("fMes").value = currentMonth();

    $("loginArea").classList.add("hidden");
    $("pwArea").classList.add("hidden");
    $("appArea").classList.remove("hidden");

    // show admin button
    if(USER.role === "ADMIN") $("btnAdmin").classList.remove("hidden");
    else $("btnAdmin").classList.add("hidden");

    refreshAll();
  }

  function fillWorks(){
    const s = $("obraSelect");
    s.innerHTML = "";
    (WORKS||[]).forEach(w=>{
      const o = document.createElement("option");
      o.value = w.obra_id;
      o.textContent = w.obra_nome ? `${w.obra_id} — ${w.obra_nome}` : w.obra_id;
      s.appendChild(o);
    });
    if(currentObraId) s.value = currentObraId;
  }

  function onChangeObra(){
    currentObraId = $("obraSelect").value;
    refreshAll();
  }

  function fillCategories(){
    const s = $("inpCat");
    s.innerHTML = "";
    (CATEGORIAS||[]).forEach(c=>{
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      s.appendChild(o);
    });
  }

  // ---------------- RECEIPT UI ----------------
  function openPicker(){ $("notaFile").click(); }
  function openCamera(){ $("notaCam").click(); }

  function onNotaSelected(file){
    if(!file) return;
    notaSelectedFile = file;
    notaUploaded = { fileId:'', url:'' };

    $("notaArea").classList.remove("hidden");
    $("notaLink").classList.add("hidden");
    $("btnDeleteNota").classList.add("hidden");
    setMsg("notaMsg", "Foto selecionada. Ela será enviada ao registrar.", true);

    $("notaPreview").src = URL.createObjectURL(file);
  }

  async function compressImage(file){
    const bitmap = await createImageBitmap(file);
    const maxW = 1400;
    const scale = Math.min(1, maxW / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    return { base64: dataUrl.split(",")[1], mimeType:"image/jpeg", fileName:"nota.jpg" };
  }

  async function uploadNotaIfNeeded(){
    if(!notaSelectedFile) return { fileId:'', url:'' };
    if(notaUploaded.fileId) return notaUploaded;

    const compressed = await compressImage(notaSelectedFile);
    const res = await api("expense.uploadReceipt", { token: TOKEN, ...compressed });

    notaUploaded = { fileId: res.fileId, url: res.url };

    $("notaLink").href = res.url;
    $("notaLink").classList.remove("hidden");
    $("btnDeleteNota").classList.remove("hidden");
    setMsg("notaMsg","Nota enviada.", true);

    return notaUploaded;
  }

  async function deleteNota(){
    try{
      if(!notaUploaded.fileId){
        clearNota();
        setMsg("notaMsg","Seleção removida.", true);
        return;
      }
      await api("expense.deleteReceipt", { token: TOKEN, fileId: notaUploaded.fileId });
      clearNota();
      setMsg("notaMsg","Nota apagada.", true);
    } catch(e){
      setMsg("notaMsg", e.message || String(e));
    }
  }

  function clearNota(){
    $("notaFile").value = "";
    $("notaCam").value = "";
    notaSelectedFile = null;
    notaUploaded = { fileId:'', url:'' };
    $("notaArea").classList.add("hidden");
    $("notaPreview").src = "";
    $("notaLink").classList.add("hidden");
    $("btnDeleteNota").classList.add("hidden");
    setMsg("notaMsg","");
  }

  // ---------------- EXPENSE ----------------
  async function registerExpense(){
    setMsg("msg","");
    try{
      if(!currentObraId) throw new Error("Selecione uma obra.");

      const data = $("inpData").value;
      const categoria = $("inpCat").value;
      const detalhes = $("inpDet").value.trim();
      const valorTxt = $("inpVal").value.replace(/\./g,'').replace(',','.');
      const valor = Number(valorTxt);
      const reembolsavel = $("inpReemb").value;

      if(!data || !categoria || !detalhes || !(valor>0)){
        throw new Error("Preencha data, categoria, detalhes e valor corretamente.");
      }

      const nota = await uploadNotaIfNeeded();

      await api("expense.create", {
        token: TOKEN,
        payload: {
          obra_id: currentObraId,
          data, categoria, detalhes, valor,
          reembolsavel,
          nota_file_id: nota.fileId || "",
          nota_url: nota.url || ""
        }
      });

      $("inpDet").value = "";
      $("inpVal").value = "";
      $("inpReemb").value = "SIM";
      $("inpCat").selectedIndex = 0;
      setDefaultDate();
      clearNota();

      setMsg("msg","Registrado com sucesso.", true);
      refreshAll();
    } catch(e){
      setMsg("msg", e.message || String(e));
    }
  }

  // ---------------- DASH ----------------
  async function refreshAll(){
    try{
      const monthRef = $("fMes").value || currentMonth();
      if(!currentObraId) return;

      const sum = await api("dash.summary", { token: TOKEN, monthRef, obra_id: currentObraId });
      renderSummary(sum);

      const series = await api("dash.series", { token: TOKEN, monthRef, obra_id: currentObraId });
      renderLine(series);
    } catch(e){
      console.log(e);
    }
  }

  function renderSummary(sum){
    $("kTotal").textContent = brl(sum.totalGeral);
    $("kStatus").textContent = sum.isClosed ? "FECHADO" : "ABERTO";
    $("kTop").textContent = sum.maiorCategoria || "-";
    $("kBottom").textContent = sum.menorCategoria || "-";

    const tb = $("tbResumo");
    tb.innerHTML = "";
    let total = 0;

    (CATEGORIAS||[]).forEach(cat=>{
      const v = Number(sum.totals?.[cat]||0);
      total += v;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><b>${cat}</b></td><td>${brl(v)}</td>`;
      tb.appendChild(tr);
    });

    const trT = document.createElement("tr");
    trT.className = "totalRow";
    trT.innerHTML = `<td>TOTAL GERAL</td><td>${brl(total)}</td>`;
    tb.appendChild(trT);
  }

  function renderLine(series){
    const pts = series?.points || [];
    const labels = pts.map(p=>p.date);
    const values = pts.map(p=>Number(p.total||0));

    if(lineChart) lineChart.destroy();
    lineChart = new Chart(document.getElementById("chartLine"), {
      type:"line",
      data:{ labels, datasets:[{ data: values, tension:.25 }] },
      options:{ responsive:true, plugins:{ legend:{ display:false } } }
    });
  }

  // ---------------- PDF ----------------
  async function printPdf(){
    try{
      const monthRef = $("fMes").value || currentMonth();
      if(!currentObraId) throw new Error("Selecione uma obra.");
      const r = await api("report.pdf", { token: TOKEN, monthRef, obra_id: currentObraId });
      window.open(r.fileUrl, "_blank");
    } catch(e){
      alert(e.message || String(e));
    }
  }

  // ---------------- ADMIN UI ----------------
  function toggleAdmin(){
    $("adminArea").classList.toggle("hidden");
    adminTab("users");
  }

  async function adminTab(tab){
    setMsg("admMsg","");
    ["users","works","emails","logo","month"].forEach(t=>{
      $("adm_"+t).classList.add("hidden");
    });

    const el = $("adm_"+tab);
    el.classList.remove("hidden");

    try{
      if(tab==="users") await renderAdminUsers();
      if(tab==="works") await renderAdminWorks();
      if(tab==="emails") await renderAdminEmails();
      if(tab==="logo") await renderAdminLogo();
      if(tab==="month") await renderAdminMonth();
    } catch(e){
      setMsg("admMsg", e.message || String(e));
    }
  }

  async function renderAdminUsers(){
    const el = $("adm_users");
    const users = await api("admin.users.list", { token: TOKEN });

    el.innerHTML = `
      <div class="row">
        <div><input id="au_user" placeholder="username" /></div>
        <div><input id="au_nome" placeholder="nome" /></div>
      </div>
      <div class="row">
        <div>
          <select id="au_role">
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <div>
          <select id="au_ativo">
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary full" onclick="App.adminUserUpsert()">Criar/Atualizar usuário</button>
      <div class="divider"></div>
      <table>
        <thead><tr><th>Usuário</th><th>Nome</th><th>Role</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>
          ${users.map(u=>`
            <tr>
              <td>${u.username}</td>
              <td>${u.nome}</td>
              <td>${u.role}</td>
              <td>${u.ativo ? 'ATIVO':'INATIVO'}${u.primeiro_acesso?' • 1º acesso':''}</td>
              <td style="text-align:right;">
                <button class="btn btn-danger" onclick="App.adminResetPass('${u.username}')">Reset senha</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="muted small" style="margin-top:10px;">
        Reset de senha define novamente a senha padrão <b>user123</b> e obriga troca no próximo login.
      </div>
    `;
  }

  async function adminUserUpsert(){
    try{
      const username = document.getElementById("au_user").value.trim().toLowerCase();
      const nome = document.getElementById("au_nome").value.trim();
      const role = document.getElementById("au_role").value;
      const ativo = document.getElementById("au_ativo").value === "true";
      if(!username || !nome) throw new Error("Informe username e nome.");
      await api("admin.users.upsert", { token: TOKEN, user: { username, nome, role, ativo } });
      setMsg("admMsg","Usuário salvo.", true);
      await renderAdminUsers();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function adminResetPass(username){
    try{
      await api("admin.users.resetPassword", { token: TOKEN, username });
      setMsg("admMsg","Senha resetada para user123 e 1º acesso ativado.", true);
      await renderAdminUsers();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function renderAdminWorks(){
    const el = $("adm_works");
    const works = await api("admin.works.list", { token: TOKEN });
    const users = await api("admin.users.list", { token: TOKEN });

    el.innerHTML = `
      <div class="row">
        <div><input id="aw_id" placeholder="obra_id (ex: OBR001)" /></div>
        <div><input id="aw_nome" placeholder="nome da obra" /></div>
      </div>
      <div class="row">
        <div>
          <select id="aw_ativa">
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
        </div>
        <div><button class="btn btn-primary full" onclick="App.adminWorkUpsert()">Criar/Atualizar obra</button></div>
      </div>

      <div class="divider"></div>

      <h4 style="margin:0 0 8px 0;">Alocar usuário em obra</h4>
      <div class="row">
        <div>
          <select id="al_user">
            ${users.filter(u=>u.role==='USER').map(u=>`<option value="${u.username}">${u.username} — ${u.nome}</option>`).join('')}
          </select>
        </div>
        <div>
          <select id="al_obra">
            ${works.map(w=>`<option value="${w.obra_id}">${w.obra_id} — ${w.obra_nome}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row">
        <div>
          <select id="al_ativo">
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
        <div><button class="btn full" onclick="App.adminAllocSet()">Salvar alocação</button></div>
      </div>

      <div class="divider"></div>
      <table>
        <thead><tr><th>Obra</th><th>Nome</th></tr></thead>
        <tbody>${works.map(w=>`<tr><td>${w.obra_id}</td><td>${w.obra_nome}</td></tr>`).join('')}</tbody>
      </table>
    `;
  }

  async function adminWorkUpsert(){
    try{
      const obra_id = document.getElementById("aw_id").value.trim();
      const obra_nome = document.getElementById("aw_nome").value.trim();
      const ativa = document.getElementById("aw_ativa").value === "true";
      if(!obra_id || !obra_nome) throw new Error("Informe obra_id e nome.");
      await api("admin.works.upsert", { token: TOKEN, work: { obra_id, obra_nome, ativa } });
      setMsg("admMsg","Obra salva.", true);

      // refresh local works
      const init = await api("app.init", { token: TOKEN });
      WORKS = init.works || WORKS;
      fillWorks();

      await renderAdminWorks();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function adminAllocSet(){
    try{
      const username = document.getElementById("al_user").value;
      const obra_id = document.getElementById("al_obra").value;
      const ativo = document.getElementById("al_ativo").value === "true";
      await api("admin.alloc.set", { token: TOKEN, username, obra_id, ativo });
      setMsg("admMsg","Alocação salva.", true);
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function renderAdminEmails(){
    const el = $("adm_emails");
    const emails = await api("admin.emails.list", { token: TOKEN });
    el.innerHTML = `
      <div class="row">
        <div><input id="em_email" placeholder="email@empresa.com" /></div>
        <div>
          <select id="em_ativo">
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary full" onclick="App.adminEmailSet()">Salvar email</button>

      <div class="divider"></div>
      <table>
        <thead><tr><th>Email</th><th>Ativo</th></tr></thead>
        <tbody>
          ${emails.map(x=>`<tr><td>${x.email}</td><td style="text-align:right;">${x.ativo?'SIM':'NÃO'}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  async function adminEmailSet(){
    try{
      const email = document.getElementById("em_email").value.trim();
      const ativo = document.getElementById("em_ativo").value === "true";
      if(!email) throw new Error("Informe um email.");
      await api("admin.emails.set", { token: TOKEN, email, ativo });
      setMsg("admMsg","Email salvo.", true);
      await renderAdminEmails();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function renderAdminLogo(){
    const el = $("adm_logo");
    const cfg = await api("admin.config.get", { token: TOKEN });
    el.innerHTML = `
      <div class="muted small">
        Configure as pastas do Drive e envie a logo. A logo é opcional.
      </div>

      <label>Nome do sistema</label>
      <input id="cfg_name" value="${cfg.brand_name||''}" />

      <label>Cor principal</label>
      <input id="cfg_color" value="${cfg.brand_color||'#0b2a4a'}" />

      <label>ID pasta de notas (Drive)</label>
      <input id="cfg_receipts" value="${cfg.receipts_folder_id||''}" placeholder="ID da pasta CFO_NOTAS" />

      <label>ID pasta de logos (Drive)</label>
      <input id="cfg_logoFolder" value="${cfg.logo_folder_id||''}" placeholder="ID da pasta CFO_LOGOS" />

      <button class="btn btn-primary full" onclick="App.adminConfigSave()">Salvar config</button>

      <div class="divider"></div>

      <label>Enviar logo (PNG/JPG)</label>
      <input id="logoFile" type="file" accept="image/*" />
      <button class="btn full" onclick="App.adminUploadLogo()">Upload logo</button>

      <div class="muted small" style="margin-top:8px;">
        Logo atual: ${cfg.logo_url ? `<a href="${cfg.logo_url}" target="_blank">abrir</a>` : '— (vazio)'}
      </div>
    `;
  }

  async function adminConfigSave(){
    try{
      const brand_name = document.getElementById("cfg_name").value.trim();
      const brand_color = document.getElementById("cfg_color").value.trim();
      const receipts_folder_id = document.getElementById("cfg_receipts").value.trim();
      const logo_folder_id = document.getElementById("cfg_logoFolder").value.trim();

      await api("admin.config.set", {
        token: TOKEN,
        cfg: { brand_name, brand_color, receipts_folder_id, logo_folder_id }
      });

      setMsg("admMsg","Config salva.", true);

      // refresh brand in UI
      const me = await api("auth.me", { token: TOKEN });
      brand = me.brand || brand;
      applyBrand();

      await renderAdminLogo();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function adminUploadLogo(){
    try{
      const file = document.getElementById("logoFile").files?.[0];
      if(!file) throw new Error("Selecione um arquivo de logo.");

      const base64 = await fileToBase64(file);
      await api("admin.logo.upload", {
        token: TOKEN,
        base64,
        mimeType: file.type || "image/png",
        fileName: file.name || "logo.png"
      });

      setMsg("admMsg","Logo enviada.", true);

      const me = await api("auth.me", { token: TOKEN });
      brand = me.brand || brand;
      applyBrand();

      await renderAdminLogo();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function renderAdminMonth(){
    const el = $("adm_month");
    const m = $("fMes").value || currentMonth();
    el.innerHTML = `
      <div class="muted small">Use o mês selecionado no topo. Fechar mês envia emails e arquiva lançamentos.</div>
      <div class="row" style="margin-top:10px;">
        <div><button class="btn btn-primary full" onclick="App.adminCloseMonth()">Fechar mês (${m})</button></div>
        <div><button class="btn full" onclick="App.adminReopenMonth()">Reabrir mês (${m})</button></div>
      </div>
      <div class="muted small" style="margin-top:10px;">
        Dica: cadastre emails em "Emails" antes de fechar.
      </div>
    `;
  }

  async function adminCloseMonth(){
    try{
      const monthRef = $("fMes").value || currentMonth();
      await api("admin.monthClose", { token: TOKEN, monthRef });
      setMsg("admMsg","Mês fechado, emails enviados (se houver) e lançamentos arquivados.", true);
      refreshAll();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function adminReopenMonth(){
    try{
      const monthRef = $("fMes").value || currentMonth();
      await api("admin.monthReopen", { token: TOKEN, monthRef });
      setMsg("admMsg","Mês reaberto.", true);
      refreshAll();
    } catch(e){ setMsg("admMsg", e.message||String(e)); }
  }

  async function fileToBase64(file){
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for(let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  return {
    login, logout, togglePass, changePassword,
    openPicker, openCamera, onNotaSelected, deleteNota,
    registerExpense, refreshAll, onChangeObra, printPdf,
    toggleAdmin, adminTab, adminUserUpsert, adminResetPass,
    adminWorkUpsert, adminAllocSet, adminEmailSet,
    adminConfigSave, adminUploadLogo, adminCloseMonth, adminReopenMonth
  };

})();


