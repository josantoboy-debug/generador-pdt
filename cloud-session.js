(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  let overlay = null;

  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function auth() { return window.ProductionCore?.AuthService; }

  function injectStyles() {
    if ($('#cloudSessionStyles')) return;
    const style = document.createElement('style');
    style.id = 'cloudSessionStyles';
    style.textContent = `
      .cloud-login{position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,8,16,.80);backdrop-filter:blur(8px)}
      .cloud-card{width:min(440px,95vw);padding:22px;border-radius:18px;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#dfe3e8);box-shadow:0 30px 90px rgba(0,0,0,.42)}
      .cloud-card h2{margin:0 0 6px;font-size:20px}.cloud-card p{margin:0 0 16px;color:var(--muted,#6c757d);font-size:12px;line-height:1.5}
      .cloud-grid{display:grid;gap:12px}.cloud-grid label{display:grid;gap:6px;font-size:12px;font-weight:750}.cloud-grid select,.cloud-grid input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--border,#dfe3e8);border-radius:10px;background:var(--surface,#fff);color:var(--text,#222);font:inherit}
      .cloud-actions{display:flex;gap:8px;margin-top:14px}.cloud-actions button{flex:1}.cloud-error{min-height:18px;margin-top:8px;color:#dc3545;font-size:11px}.cloud-note{font-size:10px!important;margin-top:10px!important}
      .cloud-operator-chip{position:fixed;left:10px;bottom:10px;z-index:3001;display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:999px;background:rgba(15,23,42,.92);color:#fff;font:600 11px system-ui;border:1px solid rgba(148,163,184,.28)}
      .cloud-operator-chip button{border:0;border-radius:999px;padding:4px 7px;font:700 10px system-ui;cursor:pointer}
      @media print{.cloud-login,.cloud-operator-chip{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function renderChip() {
    const op = auth()?.operator;
    document.querySelector('.cloud-operator-chip')?.remove();
    if (!op) return;
    const chip = document.createElement('div');
    chip.className = 'cloud-operator-chip';
    chip.innerHTML = `<span>${esc(op.name)} · ${esc(op.role)}</span><button type="button">Cerrar sesión</button>`;
    chip.querySelector('button').addEventListener('click', async () => {
      await auth().logout();
      location.reload();
    });
    document.body.appendChild(chip);
  }

  async function loadOperators() {
    const select = $('#cloudOperator');
    const createBox = $('#cloudBootstrap');
    const loginBox = $('#cloudLoginFields');
    const result = await auth().listOperators().catch(() => ({ ok:false }));
    if (!result?.ok) {
      $('#cloudError').textContent = 'No se pudo consultar operadores. Comprueba la conexión.';
      return;
    }
    const list = result.operators || [];
    if (!list.length) {
      createBox.hidden = false;
      loginBox.hidden = true;
      return;
    }
    createBox.hidden = true;
    loginBox.hidden = false;
    select.innerHTML = list.map(op => `<option value="${esc(op.id)}">${esc(op.name)}${op.role === 'admin' ? ' · Administrador' : ''}</option>`).join('');
  }

  function buildOverlay() {
    if (overlay || auth()?.operator) return;
    overlay = document.createElement('div');
    overlay.className = 'cloud-login';
    overlay.innerHTML = `
      <section class="cloud-card" role="dialog" aria-modal="true" aria-labelledby="cloudTitle">
        <h2 id="cloudTitle">Acceso de operador</h2>
        <p>Las cuentas se comparten entre dispositivos mediante Supabase. Si pierdes Internet después de entrar, la aplicación continuará guardando cambios pendientes localmente.</p>
        <div id="cloudLoginFields" class="cloud-grid">
          <label>Operador<select id="cloudOperator"></select></label>
          <label>PIN<input id="cloudPin" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" placeholder="4 a 8 dígitos"></label>
          <div class="cloud-actions"><button id="cloudLoginBtn" type="button">ENTRAR</button></div>
        </div>
        <div id="cloudBootstrap" class="cloud-grid" hidden>
          <p><strong>Configuración inicial:</strong> todavía no existe ningún operador. Crea el primer administrador.</p>
          <label>Nombre<input id="cloudAdminName" maxlength="60" autocomplete="name"></label>
          <label>PIN administrador<input id="cloudAdminPin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></label>
          <div class="cloud-actions"><button id="cloudBootstrapBtn" type="button">CREAR ADMINISTRADOR</button></div>
        </div>
        <div id="cloudError" class="cloud-error" aria-live="polite"></div>
        <p class="cloud-note">El PIN se valida en Supabase y nunca se guarda en texto plano en el navegador.</p>
      </section>`;
    document.body.appendChild(overlay);

    $('#cloudLoginBtn').addEventListener('click', login);
    $('#cloudPin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); login(); } });
    $('#cloudBootstrapBtn').addEventListener('click', bootstrap);
    $('#cloudAdminPin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); bootstrap(); } });
    loadOperators();
  }

  async function login() {
    const id = $('#cloudOperator')?.value;
    const pin = $('#cloudPin')?.value || '';
    const error = $('#cloudError');
    if (!id || !/^\d{4,8}$/.test(pin)) { error.textContent = 'Selecciona un operador e ingresa un PIN válido.'; return; }
    error.textContent = 'Verificando…';
    const result = await auth().login(id, pin).catch(() => ({ ok:false, code:'NETWORK' }));
    if (!result?.ok) {
      const messages = { INVALID_PIN:'PIN incorrecto.', LOCKED:'Acceso bloqueado temporalmente por varios intentos fallidos.', OPERATOR_UNAVAILABLE:'El operador no está disponible.', NETWORK:'No se pudo contactar al servidor.' };
      error.textContent = messages[result?.code] || 'No se pudo iniciar sesión.';
      return;
    }
    overlay.remove(); overlay = null; renderChip();
    window.ProductionCore.SyncService.flush();
  }

  async function bootstrap() {
    const name = ($('#cloudAdminName')?.value || '').trim();
    const pin = $('#cloudAdminPin')?.value || '';
    const error = $('#cloudError');
    if (!name || !/^\d{4,8}$/.test(pin)) { error.textContent = 'Escribe un nombre y un PIN de 4 a 8 dígitos.'; return; }
    error.textContent = 'Creando administrador…';
    const result = await auth().bootstrap(name, pin).catch(() => ({ ok:false }));
    if (!result?.ok) { error.textContent = result?.code === 'ALREADY_BOOTSTRAPPED' ? 'La configuración inicial ya fue completada.' : 'No se pudo crear el administrador.'; await loadOperators(); return; }
    await loadOperators();
    const select = $('#cloudOperator');
    if (select) select.value = result.operator.id;
    $('#cloudPin').value = pin;
    login();
  }

  async function start() {
    injectStyles();
    const current = auth();
    if (!current) return;
    if (current.token) {
      const valid = await current.validate().catch(() => ({ ok:false }));
      if (valid?.ok) { renderChip(); return; }
    }
    buildOverlay();
  }

  document.addEventListener('production:ready', start, { once:true });
  if (window.ProductionCore) setTimeout(start, 0);
})();
