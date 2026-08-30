(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  let needsBootstrap = null;

  const $ = selector => document.querySelector(selector);
  const normalizeCode = value => String(value ?? '').trim().toUpperCase();

  function getCode() {
    return normalizeCode($('#pdtBootstrapCode')?.value);
  }

  function setError(text) {
    const node = $('#pdtAuthCreateError');
    if (node) node.textContent = text || '';
  }

  function mapBootstrapError(code) {
    if (code === 'INVALID_BOOTSTRAP_CODE') return 'Código de activación incorrecto.';
    if (code === 'BOOTSTRAP_CODE_REQUIRED') return 'Ingresa el código de activación inicial.';
    if (code === 'BOOTSTRAP_UNAVAILABLE') return 'La activación inicial ya no está disponible.';
    return null;
  }

  function injectField() {
    if (needsBootstrap !== true || $('#pdtBootstrapWrap')) return;
    const box = $('#pdtAuthCreate');
    const error = $('#pdtAuthCreateError');
    if (!box || !error) return;

    const label = document.createElement('label');
    label.id = 'pdtBootstrapWrap';
    label.innerHTML = `Código de activación inicial
      <input id="pdtBootstrapCode" type="text" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Código de activación">`;
    box.insertBefore(label, error);

    const note = document.createElement('p');
    note.id = 'pdtBootstrapNote';
    note.style.margin = '4px 0 8px';
    note.style.fontSize = '10px';
    note.style.color = 'var(--muted,#6c757d)';
    note.textContent = 'Solo se solicita una vez al crear el primer administrador.';
    box.insertBefore(note, error);
  }

  function removeField() {
    $('#pdtBootstrapWrap')?.remove();
    $('#pdtBootstrapNote')?.remove();
  }

  function syncField() {
    if (needsBootstrap === true) injectField();
    else if (needsBootstrap === false) removeField();
  }

  function scheduleBootstrapError(code) {
    const text = mapBootstrapError(code);
    if (!text) return;
    setTimeout(() => setError(text), 0);
  }

  async function inspectResponse(response, type) {
    try {
      const data = await response.clone().json();
      if (type === 'list' && typeof data?.bootstrapped === 'boolean') {
        needsBootstrap = !data.bootstrapped;
        queueMicrotask(syncField);
      }
      if (type === 'bootstrap') scheduleBootstrapError(data?.code);
    } catch {}
  }

  window.fetch = async function secureBootstrapFetch(input, init) {
    let url = typeof input === 'string' ? input : String(input?.url || input || '');
    let nextInput = input;
    let nextInit = init;
    let type = null;

    if (url.includes('/rpc/core_list_operators_service')) {
      type = 'list';
    }

    if (url.includes('/rpc/core_bootstrap_admin_service') && !url.includes('/rpc/core_bootstrap_admin_service_v2')) {
      type = 'bootstrap';
      const body = (() => {
        try { return JSON.parse(init?.body || '{}'); } catch { return {}; }
      })();

      url = url.replace('/rpc/core_bootstrap_admin_service', '/rpc/core_bootstrap_admin_service_v2');
      nextInput = typeof input === 'string' ? url : new Request(url, input);
      nextInit = {
        ...(init || {}),
        body: JSON.stringify({...body, p_bootstrap_code: getCode()})
      };
    }

    const response = await nativeFetch(nextInput, nextInit);
    if (type) inspectResponse(response, type);
    return response;
  };

  function blockMissingCode(event) {
    if (needsBootstrap !== true || getCode()) return false;
    setError('Ingresa el código de activación inicial.');
    $('#pdtBootstrapCode')?.focus();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('#pdtAuthCreateBtn')) blockMissingCode(event);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target?.id === 'pdtAuthCreatePin2') blockMissingCode(event);
  }, true);

  const observer = new MutationObserver(syncField);
  if (document.documentElement) observer.observe(document.documentElement, {childList: true, subtree: true});
})();
