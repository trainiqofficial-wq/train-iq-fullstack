(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => c != null && node.append(c));
    return node;
  }

  const STATUSES = ['NEW', 'CONTACTED', 'CLOSED'];
  let options = null;
  let leads = [];
  const expanded = new Set();

  const label = (list, id) => (id && options ? (options[list].find((o) => o.id === id) || {}).label || id : '');
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

  class AuthError extends Error {}

  async function api(path, opts) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers: { 'Content-Type': 'application/json', ...((opts && opts.headers) || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.endsWith('/login')) throw new AuthError(body.error || 'Please sign in.');
    if (!res.ok) throw new Error(body.error || 'Request failed.');
    return body;
  }

  /* ---------------- Views ---------------- */

  function showLogin(message) {
    $('dashView').hidden = true;
    $('loginView').hidden = false;
    const box = $('loginError');
    box.textContent = message || '';
    box.hidden = !message;
    $('loginForm').elements.username.focus();
  }

  async function showDashboard(user) {
    $('loginView').hidden = true;
    $('dashView').hidden = false;
    $('who').textContent = user ? `Signed in as ${user}` : '';
    if (!options) {
      try { options = await (await fetch('/api/options')).json(); } catch (e) { options = null; }
    }
    await loadLeads();
  }

  function dashError(message) {
    const box = $('dashError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  /* ---------------- Data ---------------- */

  async function loadLeads() {
    dashError('');
    try {
      const body = await api('/api/admin/leads');
      leads = body.leads;
      render();
    } catch (err) {
      if (err instanceof AuthError) return showLogin('Your session has ended. Please sign in again.');
      dashError(err.message);
    }
  }

  function filtered() {
    const q = $('search').value.trim().toLowerCase();
    const status = $('statusFilter').value;
    return leads.filter((l) => {
      if (status && l.status !== status) return false;
      if (!q) return true;
      return [l.fullName, l.mobileNumber, l.email, l.businessName, l.businessLocation, l.leadRef, l.businessCategory]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  /* ---------------- Rendering ---------------- */

  function render() {
    $('statAll').textContent = leads.length;
    STATUSES.forEach((s) => ($('stat' + s).textContent = leads.filter((l) => l.status === s).length));

    const rows = filtered();
    const tbody = $('leadRows');
    tbody.replaceChildren();
    rows.forEach((l) => {
      tbody.append(leadRow(l));
      if (expanded.has(l.id)) tbody.append(detailRow(l));
    });
    $('emptyState').hidden = rows.length > 0;

    // Export uses whatever filters are currently applied.
    const params = new URLSearchParams();
    if ($('statusFilter').value) params.set('status', $('statusFilter').value);
    if ($('search').value.trim()) params.set('q', $('search').value.trim());
    const qs = params.toString();
    $('exportLink').href = '/api/admin/leads/export.csv' + (qs ? '?' + qs : '');
  }

  function leadRow(l) {
    const select = el('select', { class: 'status', 'data-status': l.status, 'aria-label': `Status for ${l.fullName}` },
      STATUSES.map((s) => el('option', { value: s, text: s, selected: s === l.status })));
    select.addEventListener('change', () => changeStatus(l, select));

    const open = expanded.has(l.id);
    const toggle = el('button', { type: 'button', class: 'mini', 'aria-expanded': String(open), text: open ? 'Hide' : 'Details' });
    toggle.addEventListener('click', () => {
      if (expanded.has(l.id)) expanded.delete(l.id);
      else expanded.add(l.id);
      render();
    });
    const del = el('button', { type: 'button', class: 'mini danger', text: 'Delete' });
    del.addEventListener('click', () => removeLead(l));

    return el('tr', { class: 'lead-row' },
      el('td', {}, el('span', { class: 'name', text: l.fullName }), el('span', { class: 'sub', text: l.mobileNumber })),
      el('td', {}, el('span', { class: 'name', text: l.businessName || 'Not given' }), el('span', { class: 'sub', text: l.businessLocation })),
      el('td', {}, el('span', { class: 'chip', text: l.businessCategory || '-' })),
      el('td', { text: label('timelines', l.desiredTimeline) || '-' }),
      el('td', {}, select),
      el('td', { text: fmtDate(l.createdAt) }),
      el('td', {}, el('div', { class: 'row-actions' }, toggle, del))
    );
  }

  function detailRow(l) {
    const item = (term, value) => el('div', {}, el('dt', { text: term }), el('dd', {}, value));
    const text = (v) => (v && v.length ? v : '-');

    const website = l.businessWebsite
      ? el('a', { href: l.businessWebsite, target: '_blank', rel: 'noopener noreferrer', text: l.businessWebsite })
      : '-';
    const waLink = el('a', { href: `https://wa.me/91${l.mobileNumber}`, target: '_blank', rel: 'noopener noreferrer', text: 'Message on WhatsApp' });
    const callLink = el('a', { href: `tel:+91${l.mobileNumber}`, text: 'Call' });
    const emailLink = l.email ? el('a', { href: `mailto:${l.email}`, text: l.email }) : '-';

    return el('tr', { class: 'detail-row' },
      el('td', { colspan: '7' },
        el('dl', { class: 'details' },
          item('Reference', text(l.leadRef)),
          item('Prefers', text(l.preferredContactMethod)),
          item('Reach out', [waLink, ' / ', callLink]),
          item('Email', emailLink),
          item('Website', website),
          item('Already on', text(l.currentPresence.map((id) => label('presence', id)).join(', '))),
          item('Wants to improve', text(l.challenges.map((id) => label('challenges', id)).join(', '))),
          item('Main goal', text(label('goals', l.primaryGoal)))
        )
      )
    );
  }

  /* ---------------- Actions ---------------- */

  async function changeStatus(lead, select) {
    const previous = lead.status;
    try {
      const { lead: updated } = await api(`/api/admin/leads/${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value })
      });
      lead.status = updated.status;
      render();
    } catch (err) {
      select.value = previous;
      if (err instanceof AuthError) return showLogin('Your session has ended. Please sign in again.');
      dashError(err.message);
    }
  }

  async function removeLead(lead) {
    if (!window.confirm(`Delete the enquiry from ${lead.fullName}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/leads/${encodeURIComponent(lead.id)}`, { method: 'DELETE' });
      leads = leads.filter((l) => l.id !== lead.id);
      expanded.delete(lead.id);
      render();
    } catch (err) {
      if (err instanceof AuthError) return showLogin('Your session has ended. Please sign in again.');
      dashError(err.message);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    const form = $('loginForm');
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const body = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.elements.username.value.trim(), password: form.elements.password.value })
      });
      form.reset();
      await showDashboard(body.user);
    } catch (err) {
      showLogin(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }

  async function signOut() {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch (e) { /* cookie may already be gone */ }
    leads = [];
    expanded.clear();
    showLogin('');
  }

  /* ---------------- Boot ---------------- */

  async function init() {
    $('loginForm').addEventListener('submit', signIn);
    $('logoutBtn').addEventListener('click', signOut);
    $('refreshBtn').addEventListener('click', loadLeads);
    $('search').addEventListener('input', render);
    $('statusFilter').addEventListener('change', render);

    try {
      const session = await api('/api/admin/session');
      await showDashboard(session.user);
    } catch (e) {
      showLogin('');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
