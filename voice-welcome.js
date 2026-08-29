(() => {
  'use strict';

  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = supported ? window.speechSynthesis : null;
  let voices = [];
  let pendingName = '';
  let unlocked = false;
  const spokenSessions = new Set();

  function normalizeName(value) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0,60); }
  function refreshVoices() { if (!supported) return; try { voices = synth.getVoices() || []; } catch { voices = []; } }
  function pickVoice() {
    const score = voice => {
      const lang = String(voice?.lang || '').toLowerCase();
      const name = String(voice?.name || '').toLowerCase();
      let value = 100;
      if (lang === 'es-pa') value = 0; else if (lang === 'es-us') value = 5; else if (lang === 'es-mx') value = 8; else if (lang === 'es-419') value = 10; else if (lang === 'es-es') value = 12; else if (lang.startsWith('es')) value = 18;
      if (/natural|neural|google|microsoft/.test(name)) value -= 2;
      if (voice?.default) value -= 1;
      return value;
    };
    return voices.slice().sort((a,b) => score(a) - score(b))[0] || null;
  }
  function speakWelcome(name) {
    name = normalizeName(name);
    if (!supported || !name) return false;
    refreshVoices();
    const utterance = new SpeechSynthesisUtterance(`Bienvenida, ${name}.`);
    const voice = pickVoice();
    utterance.lang = voice?.lang || 'es-PA';
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02; utterance.pitch = 1; utterance.volume = 1;
    try { synth.cancel(); synth.speak(utterance); return true; } catch { return false; }
  }
  function sessionKey() { return window.ProductionCore?.AuthService?.session?.session_id || ''; }
  function welcome(name) {
    name = normalizeName(name);
    const key = sessionKey() || name;
    if (!name || spokenSessions.has(key)) return;
    if (!unlocked) { pendingName = name; return; }
    if (speakWelcome(name)) spokenSessions.add(key);
  }
  function unlock(event) {
    if (unlocked || event?.isTrusted === false) return;
    unlocked = true;
    if (pendingName) { const name = pendingName; pendingName = ''; welcome(name); }
  }
  function boot() {
    refreshVoices();
    if (supported) {
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices);
      else if ('onvoiceschanged' in synth) synth.onvoiceschanged = refreshVoices;
    }
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, { capture:true, passive:true });
    document.addEventListener('operator:login', event => welcome(event.detail?.name));
    const existing = window.ProductionCore?.AuthService?.operator;
    if (existing?.name) welcome(existing.name);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
  window.PDTWelcomeTTS = { supported, speakWelcome, refreshVoices };
})();
