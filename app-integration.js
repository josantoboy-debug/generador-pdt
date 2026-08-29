(() => {
  'use strict';

  const core = () => window.ProductionCore;
  const $ = id => document.getElementById(id);
  const digitsUA = value => String(value || '').replace(/\D/g, '').slice(0,16);
  const host = () => core()?.ValidationService.normalizeHost($('text-sn')?.value || '');
  const ua = () => digitsUA($('text-ua')?.value || '');
  const size = selector => $(selector)?.value || '2.5x1.0';
  let adminLoaded = false;

  function ensureAdminPanel() {
    if (adminLoaded || core()?.AuthService.operator?.role !== 'admin') return;
    adminLoaded = true;
    const script = document.createElement('script');
    script.src = `admin-panel.js?v=${encodeURIComponent(core().config.appVersion)}`;
    script.onerror = error => { adminLoaded = false; core()?.ErrorService.capture('admin-panel-load', error); };
    document.head.appendChild(script);
  }

  function toast(message, tone = 'ok') {
    let el = $('prodToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'prodToast';
      el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:6500;max-width:min(520px,92vw);padding:10px 13px;border-radius:10px;background:#0f172a;color:#fff;font:600 12px/1.35 system-ui;box-shadow:0 10px 32px rgba(0,0,0,.28)';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.border = tone === 'error' ? '1px solid #ef4444' : tone === 'warn' ? '1px solid #f59e0b' : '1px solid #22c55e';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.remove(), 3500);
  }

  async function queueLabel(action) {
    const c = core();
    if (!c?.AuthService.operator) return;
    const sn = host(), unit = ua();
    if (!c.ValidationService.isValidHost(sn) || !c.ValidationService.isValidUA(unit)) return;
    await c.SyncService.enqueue('pdt.label', {
      host_sn: sn,
      ua: unit,
      operator_id: c.AuthService.operator.id,
      action,
      label_size: size('select-size'),
      payload: { source: 'generador-pdt', physical_profile: 'existing-print-profile-unchanged' }
    });
    c.AuditService.record(action === 'printed' ? 'label_printed' : 'label_exported', { host_sn: sn, ua: unit, result: 'OK' });
  }

  async function queueText(action) {
    const c = core();
    if (!c?.AuthService.operator) return;
    const text = String($('text-label-input')?.value || '').trim();
    if (!text) return;
    await c.SyncService.enqueue('pdt.text', {
      text_content: text.slice(0,500),
      operator_id: c.AuthService.operator.id,
      action,
      label_size: size('text-select-size'),
      payload: {
        align: $('text-label-align')?.value || 'center',
        weight: $('text-label-weight')?.value || '700',
        max_size: $('text-label-max-size')?.value || 'auto',
        margins_mm: { left: 3, right: 3 }
      }
    });
    c.AuditService.record(action === 'printed' ? 'text_printed' : 'text_saved', { result: 'OK' });
  }

  function bind() {
    $('btn-print-main')?.addEventListener('click', () => queueLabel('printed').catch(error => core()?.ErrorService.capture('pdt-print-sync', error)), true);
    $('btn-download')?.addEventListener('click', () => queueLabel('exported').catch(error => core()?.ErrorService.capture('pdt-export-sync', error)), true);
    $('btn-print-text')?.addEventListener('click', () => queueText('printed').catch(error => core()?.ErrorService.capture('pdt-text-print-sync', error)), true);
    $('btn-save-text-history')?.addEventListener('click', () => queueText('saved').catch(error => core()?.ErrorService.capture('pdt-text-save-sync', error)), true);
    $('btn-modal-excel')?.addEventListener('click', () => core()?.AuditService.record('history_exported', { result: 'XLSX' }));
    $('btn-modal-txt')?.addEventListener('click', () => core()?.AuditService.record('history_exported', { result: 'TXT' }));
    $('btn-load-json')?.addEventListener('click', () => core()?.AuditService.record('session_import_started', { result: 'USER_ACTION' }));

    document.addEventListener('sync:conflict', event => toast(event.detail?.message || 'Se detectó un conflicto de sincronización.', 'warn'));
    document.addEventListener('operator:login', event => {
      const name = event.detail?.name;
      if (name) toast(`Bienvenida, ${name}.`);
      ensureAdminPanel();
    });
    document.addEventListener('production:session-changed', ensureAdminPanel);
    ensureAdminPanel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();
