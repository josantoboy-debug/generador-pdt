document.write('<script src="secure-bootstrap-patch.js?v=20260829-2"><\/script>');
document.write('<script src="cloud-operator-session.js?v=20260829-1"><\/script>');

(() => {
  'use strict';

  const STORAGE_KEY = 'generadorPDT.personName.v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = supported ? window.speechSynthesis : null;
  let voices = [];

  function normalizeName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function refreshVoices() {
    if (!supported) return;
    try { voices = synth.getVoices() || []; } catch { voices = []; }
  }

  function pickVoice() {
    const score = voice => {
      const lang = String(voice?.lang || '').toLowerCase();
      const name = String(voice?.name || '').toLowerCase();
      let value = 100;
      if (lang === 'es-pa') value = 0;
      else if (lang === 'es-us') value = 5;
      else if (lang === 'es-mx') value = 8;
      else if (lang === 'es-419') value = 10;
      else if (lang === 'es-es') value = 12;
      else if (lang.startsWith('es')) value = 18;
      if (/natural|neural|google|microsoft/.test(name)) value -= 2;
      if (voice?.default) value -= 1;
      return value;
    };
    return voices.slice().sort((a, b) => score(a) - score(b))[0] || null;
  }

  function speakWelcome(name) {
    if (!supported) return false;
    refreshVoices();
    const utterance = new SpeechSynthesisUtterance(`Bienvenido, ${name}`);
    const voice = pickVoice();
    utterance.lang = voice?.lang || 'es-PA';
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.volume = 1;
    try {
      synth.cancel();
      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  function injectStyles() {
    if ($('#pdtWelcomeTtsStyles')) return;
    const style = document.createElement('style');
    style.id = 'pdtWelcomeTtsStyles';
    style.textContent = `
      .pdt-welcome-overlay{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(5,10,18,.78);backdrop-filter:blur(8px)}
      .pdt-welcome-card{width:min(430px,94vw);padding:24px;border-radius:18px;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#dfe3e8);box-shadow:0 30px 90px rgba(0,0,0,.4)}
      .pdt-welcome-card h2{margin:0 0 6px;font-size:22px}.pdt-welcome-card p{margin:0 0 18px;color:var(--muted,#6c757d);font-size:12px;line-height:1.5}
      .pdt-welcome-card label{display:grid;gap:7px;font-size:12px;font-weight:750}.pdt-welcome-card input{width:100%;box-sizing:border-box;padding:12px 13px;border-radius:10px;border:1px solid var(--border,#dfe3e8);background:var(--surface,#fff);color:var(--text,#222);font:inherit}
      .pdt-welcome-card button{width:100%;margin-top:14px}.pdt-welcome-error{min-height:18px;margin-top:7px;color:#dc3545;font-size:11px}.pdt-welcome-support{margin-top:12px!important;font-size:10px!important}
      @media print{.pdt-welcome-overlay{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function openGate() {
    if ($('#pdtWelcomeOverlay')) return;
    const saved = normalizeName(localStorage.getItem(STORAGE_KEY));
    const overlay = document.createElement('div');
    overlay.id = 'pdtWelcomeOverlay';
    overlay.className = 'pdt-welcome-overlay';
    overlay.innerHTML = `
      <section class="pdt-welcome-card" role="dialog" aria-modal="true" aria-labelledby="pdtWelcomeTitle">
        <h2 id="pdtWelcomeTitle">Bienvenida</h2>
        <p>Ingresa tu nombre para iniciar. La aplicación usará la voz del dispositivo para darte la bienvenida.</p>
        <label>Nombre
          <input id="pdtPersonName" maxlength="60" autocomplete="name" value="${escapeHtml(saved)}" placeholder="Escribe tu nombre">
        </label>
        <div id="pdtWelcomeError" class="pdt-welcome-error" aria-live="polite"></div>
        <button id="pdtEnterBtn" type="button">ENTRAR A LA APP</button>
        <p class="pdt-welcome-support">${supported ? 'TTS disponible en este navegador.' : 'Este navegador no ofrece síntesis de voz; podrás usar la aplicación normalmente.'}</p>
      </section>`;
    document.body.appendChild(overlay);

    const input = $('#pdtPersonName');
    const button = $('#pdtEnterBtn');
    const enter = () => {
      const name = normalizeName(input?.value);
      if (!name) {
        $('#pdtWelcomeError').textContent = 'Escribe tu nombre para continuar.';
        input?.focus();
        return;
      }
      try { localStorage.setItem(STORAGE_KEY, name); } catch {}
      speakWelcome(name);
      overlay.remove();
      document.documentElement.dataset.personName = name;
      document.dispatchEvent(new CustomEvent('person:welcome', {detail:{name, ttsSupported:supported}}));
      setTimeout(() => document.querySelector('[autofocus],#text-sn')?.focus(), 0);
    };
    button.addEventListener('click', enter);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); enter(); }
    });
    setTimeout(() => { input?.focus(); if (saved) input?.select(); }, 0);
  }

  function showAuthLoadError() {
    if ($('#pdtWelcomeOverlay')) return;
    const shell = $('.app-shell');
    if (shell) shell.inert = true;
    const overlay = document.createElement('div');
    overlay.id = 'pdtWelcomeOverlay';
    overlay.className = 'pdt-welcome-overlay';
    overlay.innerHTML = `
      <section class="pdt-welcome-card" role="alert">
        <h2>No se pudo iniciar el acceso</h2>
        <p>El módulo de operadores no cargó correctamente. Recarga la aplicación para recuperar el acceso seguro.</p>
        <button id="pdtReloadAuth" type="button">RECARGAR</button>
      </section>`;
    document.body.appendChild(overlay);
    $('#pdtReloadAuth')?.addEventListener('click', () => location.reload());
  }

  function greetAuthenticatedOperator(operator) {
    const name = normalizeName(operator?.name);
    if (!name) return;
    document.documentElement.dataset.personName = name;
    try { localStorage.setItem(STORAGE_KEY, name); } catch {}
    speakWelcome(name);
    document.dispatchEvent(new CustomEvent('person:welcome', {detail:{name, operatorId: operator.id, ttsSupported:supported}}));
  }

  function boot() {
    injectStyles();
    refreshVoices();
    if (supported) {
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices);
      else if ('onvoiceschanged' in synth) synth.onvoiceschanged = refreshVoices;
    }

    if (!window.__PDT_CLOUD_AUTH_ENABLED__) {
      showAuthLoadError();
      return;
    }

    const current = window.OperatorSession?.getCurrentOperator?.();
    if (current) {
      greetAuthenticatedOperator(current);
      return;
    }

    document.addEventListener('operator:login', event => greetAuthenticatedOperator(event.detail), {once:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  window.PDTWelcomeTTS = {supported, speakWelcome, refreshVoices};
})();
