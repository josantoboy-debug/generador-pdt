(() => {
  'use strict';

  const APP_NAME = 'generador-pdt';
  const API_URL = 'https://yvlayxmhcngdqribcmkh.supabase.co';
  const API_KEY = 'sb_publishable_9XPD5yoq2N1CQCnYt3D7Fg_IGQrZbJN';
  const SESSION_KEY = 'generadorPDT.cloudOperatorSession.v1';
  const CACHE_KEY = 'generadorPDT.cloudOperatorCache.v1';
  const REQUEST_TIMEOUT = 8000;

  let currentOperator = null;
  let operators = [];
  let bootstrapped = null;
  let onlineAvailable = true;
  let busy = false;

  const $ = (selector, root = document) => root.querySelector(selector);

  function safeJSON(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function normalizeName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  function normalizeBootstrapCode(value) {
    return String(value ?? '').trim().toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getSession() {
    return safeJSON(sessionStorage.getItem(SESSION_KEY), null);
  }

  function setSession(value) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getCache() {
    const cache = safeJSON(localStorage.getItem(CACHE_KEY), null);
    return cache && Array.isArray(cache.operators) ? cache : {version: 1, operators: []};
  }

  function setCache(cache) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }

  async function hashPin(operatorId, pin) {
    const payload = new TextEncoder().encode(`${operatorId}|${String(pin)}`);
    const digest = await crypto.subtle.digest('SHA-256', payload);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function rpc(name, payload = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {apikey: API_KEY, 'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) throw new Error(data?.message || data?.hint || `HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function messageFor(code) {
    return ({
      INVALID_PIN: 'PIN incorrecto.',
      INVALID_PIN_FORMAT: 'El PIN debe contener entre 4 y 8 dígitos.',
      OPERATOR_UNAVAILABLE: 'El operador no está disponible.',
      CREDENTIALS_MISSING: 'El operador no tiene credenciales configuradas.',
      LOCKED: 'Acceso bloqueado temporalmente por intentos fallidos.',
      NAME_EXISTS: 'Ya existe un operador con ese nombre.',
      INVALID_INPUT: 'Revisa los datos ingresados.',
      FORBIDDEN: 'Se requiere autorización de administrador.',
      INVALID_SESSION: 'La sesión ya no es válida.',
      INVALID_BOOTSTRAP_CODE: 'Código de activación incorrecto.',
      BOOTSTRAP_CODE_REQUIRED: 'Ingresa el código de activación inicial.',
      BOOTSTRAP_UNAVAILABLE: 'La activación inicial ya no está disponible.',
      ALREADY_BOOTSTRAPPED: 'El sistema ya tiene un administrador configurado.'
    })[code] || 'No se pudo completar la operación.';
  }

  async function cacheCredential(operator, pin = null) {
    if (!operator?.id) return;
    const cache = getCache();
    const previous = cache.operators.find(item => item.id === operator.id) || {};
    const next = {
      ...previous,
      id: operator.id,
      name: operator.name,
      role: operator.role || previous.role || 'operator',
      active: operator.active !== false,
      updatedAt: new Date().toISOString()
    };
    if (pin) next.pinHash = await hashPin(operator.id, pin);
    cache.operators = cache.operators.filter(item => item.id !== operator.id);
    cache.operators.push(next);
    setCache(cache);
  }

  function mergeOperators(remote) {
    const cache = getCache();
    const byId = new Map(cache.operators.map(item => [item.id, item]));
    remote.forEach(operator => {
      const previous = byId.get(operator.id) || {};
      byId.set(operator.id, {...previous, ...operator, active: operator.active !== false});
    });
    cache.operators = [...byId.values()];
    setCache(cache);
  }

  function injectStyles() {
    if ($('#pdtCloudAuthStyles')) return;
    const style = document.createElement('style');
    style.id = 'pdtCloudAuthStyles';
    style.textContent = `
      .pdt-auth-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(4,8,15,.82);backdrop-filter:blur(9px)}
      .pdt-auth-card{width:min(430px,94vw);max-height:92vh;overflow:auto;padding:23px;border-radius:18px;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#dfe3e8);box-shadow:0 30px 90px rgba(0,0,0,.45)}
      .pdt-auth-card h2{margin:0 0 5px;font-size:21px}.pdt-auth-card>p{margin:0 0 17px;color:var(--muted,#6c757d);font-size:12px;line-height:1.5}
      .pdt-auth-card label{display:grid;gap:6px;margin:11px 0;font-size:12px;font-weight:750}.pdt-auth-card input,.pdt-auth-card select{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--border,#dfe3e8);background:var(--surface,#fff);color:var(--text,#222);font:inherit}
      .pdt-auth-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.pdt-auth-actions button{width:100%;margin:0}.pdt-auth-error{min-height:18px;margin-top:7px;color:#dc3545;font-size:11px}.pdt-auth-note{margin-top:13px!important;font-size:10px!important}.pdt-auth-hidden{display:none!important}
      .pdt-operator-chip{position:fixed;right:12px;bottom:12px;z-index:1400;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#dfe3e8);box-shadow:0 8px 24px rgba(0,0,0,.16);font-size:11px}.pdt-operator-chip strong{display:block}.pdt-operator-chip button{width:auto;margin:0;padding:5px 8px;font-size:10px}
      @media(max-width:600px){.pdt-auth-actions{grid-template-columns:1fr}.pdt-operator-chip{left:10px;right:10px;bottom:10px;justify-content:space-between}}
      @media print{.pdt-auth-overlay,.pdt-operator-chip{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function setAppLocked(locked) {
    const shell = $('.app-shell');
    if (shell) {
      shell.inert = !!locked;
      if (locked) shell.setAttribute('aria-hidden', 'true');
      else shell.removeAttribute('aria-hidden');
    }
  }

  function createOverlay() {
    if ($('#pdtAuthOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pdtAuthOverlay';
    overlay.className = 'pdt-auth-overlay';
    overlay.innerHTML = `
      <section class="pdt-auth-card" role="dialog" aria-modal="true" aria-labelledby="pdtAuthTitle">
        <h2 id="pdtAuthTitle">Acceso de operador</h2>
        <p>Generador PDT · cuenta central compartida con Match de Equipos.</p>
        <div id="pdtAuthLogin">
          <label>Operador<select id="pdtAuthOperator"></select></label>
          <label>PIN<input id="pdtAuthPin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" placeholder="4 a 8 dígitos"></label>
          <div id="pdtAuthLoginError" class="pdt-auth-error" aria-live="polite"></div>
          <div class="pdt-auth-actions"><button id="pdtAuthNew" type="button">Nuevo operador</button><button id="pdtAuthEnter" type="button">INICIAR SESIÓN</button></div>
        </div>
        <div id="pdtAuthCreate" class="pdt-auth-hidden">
          <label>Nombre del operador<input id="pdtAuthCreateName" maxlength="60" autocomplete="off"></label>
          <label>Crear PIN<input id="pdtAuthCreatePin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
          <label>Confirmar PIN<input id="pdtAuthCreatePin2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
          <div id="pdtAuthBootstrapFields" class="pdt-auth-hidden">
            <label>Código de activación inicial<input id="pdtAuthBootstrapCode" type="text" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Código de activación"></label>
            <p style="margin:4px 0 8px;font-size:10px;color:var(--muted,#6c757d)">Solo se solicita una vez al crear el primer administrador.</p>
          </div>
          <div id="pdtAuthAdminFields" class="pdt-auth-hidden">
            <p style="margin:12px 0 4px;font-size:10px;color:var(--muted,#6c757d)">Autoriza la creación con una cuenta administradora.</p>
            <label>Administrador<select id="pdtAuthAdmin"></select></label>
            <label>PIN del administrador<input id="pdtAuthAdminPin" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password"></label>
          </div>
          <div id="pdtAuthCreateError" class="pdt-auth-error" aria-live="polite"></div>
          <div class="pdt-auth-actions"><button id="pdtAuthBack" type="button">Volver</button><button id="pdtAuthCreateBtn" type="button">CREAR E INGRESAR</button></div>
        </div>
        <p id="pdtAuthNote" class="pdt-auth-note">Conectando con Supabase…</p>
      </section>`;
    document.body.appendChild(overlay);

    $('#pdtAuthEnter').addEventListener('click', handleLogin);
    $('#pdtAuthNew').addEventListener('click', () => showCreate(true));
    $('#pdtAuthBack').addEventListener('click', () => showCreate(false));
    $('#pdtAuthCreateBtn').addEventListener('click', handleCreate);
    $('#pdtAuthPin').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); handleLogin(); } });
    $('#pdtAuthCreatePin2').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); handleCreate(); } });
  }

  function showCreate(show) {
    $('#pdtAuthLogin')?.classList.toggle('pdt-auth-hidden', show);
    $('#pdtAuthCreate')?.classList.toggle('pdt-auth-hidden', !show);
    $('#pdtAuthLoginError') && ($('#pdtAuthLoginError').textContent = '');
    $('#pdtAuthCreateError') && ($('#pdtAuthCreateError').textContent = '');
    setTimeout(() => (show ? $('#pdtAuthCreateName') : $('#pdtAuthPin'))?.focus(), 0);
  }

  function setBusy(value) {
    busy = !!value;
    ['#pdtAuthEnter', '#pdtAuthCreateBtn', '#pdtAuthNew'].forEach(selector => {
      const button = $(selector);
      if (button) button.disabled = busy;
    });
  }

  function renderOperators() {
    const select = $('#pdtAuthOperator');
    if (!select) return;
    const source = operators.length ? operators : getCache().operators.filter(item => item.active !== false);
    select.innerHTML = source.length
      ? source.slice().sort((a,b) => String(a.name).localeCompare(String(b.name), 'es')).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${item.role === 'admin' ? ' · Admin' : ''}</option>`).join('')
      : '<option value="">No hay operadores creados</option>';
    $('#pdtAuthEnter').disabled = !source.length;

    const admins = operators.filter(item => item.role === 'admin' && item.active !== false);
    const adminSelect = $('#pdtAuthAdmin');
    if (adminSelect) adminSelect.innerHTML = admins.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    $('#pdtAuthAdminFields')?.classList.toggle('pdt-auth-hidden', bootstrapped !== true);
    $('#pdtAuthBootstrapFields')?.classList.toggle('pdt-auth-hidden', bootstrapped !== false);

    if (bootstrapped === false && !source.length) showCreate(true);
  }

  function setNote(text) {
    const note = $('#pdtAuthNote');
    if (note) note.textContent = text;
  }

  async function loadOperators() {
    try {
      const result = await rpc('core_list_operators_service', {p_app_name: APP_NAME});
      if (!result?.ok) throw new Error(result?.code || 'LIST_FAILED');
      onlineAvailable = true;
      bootstrapped = !!result.bootstrapped;
      operators = Array.isArray(result.operators) ? result.operators : [];
      mergeOperators(operators);
      setNote('Operadores y PIN validados centralmente en Supabase.');
    } catch (error) {
      console.warn('[PDT CloudAuth] Supabase no disponible:', error);
      onlineAvailable = false;
      bootstrapped = null;
      operators = [];
      setNote('Sin conexión: solo disponible para operadores ya autenticados antes en este dispositivo.');
    }
    renderOperators();
  }

  async function loginRemote(id, pin, appName = APP_NAME) {
    const result = await rpc('core_operator_login_service', {
      p_operator_id: id,
      p_pin: pin,
      p_app_name: appName,
      p_device_info: {userAgent: navigator.userAgent.slice(0, 280), platform: navigator.platform || '', language: navigator.language || ''}
    });
    if (!result?.ok) {
      const error = new Error(messageFor(result?.code));
      error.code = result?.code;
      throw error;
    }
    return result;
  }

  function installChip() {
    if (!currentOperator) return;
    let chip = $('#pdtOperatorChip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'pdtOperatorChip';
      chip.className = 'pdt-operator-chip';
      document.body.appendChild(chip);
    }
    chip.innerHTML = `<span>Operador <strong>${escapeHtml(currentOperator.name)}</strong></span><button id="pdtLogoutBtn" type="button">Cerrar sesión</button>`;
    $('#pdtLogoutBtn')?.addEventListener('click', logout);
  }

  function unlock(operator, session) {
    currentOperator = operator;
    if (session) setSession(session);
    setAppLocked(false);
    $('#pdtAuthOverlay')?.remove();
    installChip();
    document.documentElement.dataset.operator = operator.id;
    document.dispatchEvent(new CustomEvent('operator:login', {detail:{id: operator.id, name: operator.name, role: operator.role || 'operator'}}));
    setTimeout(() => document.querySelector('[autofocus],#text-sn')?.focus(), 0);
  }

  async function finishRemoteLogin(result, pin) {
    await cacheCredential(result.operator, pin);
    unlock(result.operator, {token: result.token, expiresAt: result.expires_at, operator: result.operator, offline: false, savedAt: new Date().toISOString()});
  }

  async function tryOfflineLogin(id, pin) {
    const cached = getCache().operators.find(item => item.id === id);
    if (!cached?.pinHash) return false;
    const hash = await hashPin(id, pin);
    if (hash !== cached.pinHash) return false;
    unlock(cached, {operator: cached, offline: true, savedAt: new Date().toISOString()});
    return true;
  }

  async function handleLogin() {
    if (busy) return;
    const id = $('#pdtAuthOperator')?.value;
    const pin = String($('#pdtAuthPin')?.value || '');
    const error = $('#pdtAuthLoginError');
    if (error) error.textContent = '';
    if (!id) return error && (error.textContent = 'Selecciona un operador.');
    if (!/^\d{4,8}$/.test(pin)) return error && (error.textContent = 'Ingresa un PIN de 4 a 8 dígitos.');

    setBusy(true);
    try {
      if (onlineAvailable && operators.some(item => item.id === id)) {
        const result = await loginRemote(id, pin, APP_NAME);
        await finishRemoteLogin(result, pin);
        return;
      }
      if (await tryOfflineLogin(id, pin)) return;
      if (error) error.textContent = onlineAvailable ? 'El operador no está en el registro central.' : 'No existe credencial offline válida para este operador.';
    } catch (err) {
      if (error) error.textContent = err?.message || 'No se pudo iniciar sesión.';
      $('#pdtAuthPin')?.select();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (busy) return;
    const name = normalizeName($('#pdtAuthCreateName')?.value);
    const pin = String($('#pdtAuthCreatePin')?.value || '');
    const pin2 = String($('#pdtAuthCreatePin2')?.value || '');
    const error = $('#pdtAuthCreateError');
    if (error) error.textContent = '';
    if (!name) return error && (error.textContent = 'Escribe el nombre del operador.');
    if (!/^\d{4,8}$/.test(pin)) return error && (error.textContent = 'El PIN debe tener entre 4 y 8 dígitos.');
    if (pin !== pin2) return error && (error.textContent = 'Los PIN no coinciden.');
    if (!onlineAvailable) return error && (error.textContent = 'Se necesita conexión para crear operadores.');

    setBusy(true);
    let adminToken = null;
    try {
      if (bootstrapped === false) {
        const bootstrapCode = normalizeBootstrapCode($('#pdtAuthBootstrapCode')?.value);
        if (!bootstrapCode) throw new Error('Ingresa el código de activación inicial.');
        const created = await rpc('core_bootstrap_admin_service_v2', {
          p_name: name,
          p_pin: pin,
          p_bootstrap_code: bootstrapCode
        });
        if (!created?.ok) throw new Error(messageFor(created?.code));
        const login = await loginRemote(created.operator.id, pin, APP_NAME);
        await finishRemoteLogin(login, pin);
        return;
      }

      const adminId = $('#pdtAuthAdmin')?.value;
      const adminPin = String($('#pdtAuthAdminPin')?.value || '');
      if (!adminId || !/^\d{4,8}$/.test(adminPin)) throw new Error('Selecciona un administrador e ingresa su PIN.');
      const adminLogin = await loginRemote(adminId, adminPin, 'admin');
      if (adminLogin.operator?.role !== 'admin') throw new Error('La cuenta no tiene rol administrador.');
      adminToken = adminLogin.token;
      const created = await rpc('core_admin_create_operator_service', {p_token: adminToken, p_name: name, p_pin: pin, p_role: 'operator'});
      if (!created?.ok) throw new Error(messageFor(created?.code));
      try { await rpc('core_logout_service', {p_token: adminToken}); } catch {}
      adminToken = null;
      const login = await loginRemote(created.operator.id, pin, APP_NAME);
      await finishRemoteLogin(login, pin);
    } catch (err) {
      if (adminToken) { try { await rpc('core_logout_service', {p_token: adminToken}); } catch {} }
      if (error) error.textContent = err?.message || 'No se pudo crear el operador.';
    } finally {
      setBusy(false);
    }
  }

  async function restoreSession() {
    const session = getSession();
    if (!session?.operator?.id) return false;

    if (session.token) {
      try {
        const result = await rpc('core_validate_session_service', {p_token: session.token});
        if (!result?.ok || !result.operator?.active) {
          clearSession();
          return false;
        }
        onlineAvailable = true;
        await cacheCredential(result.operator);
        unlock(result.operator, {...session, operator: result.operator, offline: false});
        return true;
      } catch (error) {
        console.warn('[PDT CloudAuth] Validación online no disponible; sesión degradada.', error);
        const cached = getCache().operators.find(item => item.id === session.operator.id) || session.operator;
        unlock(cached, {...session, operator: cached, offline: true});
        return true;
      }
    }

    if (session.offline) {
      const cached = getCache().operators.find(item => item.id === session.operator.id);
      if (cached) { unlock(cached, session); return true; }
    }
    clearSession();
    return false;
  }

  async function logout() {
    const session = getSession();
    if (session?.token) {
      try { await rpc('core_logout_service', {p_token: session.token}); } catch {}
    }
    clearSession();
    currentOperator = null;
    location.reload();
  }

  function publishReady() {
    window.__PDT_CLOUD_AUTH_READY__ = true;
    document.dispatchEvent(new CustomEvent('pdt:cloud-auth-ready', {
      detail: {online: onlineAvailable, bootstrapped}
    }));
  }

  async function boot() {
    window.__PDT_CLOUD_AUTH_ENABLED__ = true;
    injectStyles();
    setAppLocked(true);
    if (await restoreSession()) {
      publishReady();
      return;
    }
    createOverlay();
    await loadOperators();
    publishReady();
    setTimeout(() => ($('#pdtAuthOperator')?.value ? $('#pdtAuthPin') : $('#pdtAuthCreateName'))?.focus(), 0);
  }

  window.OperatorSession = {
    getCurrentOperator: () => currentOperator ? {id: currentOperator.id, name: currentOperator.name, role: currentOperator.role || 'operator'} : null,
    logout,
    getSession
  };

  window.__PDT_CLOUD_AUTH_ENABLED__ = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
