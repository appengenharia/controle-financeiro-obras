const API_URL = "https://script.google.com/macros/s/AKfycbwUBmnkEkUKJGfCoDcu547QNlqzpmjuyT-iLDshB1gJWYgRmi6fnPLiCJTWpBAzKSfjZw/exec";

const App = (() => {
    let TOKEN = "", USER = null, WORKS = [], CATEGORIAS = [];
    let currentObraId = "";
    let brand = { name: "Controle Financeiro de Obras", color: "#0b2a4a", logo_url: "" };
    let notaUploaded = { fileId: "", url: "" };
    let logoSelectedFile = null;
    let lineChart = null;

    function $(id) { return document.getElementById(id); }

    function setMsg(id, text, ok=false) {
        const el=$(id); if(!el) return;
        if(!text){el.className="msg";el.textContent="";return;}
        el.className="msg "+(ok?"ok":"err");
        el.textContent=text;
    }

    function brl(n){ return Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }

    function currentMonth(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

    function setDefaultDate(){
        const d=new Date(); const el=$("inpData");
        if(el) el.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }

    function togglePass(id){ const el=$(id); if(el) el.type=el.type==="password"?"text":"password"; }

    function applyBrand(){
        document.documentElement.style.setProperty("--brand",brand.color||"#0b2a4a");
        const t=$("brandTitle"); if(!t) return;
        t.innerHTML=brand.logo_url
        ?`<img src="${brand.logo_url}" alt="logo" style="height:28px;border-radius:4px;vertical-align:middle;margin-right:8px;">${brand.name||""}`
        :(brand.name||"Controle Financeiro de Obras");
    }

    function initOffline(){
        function upd(){ const b=$("offlineBanner"); if(b) b.classList.toggle("hidden",navigator.onLine); }
        window.addEventListener("online",upd);
        window.addEventListener("offline",upd);
        upd();
    }

    async function api(action, payload={}){
        const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload})});
        if(!res.ok) throw new Error("Erro na comunicação com servidor");
        const data=await res.json();
        if(!data.ok) throw new Error(data.error||"Erro desconhecido");
        return data.data;
    }

    async function login(){
        setMsg("loginMsg","");
        const btn=document.querySelector("#loginArea .btn-primary");
        if(btn){btn.disabled=true;btn.textContent="Entrando...";}
        try{
            const role=$("loginRole").value;
            const username=$("loginUser").value.trim();
            const password=$("loginPass").value;
            if(!username) throw new Error("Informe o usuário.");
            if(!password) throw new Error("Informe a senha.");
            const r=await api("auth.login",{role,username,password});
            TOKEN=r.token; USER=r.user; WORKS=r.works||[]; CATEGORIAS=r.categorias||[]; brand=r.brand||brand;
            applyBrand();
            $("pillUser").textContent=`${USER.role} • ${USER.username}`;
            $("pillUser").classList.remove("hidden");
            $("btnLogout").classList.remove("hidden");
            if(USER.primeiro_acesso){
                $("loginArea").classList.add("hidden");
                $("pwArea").classList.remove("hidden");
                return;
            }
            await initApp();
        }catch(e){ setMsg("loginMsg",e.message); }
        finally{ if(btn){btn.disabled=false;btn.textContent="Entrar";} }
    }

    async function changePassword(){
        setMsg("pwMsg","");
        try{
            const p1=$("pw1").value, p2=$("pw2").value;
            if(!p1||p1.length<4) throw new Error("Senha muito curta (mín. 4).");
            if(p1!==p2) throw new Error("As senhas não conferem.");
            await api("auth.changePassword",{token:TOKEN,newPassword:p1});
            $("pwArea").classList.add("hidden");
            await initApp();
        }catch(e){ setMsg("pwMsg",e.message); }
    }

    function logout(){
        if(TOKEN){ try{api("auth.logout",{token:TOKEN});}catch(_){} }
        location.reload();
    }

    async function initApp(){
        try{
            const r=await api("app.init",{token:TOKEN});
            WORKS=r.works||WORKS; CATEGORIAS=r.categorias||CATEGORIAS;
        }catch(_){}
        currentObraId=WORKS[0]?.obra_id||"";
        fillWorks(); fillCategories(); setDefaultDate();
        const fMes=$("fMes"); if(fMes) fMes.value=currentMonth();
        const mRef=$("monthRef"); if(mRef) mRef.value=currentMonth();
        $("loginArea").classList.add("hidden");
        $("appArea").classList.remove("hidden");
        if(USER.role==="ADMIN") $("tabBtnAdmin").classList.remove("hidden");
        mainTab("lancamentos");
        refreshAll();
    }

    function fillWorks(){
        const s=$("obraSelect"); if(!s) return; s.innerHTML="";
        WORKS.forEach(w=>{ const o=document.createElement("option"); o.value=w.obra_id; o.textContent=`${w.obra_id} — ${w.obra_nome}`; s.appendChild(o); });
        if(currentObraId) s.value=currentObraId;
    }

    function onChangeObra(){ currentObraId=$("obraSelect").value; refreshAll(); }

    function fillCategories(){
        const s=$("inpCat"); if(!s) return; s.innerHTML="";
        CATEGORIAS.forEach(c=>{ const o=document.createElement("option"); o.value=c; o.textContent=c; s.appendChild(o); });
    }

    function mainTab(tab){
        ["lancamentos","relatorios","admin"].forEach(t=>{ const el=$(`tab_${t}`); if(el) el.classList.add("hidden"); });
        $("tabBtnLanc").classList.remove("active");
        $("tabBtnRel").classList.remove("active");
        $("tabBtnAdmin").classList.remove("active");
        const p=$(`tab_${tab}`); if(p) p.classList.remove("hidden");
        const bm={lancamentos:"tabBtnLanc",relatorios:"tabBtnRel",admin:"tabBtnAdmin"};
        const b=$(bm[tab]); if(b) b.classList.add("active");
        if(tab==="relatorios") refreshAll();
        if(tab==="admin") adminTab("users");
    }

    async function registerExpense(){
        setMsg("msg","");
        const btn=document.querySelector("#tab_lancamentos .btn-primary");
        if(btn){btn.disabled=true;btn.textContent="Registrando...";}
        try{
            const rawVal=($("inpVal").value||"").replace(/\./g,"").replace(",",".");
            const valor=Number(rawVal);
            const payload={obra_id:currentObraId,categoria:$("inpCat").value,detalhes:$("inpDet").value.trim(),valor,data:$("inpData").value,reembolsavel:$("inpReemb").value,nota_file_id:notaUploaded.fileId||"",nota_url:notaUploaded.url||""};
            if(!payload.obra_id) throw new Error("Selecione uma obra.");
            if(!payload.detalhes) throw new Error("Preencha os detalhes.");
            if(!payload.valor||isNaN(payload.valor)) throw new Error("Informe um valor válido.");
            await api("expense.create",{token:TOKEN,payload});
            $("inpDet").value=""; $("inpVal").value=""; clearNota();
            setMsg("msg","✅ Registrado!",true);
            refreshAll();
        }catch(e){ setMsg("msg",e.message); }
        finally{ if(btn){btn.disabled=false;btn.textContent="Registrar";} }
    }

    function onNotaSelected(file){
        if(!file) return;
        const reader=new FileReader();
        reader.onload=e=>{ $("notaImg").src=e.target.result; $("notaPreviewArea").classList.remove("hidden"); };
        reader.readAsDataURL(file);
        notaUploaded={fileId:"",url:""};
    }

    function clearNota(){
        notaUploaded={fileId:"",url:""};
        const p=$("notaPreviewArea"); if(p) p.classList.add("hidden");
        const i=$("notaImg"); if(i) i.src="";
        const nf=$("notaFile"); if(nf) nf.value="";
        const nc=$("notaCam"); if(nc) nc.value="";
    }

    async function refreshAll(){
        try{
            const monthRef=$("fMes")?.value||currentMonth();
            const res=await api("dash.summary",{token:TOKEN,monthRef,obra_id:currentObraId});
            const kT=$("kTotal"); if(kT) kT.textContent=brl(res.totalGeral);
            const kS=$("kStatus"); if(kS) kS.textContent=res.isClosed?"🔒 FECHADO":"🟢 ABERTO";
            const kTo=$("kTop"); if(kTo) kTo.textContent=res.maiorCategoria||"-";
            const kB=$("kBottom"); if(kB) kB.textContent=res.menorCategoria||"-";
            const tb=$("tbResumo");
            if(tb){ tb.innerHTML=""; Object.entries(res.totals||{}).forEach(([cat,val])=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${cat}</td><td><strong>${brl(val)}</strong></td>`; tb.appendChild(tr); }); }
            const series=await api("dash.series",{token:TOKEN,monthRef,obra_id:currentObraId});
            renderLine(series);
        }catch(e){ console.error("refreshAll:",e.message); }
    }

    function renderLine(series){
        const pts=series.points||[];
        if(lineChart) lineChart.destroy();
        const canvas=$("chartLine"); if(!canvas) return;
        lineChart=new Chart(canvas,{type:"line",data:{labels:pts.map(p=>p.date),datasets:[{data:pts.map(p=>p.total),tension:0.3,borderColor:brand.color||"#0b2a4a",backgroundColor:"rgba(11,42,74,.08)",fill:true,pointRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
    }

    function printReport(){ window.print(); }

    async function adminTab(tab){
        setMsg("admMsg","");
        ["users","works","emails","logo","month"].forEach(t=>{ const p=$(`adm_${t}`); if(p) p.classList.add("hidden"); const b=$(`sadm_${t}`); if(b) b.classList.remove("active"); });
        const panel=$(`adm_${tab}`); if(panel) panel.classList.remove("hidden");
        const btn=$(`sadm_${tab}`); if(btn) btn.classList.add("active");
        if(tab==="users") await renderUsers();
        if(tab==="works") await renderWorks();
        if(tab==="emails") await renderEmails();
        if(tab==="logo") await loadConfig();
        if(tab==="month") await renderClosedMonths();
    }

    async function renderUsers(){
        try{
            const list=await api("admin.users.list",{token:TOKEN});
            const el=$("userList"); if(!el) return;
            el.innerHTML=list.map(u=>`<div class="listItem"><span class="liName">${u.username}</span><span style="color:var(--muted);font-size:.82rem">${u.nome||""}</span><span class="liBadge ${u.role==="ADMIN"?"admin":""}">${u.role}</span><div class="liActions"><button class="btn btn-sm btn-secondary" onclick="App.adminResetPass('${u.username}')">Reset</button></div></div>`).join("");
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function adminUserUpsert(){
        try{
            const user={username:$("au_user").value.trim(),nome:$("au_nome").value.trim(),role:$("au_role").value,email:$("au_email").value.trim(),ativo:true};
            if(!user.username) throw new Error("Informe o username.");
            await api("admin.users.upsert",{token:TOKEN,user});
            $("au_user").value="";$("au_nome").value="";$("au_email").value="";
            setMsg("admMsg","✅ Usuário salvo!",true);
            await renderUsers();
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function adminResetPass(username){
        try{ await api("admin.users.resetPassword",{token:TOKEN,username}); setMsg("admMsg",`✅ Senha de "${username}" resetada para user123`,true); }
        catch(e){ setMsg("admMsg",e.message); }
    }

    async function renderWorks(){
        try{
            const list=await api("admin.works.list",{token:TOKEN});
            const el=$("workList"); if(!el) return;
            el.innerHTML=list.map(w=>`<div class="listItem"><span class="liName">${w.obra_id}</span><span style="color:var(--muted);font-size:.82rem">${w.obra_nome}</span><span class="liBadge ${w.ativa?"":"admin"}">${w.ativa?"Ativa":"Inativa"}</span></div>`).join("");
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function adminWorkUpsert(){
        try{
            const work={obra_id:$("aw_id").value.trim(),obra_nome:$("aw_nome").value.trim(),ativa:$("aw_ativa").value==="true"};
            if(!work.obra_id||!work.obra_nome) throw new Error("Preencha ID e Nome.");
            await api("admin.works.upsert",{token:TOKEN,work});
            $("aw_id").value="";$("aw_nome").value="";
            setMsg("admMsg","✅ Obra salva!",true);
            await renderWorks();
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function renderEmails(){
        try{
            const list=await api("admin.emails.list",{token:TOKEN});
            const el=$("emailList"); if(!el) return;
            el.innerHTML=list.map(e=>`<div class="listItem"><span class="liName">${e.email}</span><span style="color:var(--muted);font-size:.82rem">${e.nome||""}</span><div class="liActions"><button class="btn btn-sm btn-danger" onclick="App.adminEmailRemove('${e.email}')">Remover</button></div></div>`).join("");
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function adminEmailUpsert(){
        try{
            const email=$("ae_email").value.trim(), nome=$("ae_nome").value.trim();
            if(!email) throw new Error("Informe o email.");
            await api("admin.emails.upsert",{token:TOKEN,entry:{email,nome}});
            $("ae_email").value="";$("ae_nome").value="";
            setMsg("admMsg","✅ Email adicionado!",true);
            await renderEmails();
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function adminEmailRemove(email){
        try{ await api("admin.emails.remove",{token:TOKEN,email}); setMsg("admMsg","✅ Removido!",true); await renderEmails(); }
        catch(e){ setMsg("admMsg",e.message); }
    }

    async function sendMonthReport(){
        setMsg("emailMsg","");
        const btn=document.querySelector("#adm_emails .btn-secondary");
        if(btn){btn.disabled=true;btn.textContent="Enviando...";}
        try{
            const monthRef=$("fMes")?.value||currentMonth();
            await api("admin.emails.sendReport",{token:TOKEN,monthRef});
            setMsg("emailMsg","✅ Relatório enviado!",true);
        }catch(e){ setMsg("emailMsg",e.message); }
        finally{ if(btn){btn.disabled=false;btn.textContent="📧 Enviar relatório do mês agora";} }
    }

    async function loadConfig(){
        try{
            const cfg=await api("admin.config.get",{token:TOKEN});
            const n=$("cfgName"); if(n) n.value=cfg.name||brand.name||"";
            const c=$("cfgColor"); if(c) c.value=cfg.color||brand.color||"#0b2a4a";
            const h=$("cfgColorHex"); if(h) h.textContent=cfg.color||brand.color||"#0b2a4a";
            const ca=$("cfgCats"); if(ca) ca.value=(cfg.categorias||CATEGORIAS).join("
");
            if(cfg.logo_url){ const img=$("logoPreview"); if(img){img.src=cfg.logo_url;img.classList.remove("hidden");} const none=$("logoNone"); if(none) none.classList.add("hidden"); }
        }catch(e){ setMsg("cfgMsg",e.message); }
    }

    function onLogoSelected(file){
        if(!file) return; logoSelectedFile=file;
        const reader=new FileReader();
        reader.onload=e=>{ const img=$("logoPreview"); if(img){img.src=e.target.result;img.classList.remove("hidden");} const none=$("logoNone"); if(none) none.classList.add("hidden"); };
        reader.readAsDataURL(file);
    }

    function toBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); }); }

    async function saveConfig(){
        setMsg("cfgMsg","");
        const btn=document.querySelector("#adm_logo .btn-primary");
        if(btn){btn.disabled=true;btn.textContent="Salvando...";}
        try{
            const name=$("cfgName").value.trim();
            const color=$("cfgColor").value;
            const categorias=$("cfgCats").value.split("
").map(c=>c.trim()).filter(Boolean);
            let logo_url=brand.logo_url||"";
            if(logoSelectedFile){ const b64=await toBase64(logoSelectedFile); const up=await api("admin.config.uploadLogo",{token:TOKEN,base64:b64,mimeType:logoSelectedFile.type}); logo_url=up.url||""; }
            await api("admin.config.save",{token:TOKEN,config:{name,color,categorias,logo_url}});
            brand={...brand,name,color,logo_url}; CATEGORIAS=categorias; applyBrand(); fillCategories();
            setMsg("cfgMsg","✅ Configurações salvas!",true);
        }catch(e){ setMsg("cfgMsg",e.message); }
        finally{ if(btn){btn.disabled=false;btn.textContent="Salvar configurações";} }
    }

    async function renderClosedMonths(){
        try{
            const list=await api("admin.months.list",{token:TOKEN});
            const el=$("closedList"); if(!el) return;
            if(!list.length){el.innerHTML='<p class="muted small">Nenhum mês fechado.</p>';return;}
            el.innerHTML=list.map(m=>`<div class="listItem"><span class="liName">${m.monthRef}</span><span class="liBadge admin">FECHADO</span><span style="color:var(--muted);font-size:.78rem">${m.closedAt?new Date(m.closedAt).toLocaleDateString("pt-BR"):""}</span></div>`).join("");
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function closeMonth(){
        try{
            const ref=$("monthRef").value; if(!ref) throw new Error("Selecione o mês.");
            await api("admin.months.close",{token:TOKEN,monthRef:ref});
            setMsg("admMsg",`✅ Mês ${ref} fechado!`,true);
            await renderClosedMonths();
        }catch(e){ setMsg("admMsg",e.message); }
    }

    async function reopenMonth(){
        try{
            const ref=$("monthRef").value; if(!ref) throw new Error("Selecione o mês.");
            await api("admin.months.reopen",{token:TOKEN,monthRef:ref});
            setMsg("admMsg",`✅ Mês ${ref} reaberto!`,true);
            await renderClosedMonths();
        }catch(e){ setMsg("admMsg",e.message); }
    }

    document.addEventListener("DOMContentLoaded",()=>{ initOffline(); applyBrand(); });

    return {
        login, logout, togglePass, changePassword,
        mainTab, onChangeObra,
        registerExpense, refreshAll, printReport,
        onNotaSelected, clearNota,
        adminTab,
        adminUserUpsert, adminResetPass,
        adminWorkUpsert,
        adminEmailUpsert, adminEmailRemove, sendMonthReport,
        onLogoSelected, saveConfig,
        closeMonth, reopenMonth
    };
})();
