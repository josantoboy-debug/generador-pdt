(() => {
  'use strict';

  const POLICY_VERSION = '20260831-critical1';
  const NAME_STORAGE_KEY = 'generadorPDT.personName.v1';
  const PREF_STORAGE_KEY = 'generadorPDT.ttsPreference.v2';
  const DEFAULTS = Object.freeze({welcome:false, criticalWarnings:true});
  const $ = (selector, root = document) => root.querySelector(selector);
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = supported ? window.speechSynthesis : null;
  let voices = [];
  let preference = readPreference();
  const recentWarnings = new Map();

  function safeJSON(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function readPreference() {
    const saved = safeJSON(localStorage.getItem(PREF_STORAGE_KEY), null);
    return {
      welcome: typeof saved?.welcome === 'boolean' ? saved.welcome : DEFAULTS.welcome,
      criticalWarnings: typeof saved?.criticalWarnings === 'boolean' ? saved.criticalWarnings : DEFAULTS.criticalWarnings
    };
  }

  function savePreference(next) {
    preference = {...preference, ...next};
    try { localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(preference)); } catch {}
    syncControls();
    if (!preference.welcome && !preference.criticalWarnings) {
      try { synth?.cancel?.(); } catch {}
    }
  }

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

  function speakText(text) {
    if (!supported || !text) return false;
    refreshVoices();
    const utterance = new SpeechSynthesisUtterance(String(text));
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

  function speakWelcome(name) {
    if (!preference.welcome) return false;
    return speakText(`Bienvenido, ${name}`);
  }

  function warningText(kind) {
    if (kind === 'duplicate') return 'Precaución. Dispositivo duplicado.';
    if (kind === 'ua') return 'Precaución. Error en código U A.';
    if (kind === 'serial') return 'Precaución. Error en código Serial.';
    return '';
  }

  function speakCriticalWarning(kind) {
    if (!preference.criticalWarnings) return false;
    const text = warningText(kind);
    if (!text) return false;
    const now = Date.now();
    const last = recentWarnings.get(kind) || 0;
    if (now - last < 1800) return false;
    recentWarnings.set(kind, now);
    return speakText(text);
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
      .pdt-tts-policy{display:grid;gap:7px;margin:12px 0;padding:10px;border:1px solid var(--border,#dfe3e8);border-radius:11px;background:rgba(127,127,127,.06)}
      .pdt-tts-policy-head{display:flex;justify-content:space-between;gap:10px;font-size:10px;font-weight:800}.pdt-tts-policy-options{display:grid;grid-template-columns:1fr 1fr;gap:7px}.pdt-tts-policy button{margin:0;min-height:44px;padding:8px 10px;border:1px solid var(--border,#dfe3e8);border-radius:9px;background:var(--surface,#fff);color:var(--text,#222);font:inherit;text-align:left}.pdt-tts-policy button.active{border-color:#2f6fe4;background:rgba(47,111,228,.12)}.pdt-tts-policy button b{float:right}.pdt-tts-policy button small{display:block;margin-top:2px;color:var(--muted,#6c757d);font-size:9px}
      @media(max-width:520px){.pdt-tts-policy-options{grid-template-columns:1fr}}
      @media print{.pdt-welcome-overlay,.pdt-tts-policy{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function syncControls() {
    document.querySelectorAll('[data-pdt-tts-setting]').forEach(button => {
      const setting = button.dataset.pdtTtsSetting;
      const active = !!preference[setting];
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      const state = button.querySelector('[data-pdt-tts-state]');
      if (state) state.textContent = active ? 'ON' : 'OFF';
    });
    document.documentElement.dataset.ttsPolicyVersion = POLICY_VERSION;
  }

  function installTTSControls() {
    const card = $('.pdt-auth-card');
    if (!card) return false;
    if ($('#pdtTtsPolicy')) { syncControls(); return true; }
    const section = document.createElement('section');
    section.id = 'pdtTtsPolicy';
    section.className = 'pdt-tts-policy';
    section.innerHTML = `
      <div class="pdt-tts-policy-head"><span>VOZ TTS</span><span>${supported ? 'Voz del navegador' : 'No disponible'}</span></div>
      <div class="pdt-tts-policy-options">
        <button type="button" data-pdt-tts-setting="criticalWarnings" aria-pressed="true"><strong>⚠ Precauciones</strong><b data-pdt-tts-state>ON</b><small>Duplicado · error UA · error Serial</small></button>
        <button type="button" data-pdt-tts-setting="welcome" aria-pressed="false"><strong>👋 Bienvenida</strong><b data-pdt-tts-state>OFF</b><small>Al iniciar sesión</small></button>
      </div>`;
    const note = $('#pdtAuthNote', card);
    card.insertBefore(section, note || null);
    section.addEventListener('click', event => {
      const button = event.target.closest('[data-pdt-tts-setting]');
      if (!button) return;
      const setting = button.dataset.pdtTtsSetting;
      savePreference({[setting]:!preference[setting]});
    });
    syncControls();
    return true;
  }

  function watchTTSControls() {
    if (installTTSControls()) return;
    const observer = new MutationObserver(() => {
      if (installTTSControls()) observer.disconnect();
    });
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  function installWarningWatchers() {
    const serial = $('#text-sn');
    const ua = $('#text-ua');
    const history = $('#history-list');
    const tabs = $('#tabs-header');

    if (serial && serial.dataset.ttsWarningBound !== '1') {
      serial.dataset.ttsWarningBound = '1';
      serial.addEventListener('blur', () => {
        const value = String(serial.value || '').trim().toUpperCase();
        if (value && !/^M[A-Z0-9]{11}$/.test(value)) speakCriticalWarning('serial');
      });
    }

    if (ua && ua.dataset.ttsWarningBound !== '1') {
      ua.dataset.ttsWarningBound = '1';
      ua.addEventListener('blur', () => {
        const digits = String(ua.value || '').replace(/\D/g, '');
        if (digits && digits.length !== 16) speakCriticalWarning('ua');
      });
    }

    const checkDuplicate = () => {
      const duplicate = document.querySelector('.duplicate-alert,.tab-duplicate-alert');
      const text = `${history?.textContent || ''} ${tabs?.textContent || ''}`;
      if (duplicate || /CÓDIGO DUPLICADO/i.test(text)) speakCriticalWarning('duplicate');
    };

    [history, tabs].forEach(node => {
      if (!node || node.dataset.ttsDuplicateObserver === '1') return;
      node.dataset.ttsDuplicateObserver = '1';
      const observer = new MutationObserver(checkDuplicate);
      observer.observe(node, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class']});
    });
  }

  function openGate() {
    if ($('#pdtWelcomeOverlay')) return;
    const saved = normalizeName(localStorage.getItem(NAME_STORAGE_KEY));
    const overlay = document.createElement('div');
    overlay.id = 'pdtWelcomeOverlay';
    overlay.className = 'pdt-welcome-overlay';
    overlay.innerHTML = `
      <section class="pdt-welcome-card" role="dialog" aria-modal="true" aria-labelledby="pdtWelcomeTitle">
        <h2 id="pdtWelcomeTitle">Bienvenida</h2>
        <p>Ingresa tu nombre para iniciar. Las precauciones críticas de código están activadas por defecto.</p>
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
      try { localStorage.setItem(NAME_STORAGE_KEY, name); } catch {}
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
    try { localStorage.setItem(NAME_STORAGE_KEY, name); } catch {}
    speakWelcome(name);
    document.dispatchEvent(new CustomEvent('person:welcome', {detail:{name, operatorId:operator.id, ttsSupported:supported}}));
  }

  function boot() {
    injectStyles();
    refreshVoices();
    syncControls();
    watchTTSControls();
    installWarningWatchers();
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

  window.PDTWelcomeTTS = {
    version: POLICY_VERSION,
    supported,
    getPreference: () => ({...preference}),
    setWelcome: enabled => savePreference({welcome:!!enabled}),
    setCriticalWarnings: enabled => savePreference({criticalWarnings:!!enabled}),
    speakWelcome,
    speakCriticalWarning,
    refreshVoices
  };
})();
