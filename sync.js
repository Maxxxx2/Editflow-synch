/* EditFlow — offline-first cloud synchronization
 * Requires window.EDITFLOW_SUPABASE from supabase-config.js.
 * Uses the existing localStorage as the primary/offline cache.
 */
(function(){
    const cfg = window.EDITFLOW_SUPABASE || {};
    const configured = cfg.url && cfg.key &&
        !cfg.url.includes("YOUR_SUPABASE") &&
        !cfg.key.includes("YOUR_SUPABASE");

    let supabase = null;
    let syncTimer = null;
    let syncing = false;
    let bootstrapped = false;
    let suppressSaveSync = false;
    const META_KEY = "editflow_sync_meta";

    const getMeta = () => {
        try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
        catch { return {}; }
    };

    const setMeta = meta => localStorage.setItem(META_KEY, JSON.stringify(meta));

    function setStatus(text, state){
        const el = document.getElementById("syncStatus");
        if(!el) return;
        el.textContent = text;
        el.className = "sync-status " + (state || "neutral");
        el.title = text;
    }

    function showSyncPanel(){
        const panel = document.getElementById("syncPanel");
        if(panel) panel.style.display = "flex";
        updateAuthUI();
    }
    window.showSyncPanel = showSyncPanel;

    function hideSyncPanel(){
        const panel = document.getElementById("syncPanel");
        if(panel) panel.style.display = "none";
    }
    window.hideSyncPanel = hideSyncPanel;

    function escapeText(value){
        return String(value || "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    }

    async function updateAuthUI(){
        const emailEl = document.getElementById("syncEmail");
        const loginEl = document.getElementById("syncLoginForm");
        const accountEl = document.getElementById("syncAccount");
        const emailText = document.getElementById("syncAccountEmail");
        const syncBtn = document.getElementById("syncNowBtn");
        if(!configured){
            setStatus("Cloud non configuré", "neutral");
            if(loginEl) loginEl.style.display = "block";
            if(accountEl) accountEl.style.display = "none";
            return;
        }
        if(!supabase) return;
        const { data } = await supabase.auth.getSession();
        const user = data && data.session ? data.session.user : null;
        if(user){
            if(loginEl) loginEl.style.display = "none";
            if(accountEl) accountEl.style.display = "block";
            if(emailText) emailText.textContent = escapeText(user.email || "Compte EditFlow");
            if(syncBtn) syncBtn.disabled = false;
            setStatus(navigator.onLine ? "Synchronisé" : "Hors connexion", navigator.onLine ? "ok" : "offline");
        }else{
            if(loginEl) loginEl.style.display = "block";
            if(accountEl) accountEl.style.display = "none";
            if(syncBtn) syncBtn.disabled = true;
            setStatus("Non connecté", "neutral");
        }
    }

    async function signIn(){
        if(!configured){
            alert("Configure d'abord supabase-config.js avec l'URL et la clé de ton projet Supabase.");
            return;
        }
        const input = document.getElementById("syncEmail");
        const email = (input && input.value || "").trim();
        if(!email){ alert("Entre ton adresse email."); return; }
        const button = document.getElementById("syncLoginBtn");
        if(button) button.disabled = true;
        try{
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: window.location.origin + window.location.pathname }
            });
            if(error) throw error;
            alert("Lien de connexion envoyé. Ouvre l'email sur cet appareil pour te connecter à EditFlow.");
        }catch(error){
            console.error(error);
            alert("Impossible d'envoyer le lien : " + error.message);
        }finally{
            if(button) button.disabled = false;
        }
    }
    window.editFlowSignIn = signIn;

    async function signOut(){
        if(!supabase) return;
        await supabase.auth.signOut();
        setStatus("Non connecté", "neutral");
        updateAuthUI();
    }
    window.editFlowSignOut = signOut;

    async function getUser(){
        if(!supabase) return null;
        const { data } = await supabase.auth.getUser();
        return data && data.user ? data.user : null;
    }

    async function pushLocal(){
        if(!configured || !supabase || !navigator.onLine || syncing) return false;
        const user = await getUser();
        if(!user) return false;
        const meta = getMeta();
        if(!meta.dirty) return true;
        syncing = true;
        setStatus("Synchronisation…", "busy");
        try{
            const localOrders = JSON.parse(localStorage.getItem("editflow_orders") || "[]");
            const localUpdatedAt = meta.localUpdatedAt || new Date().toISOString();
            const { error } = await supabase
                .from("editflow_data")
                .upsert({
                    user_id: user.id,
                    orders: localOrders,
                    updated_at: localUpdatedAt
                }, { onConflict: "user_id" });
            if(error) throw error;
            setMeta({
                dirty:false,
                localUpdatedAt,
                lastSyncedAt:localUpdatedAt
            });
            setStatus("Synchronisé", "ok");
            return true;
        }catch(error){
            console.error("EditFlow sync upload:", error);
            setStatus("Hors connexion — local sauvegardé", "offline");
            return false;
        }finally{
            syncing = false;
        }
    }

    async function pullRemote(){
        if(!configured || !supabase || !navigator.onLine || syncing) return false;
        const user = await getUser();
        if(!user) return false;
        syncing = true;
        setStatus("Vérification du cloud…", "busy");
        try{
            const { data, error } = await supabase
                .from("editflow_data")
                .select("orders,updated_at")
                .eq("user_id", user.id)
                .maybeSingle();
            if(error) throw error;
            const meta = getMeta();

            if(!data){
                // First device: publish existing local data if there is any.
                const localOrders = JSON.parse(localStorage.getItem("editflow_orders") || "[]");
                if(localOrders.length){
                    const localUpdatedAt = meta.localUpdatedAt || new Date().toISOString();
                    setMeta({dirty:true, localUpdatedAt, lastSyncedAt:null});
                    syncing = false;
                    return pushLocal();
                }
                setMeta({dirty:false, localUpdatedAt:null, lastSyncedAt:null});
                setStatus("Synchronisé", "ok");
                return true;
            }

            const remoteTime = new Date(data.updated_at).getTime();
            const localTime = meta.localUpdatedAt ? new Date(meta.localUpdatedAt).getTime() : 0;

            if(meta.dirty && localTime >= remoteTime){
                // Local offline edits are newer: keep them and upload.
                syncing = false;
                return pushLocal();
            }

            // Remote is newer, or this device has never synced: hydrate localStorage.
            suppressSaveSync = true;
            localStorage.setItem("editflow_orders", JSON.stringify(data.orders || []));
            suppressSaveSync = false;
            setMeta({
                dirty:false,
                localUpdatedAt:data.updated_at,
                lastSyncedAt:data.updated_at
            });
            if(typeof renderDashboard === "function") renderDashboard();
            if(typeof currentOrderId !== "undefined" && currentOrderId !== null && typeof renderProject === "function") renderProject();
            setStatus("Synchronisé", "ok");
            return true;
        }catch(error){
            console.error("EditFlow sync download:", error);
            setStatus("Hors connexion — local conservé", "offline");
            return false;
        }finally{
            syncing = false;
        }
    }

    async function syncNow(){
        if(!configured){ showSyncPanel(); return; }
        if(!navigator.onLine){ setStatus("Hors connexion — local conservé", "offline"); return; }
        const user = await getUser();
        if(!user){ showSyncPanel(); return; }
        const meta = getMeta();
        if(meta.dirty) await pushLocal();
        else await pullRemote();
    }
    window.editFlowSyncNow = syncNow;

    function schedulePush(){
        if(suppressSaveSync) return;
        const meta = getMeta();
        meta.dirty = true;
        meta.localUpdatedAt = new Date().toISOString();
        setMeta(meta);
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => pushLocal(), 700);
        setStatus(navigator.onLine ? "Modification locale…" : "Hors connexion — local sauvegardé", navigator.onLine ? "busy" : "offline");
    }

    function installSaveHook(){
        if(typeof window.saveOrders !== "function" || window.saveOrders.__editflowSyncHooked) return;
        const original = window.saveOrders;
        const wrapped = function(){
            const result = original.apply(this, arguments);
            schedulePush();
            return result;
        };
        wrapped.__editflowSyncHooked = true;
        window.saveOrders = wrapped;
    }

    async function bootstrap(){
        installSaveHook();
        if(!configured){ updateAuthUI(); return; }
        try{
            const { createClient } = window.supabase;
            supabase = createClient(cfg.url, cfg.key, {
                auth:{
                    persistSession:true,
                    autoRefreshToken:true,
                    detectSessionInUrl:true
                }
            });
            supabase.auth.onAuthStateChange(function(){
                updateAuthUI();
                setTimeout(() => pullRemote(), 0);
            });
            await updateAuthUI();
            bootstrapped = true;
            await pullRemote();
            setInterval(() => {
                if(document.visibilityState === "visible") pullRemote();
            }, 30000);
        }catch(error){
            console.error("EditFlow Supabase init:", error);
            setStatus("Cloud indisponible — mode local", "offline");
        }
    }

    window.addEventListener("online", function(){
        updateAuthUI();
        if(bootstrapped) syncNow();
    });
    window.addEventListener("offline", function(){
        setStatus("Hors connexion — local sauvegardé", "offline");
    });
    document.addEventListener("visibilitychange", function(){
        if(document.visibilityState === "visible" && bootstrapped) syncNow();
    });

    // supabase-js is loaded before this file.
    if(window.supabase) bootstrap();
    else window.addEventListener("supabase-ready", bootstrap, {once:true});
})();
