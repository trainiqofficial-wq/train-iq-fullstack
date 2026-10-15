(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /** Small DOM helper. User-provided text is inserted as text nodes. */
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

  const svgIcon = (inner) => {
    const wrap = document.createElement('span');
    wrap.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    return wrap.firstChild;
  };

  // Trusted static icon markup.
  const CATEGORY_ICONS = {
    retail: '<path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>',
    restaurant: '<path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>',
    realestate: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>',
    healthcare: '<path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>',
    beauty: '<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>',
    professional: '<path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
    other: '<path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>'
  };
  const CHECK = '<path d="M5 13l4 4L19 7" stroke-width="3"/>';

  const LAST_FORM_STEP = 3;

  const state = {
    step: 0,
    options: null,
    data: {
      category: null,
      customCategory: '',
      bizName: '',
      bizLocation: '',
      bizWebsite: '',
      presence: [],
      challenges: [],
      goal: 'more_customers',
      timeline: '30days'
    }
  };

  const labelOf = (list, id) =>
    (list.find((o) => o.id === id) || {}).label || id;

  // Anonymous funnel tracking. No typed values or contact details are sent.
  function createSessionId() {
    try {
      let id = sessionStorage.getItem('trainiq_funnel_session');
      if (!id) {
        id = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        sessionStorage.setItem('trainiq_funnel_session', id);
      }
      return id;
    } catch (_) {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }
  }

  const analytics = {
    sessionId: createSessionId(),
    queue: Promise.resolve(),
    trackedFields: new Set(),
    lastActivityAt: 0
  };

  function analyticsContext() {
    const params = new URLSearchParams(window.location.search);
    let referrerHost = '';
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : '';
    } catch (_) {}

    return {
      pagePath: window.location.pathname,
      referrerHost,
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
      deviceType: window.innerWidth < 768
        ? 'mobile'
        : (window.innerWidth < 1100 ? 'tablet' : 'desktop'),
      viewportWidth: Math.min(Number(window.innerWidth) || 0, 10000),
      language: (navigator.language || '').slice(0, 35),
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 80)
    };
  }

  function trackEvent(eventName, step, details = {}) {
    const payload = {
      sessionId: analytics.sessionId,
      eventName,
      step: Number.isInteger(step) ? step : 0,
      ...details
    };
    if (eventName === 'link_opened') payload.context = analyticsContext();

    analytics.queue = analytics.queue.catch(() => {}).then(() =>
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: 'same-origin'
      })
    ).then(() => undefined).catch(() => undefined);

    return analytics.queue;
  }

  function trackInteraction(fieldName) {
    if (!fieldName || analytics.trackedFields.has(fieldName)) return;
    analytics.trackedFields.add(fieldName);
    trackEvent('field_interaction', state.step, {
      fieldName: String(fieldName).slice(0, 80)
    });
  }

  /* ---------------- Three-step navigation ---------------- */

  function showStep(n) {
    state.step = n;
    document.querySelectorAll('.step').forEach((s) => (s.hidden = true));

    const panel = $('step' + n);
    if (!panel) return;

    panel.hidden = false;

    const inForm = n >= 1 && n <= LAST_FORM_STEP;
    $('progress').hidden = !inForm;
    $('footerNav').hidden = !(n === 1 || n === 2);

    if (inForm) {
      const pct = Math.round((n / LAST_FORM_STEP) * 100);
      $('progressBar').style.width = pct + '%';
      $('progressPercent').textContent = pct + '%';
      $('nextBtn').textContent = n === 1 ? 'Continue' : 'Continue to contact';
    }

    clearHint();
    window.scrollTo({ top: 0, behavior: 'auto' });

    const heading = panel.querySelector('h1, h2, h3');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }

    if (inForm) trackEvent('step_view', n);
  }

  function hint(message) {
    clearHint();
    $('step' + state.step).append(
      el('p', { class: 'field-error step-hint', role: 'alert', text: message })
    );
  }

  const clearHint = () =>
    document.querySelectorAll('.step-hint').forEach((n) => n.remove());

  function normalizeWebsite(raw) {
    const text = raw.trim();
    if (!text) return '';

    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
        return null;
      }
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  function next() {
    const d = state.data;

    if (state.step === 1) {
      if (!d.category) return hint('Pick a business category to continue.');

      d.customCategory = $('customCategory').value.trim();
      if (d.category === 'other' && !d.customCategory) {
        $('customCategory').focus();
        return hint('Tell us what type of business you run.');
      }

      d.bizName = $('bizName').value.trim();
      d.bizLocation = $('bizLocation').value.trim();

      const site = normalizeWebsite($('bizWebsite').value);
      $('bizWebsite').setAttribute('aria-invalid', String(site === null));
      $('bizWebsiteError').textContent =
        site === null ? 'Enter a valid website, like yourbusiness.com' : '';

      if (site === null) return $('bizWebsite').focus();
      d.bizWebsite = site;
    }

    if (state.step < LAST_FORM_STEP) {
      trackEvent('step_completed', state.step);
      showStep(state.step + 1);
    }
  }

  function back() {
    if (state.step > 1 && state.step <= LAST_FORM_STEP) {
      showStep(state.step - 1);
    }
  }

  /* ---------------- Choice grids ---------------- */

  function renderChoices(container, list, { selected, onChange, render }) {
    container.replaceChildren();

    list.forEach((item) => {
      const btn = el('button', {
        type: 'button',
        class: 'choice',
        'data-id': item.id,
        'aria-pressed': 'false'
      });
      btn.append(render(item));
      btn.addEventListener('click', () => onChange(item.id));
      container.append(btn);
    });

    syncChoices(container, selected());
  }

  function syncChoices(container, selectedIds) {
    const chosen = new Set([].concat(selectedIds));
    container.querySelectorAll('.choice').forEach((b) =>
      b.setAttribute('aria-pressed', String(chosen.has(b.dataset.id)))
    );
  }

  const checkRow = (item) =>
    el(
      'span',
      { class: 'choice-check' },
      el('span', { class: 'choice-box' }, svgIcon(CHECK)),
      el('span', { class: 'choice-label', text: item.label })
    );

  const plainLabel = (item) =>
    el('span', { class: 'choice-label', text: item.label });

  function toggleIn(list, id) {
    const i = list.indexOf(id);
    if (i === -1) list.push(id);
    else list.splice(i, 1);
  }

  function renderAllChoices() {
    const o = state.options;
    const d = state.data;

    renderChoices($('categoryGrid'), o.categories, {
      selected: () => d.category,
      render: (c) => el(
        'span',
        { class: 'choice-cat' },
        el('span', { class: 'choice-icon' },
          svgIcon(CATEGORY_ICONS[c.id] || CATEGORY_ICONS.other)),
        el('span', { class: 'choice-label', text: c.label })
      ),
      onChange: (id) => {
        d.category = id;
        syncChoices($('categoryGrid'), id);
        $('customCategoryWrap').hidden = id !== 'other';
        clearHint();
        if (id === 'other') $('customCategory').focus();
      }
    });

    renderChoices($('presenceGrid'), o.presence, {
      selected: () => d.presence,
      render: checkRow,
      onChange: (id) => {
        if (id === 'none') {
          d.presence = d.presence.includes('none') ? [] : ['none'];
        } else {
          d.presence = d.presence.filter((p) => p !== 'none');
          toggleIn(d.presence, id);
        }
        syncChoices($('presenceGrid'), d.presence);
      }
    });

    renderChoices($('challengesGrid'), o.challenges, {
      selected: () => d.challenges,
      render: checkRow,
      onChange: (id) => {
        toggleIn(d.challenges, id);
        syncChoices($('challengesGrid'), d.challenges);
      }
    });

    renderChoices($('goalsGrid'), o.goals, {
      selected: () => d.goal,
      render: plainLabel,
      onChange: (id) => {
        d.goal = id;
        syncChoices($('goalsGrid'), id);
      }
    });

    renderChoices($('timelineGrid'), o.timelines, {
      selected: () => d.timeline,
      render: plainLabel,
      onChange: (id) => {
        d.timeline = id;
        syncChoices($('timelineGrid'), id);
      }
    });
  }

  /* ---------------- Lead submission ---------------- */

  function setFieldErrors(fields) {
    document.querySelectorAll('[data-error-for]').forEach((p) => {
      const msg = fields && fields[p.dataset.errorFor];
      p.textContent = msg || '';

      const input = $('leadForm').elements[p.dataset.errorFor];
      if (input) input.setAttribute('aria-invalid', String(Boolean(msg)));
    });
  }

  function showFormError(message) {
    const box = $('formError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  async function submitLead(event) {
    event.preventDefault();

    const form = $('leadForm');
    const d = state.data;

    setFieldErrors(null);
    showFormError('');

    const payload = {
      analyticsSessionId: analytics.sessionId,
      fullName: form.elements.fullName.value,
      mobileNumber: form.elements.mobileNumber.value,
      email: form.elements.email.value,
      preferredContactMethod: form.elements.preferredContactMethod.value,
      hp: form.elements.hp.value,
      businessName: d.bizName,
      businessCategory: d.category,
      customCategory: d.customCategory,
      businessLocation: d.bizLocation,
      businessWebsite: d.bizWebsite,
      currentPresence: d.presence,
      challenges: d.challenges,
      primaryGoal: d.goal,
      desiredTimeline: d.timeline
    };

    trackEvent('submit_attempt', 3);

    const btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      await analytics.queue;

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (body.fields) setFieldErrors(body.fields);
        trackEvent('submit_failed', 3);
        showFormError(body.error || 'We could not send your enquiry. Please try again.');

        const firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }

      $('successRef').hidden = !body.leadRef;
      $('successRefCode').textContent = body.leadRef || '';
      showStep(4);
    } catch (_) {
      trackEvent('submit_failed', 3);
      showFormError('Network problem. Check your connection and try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send my enquiry';
    }
  }

  /* ---------------- Reset ---------------- */

  function resetAll() {
    Object.assign(state.data, {
      category: null,
      customCategory: '',
      bizName: '',
      bizLocation: '',
      bizWebsite: '',
      presence: [],
      challenges: [],
      goal: 'more_customers',
      timeline: '30days'
    });

    ['customCategory', 'bizName', 'bizLocation', 'bizWebsite'].forEach((id) => {
      $(id).value = '';
    });

    $('bizWebsite').removeAttribute('aria-invalid');
    $('bizWebsiteError').textContent = '';
    $('customCategoryWrap').hidden = true;

    $('leadForm').reset();
    setFieldErrors(null);
    showFormError('');

    if (state.options) renderAllChoices();
    showStep(0);
  }

  /* ---------------- Ambient background ---------------- */

  function initCanvas() {
    const canvas = $('ambientCanvas');
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    const dots = Array.from({ length: 35 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 1,
      c: Math.random() > 0.5 ? '#00f2fe' : '#8a2be2'
    }));

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.55;

      dots.forEach((p) => {
        if (!still) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.fill();
      });

      if (!still) requestAnimationFrame(frame);
    };

    frame();
  }

  /* ---------------- Boot ---------------- */

  async function init() {
    $('year').textContent = new Date().getFullYear();
    initCanvas();

    $('homeBtn').addEventListener('click', resetAll);
    $('restartBtn').addEventListener('click', resetAll);
    $('startBtn').addEventListener('click', () => {
      trackEvent('flow_started', 1);
      showStep(1);
    });
    $('nextBtn').addEventListener('click', next);
    $('backBtn').addEventListener('click', back);
    $('backToStep2').addEventListener('click', () => showStep(2));
    $('leadForm').addEventListener('submit', submitLead);

    // Enter advances from step 1, but does not unexpectedly submit step 3.
    ['customCategory', 'bizName', 'bizLocation', 'bizWebsite'].forEach((id) => {
      $(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && state.step === 1) {
          e.preventDefault();
          next();
        }
      });
    });

    $('leadPhone').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^\d+\s]/g, '');
    });

    // Track only field identifiers, never values entered by visitors.
    document.addEventListener('input', (event) => {
      const target = event.target;
      if (target && target.id && target.id !== 'hp' &&
          target.closest('#step1, #step3')) {
        trackInteraction(target.id);
      }
    });

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (target && target.id && target.id !== 'hp' &&
          target.closest('#step1, #step3')) {
        trackInteraction(target.id);
      }
    });

    document.addEventListener('click', (event) => {
      const choice = event.target.closest && event.target.closest('.choice');
      if (choice && choice.parentElement) {
        trackInteraction(choice.parentElement.id || 'choice');
      }
    });

    document.addEventListener('pointerdown', () => {
      const now = Date.now();
      if (now - analytics.lastActivityAt > 20000) {
        analytics.lastActivityAt = now;
        trackEvent('activity', state.step);
      }
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        trackEvent('page_hidden', state.step);
      }
    });

    trackEvent('link_opened', 0);

    const start = $('startBtn');
    start.disabled = true;

    try {
      const res = await fetch('/api/options');
      if (!res.ok) throw new Error('options ' + res.status);

      state.options = await res.json();
      renderAllChoices();
      start.disabled = false;
    } catch (_) {
      start.disabled = true;
      $('step0').append(el('p', {
        class: 'field-error',
        role: 'alert',
        text: "We couldn't load the form. Please refresh the page."
      }));
    }

    showStep(0);
  }

  document.addEventListener('DOMContentLoaded', init);
})();