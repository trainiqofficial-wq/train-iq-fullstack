(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /** Tiny DOM helper. Text goes in as text nodes, so user input can never become markup. */
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

  // Static, trusted icon markup (never built from user data).
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

  const LAST_FORM_STEP = 5;

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

  const labelOf = (list, id) => (list.find((o) => o.id === id) || {}).label || id;

  /* ---------------- Navigation ---------------- */

  function showStep(n) {
    state.step = n;
    document.querySelectorAll('.step').forEach((s) => (s.hidden = true));
    const panel = $('step' + n);
    panel.hidden = false;

    const inForm = n >= 1 && n <= LAST_FORM_STEP;
    $('progress').hidden = !inForm;
    $('footerNav').hidden = !inForm;
    if (inForm) {
      const pct = Math.round((n / LAST_FORM_STEP) * 100);
      $('progressBar').style.width = pct + '%';
      $('progressPercent').textContent = pct + '%';
      $('nextBtn').textContent = n === LAST_FORM_STEP ? 'See my roadmap' : 'Continue';
    }
    clearHint();
    window.scrollTo({ top: 0 });
    const heading = panel.querySelector('h1, h2, h3');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  function hint(message) {
    clearHint();
    $('step' + state.step).append(el('p', { class: 'field-error step-hint', role: 'alert', text: message }));
  }
  const clearHint = () => document.querySelectorAll('.step-hint').forEach((n) => n.remove());

  function normalizeWebsite(raw) {
    const text = raw.trim();
    if (!text) return '';
    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
      return url.toString();
    } catch (e) {
      return null;
    }
  }

  function next() {
    const d = state.data;

    if (state.step === 1) {
      if (!d.category) return hint('Pick a business category to continue.');
      d.customCategory = $('customCategory').value.trim();
      if (d.category === 'other' && !d.customCategory) return hint('Tell us what type of business you run.');
    }

    if (state.step === 2) {
      d.bizName = $('bizName').value.trim();
      d.bizLocation = $('bizLocation').value.trim();
      const site = normalizeWebsite($('bizWebsite').value);
      $('bizWebsite').setAttribute('aria-invalid', String(site === null));
      $('bizWebsiteError').textContent = site === null ? 'Enter a valid website, like yourbusiness.com' : '';
      if (site === null) return $('bizWebsite').focus();
      d.bizWebsite = site;
    }

    if (state.step === LAST_FORM_STEP) return runAnalysis();
    showStep(state.step + 1);
  }

  function back() {
    if (state.step > 1) showStep(state.step - 1);
  }

  /* ---------------- Choice grids ---------------- */

  function renderChoices(container, list, { multi, selected, onChange, render }) {
    container.replaceChildren();
    list.forEach((item) => {
      const btn = el('button', { type: 'button', class: 'choice', 'data-id': item.id, 'aria-pressed': 'false' });
      btn.append(render(item));
      btn.addEventListener('click', () => onChange(item.id));
      container.append(btn);
    });
    syncChoices(container, selected());
  }

  function syncChoices(container, selectedIds) {
    const chosen = new Set([].concat(selectedIds));
    container.querySelectorAll('.choice').forEach((b) => b.setAttribute('aria-pressed', String(chosen.has(b.dataset.id))));
  }

  const checkRow = (item) =>
    el('span', { class: 'choice-check' }, el('span', { class: 'choice-box' }, svgIcon(CHECK)), el('span', { class: 'choice-label', text: item.label }));

  const plainLabel = (item) => el('span', { class: 'choice-label', text: item.label });

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
      render: (c) =>
        el('span', { class: 'choice-cat' }, el('span', { class: 'choice-icon' }, svgIcon(CATEGORY_ICONS[c.id] || CATEGORY_ICONS.other)), el('span', { class: 'choice-label', text: c.label })),
      onChange: (id) => {
        d.category = id;
        syncChoices($('categoryGrid'), id);
        $('customCategoryWrap').hidden = id !== 'other';
        clearHint();
        if (id === 'other') $('customCategory').focus();
        else setTimeout(next, 250);
      }
    });

    renderChoices($('presenceGrid'), o.presence, {
      selected: () => d.presence,
      render: checkRow,
      onChange: (id) => {
        if (id === 'none') d.presence = d.presence.includes('none') ? [] : ['none'];
        else {
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

  /* ---------------- Personalised roadmap ---------------- */

  const CHALLENGE_PLANS = {
    google_visibility: 'Local SEO: rank on Google Maps and Search for the services people near you look for.',
    pro_website: 'A conversion-focused website with clear offers, enquiry forms and one-tap calling.',
    more_customers: 'Local lead campaigns on Google and Instagram aimed at your service area.',
    online_payments: 'Online orders and UPI or card payments, so customers can buy without calling.',
    whatsapp_automation: 'WhatsApp Business automation: instant replies, bookings and follow-ups.',
    reviews: 'A simple review system that asks every happy customer and replies to every review.'
  };

  const GOAL_PLANS = {
    more_customers: {
      title: 'Phase 3: Turn attention into customers',
      text: 'Make every enquiry easy to answer and easy to measure.',
      items: ['Track enquiries by source so you know which channel works', 'Follow up every lead within minutes on WhatsApp', 'Retarget people who visited but did not enquire']
    },
    increase_sales: {
      title: 'Phase 3: Grow revenue per customer',
      text: 'Get more value from the customers you already win.',
      items: ['Offers and bundles promoted on WhatsApp and Instagram', 'Repeat-customer reminders and loyalty nudges', 'A simple monthly sales and enquiry report']
    },
    strong_presence: {
      title: 'Phase 3: Become the name people trust',
      text: 'Show up consistently everywhere customers look.',
      items: ['One brand look across website, Google and social', 'A light monthly content plan you can actually keep up', 'Photos, short videos and customer stories that build trust']
    }
  };

  const TIMELINE_NOTES = {
    asap: 'You want to move fast, so start Phase 1 this week.',
    '30days': 'This fits a focused 30-day sprint: foundation in the first two weeks, then growth.',
    '3months': 'Spread over three months, each phase gets time to build on the last.'
  };

  function buildRoadmap(d, o) {
    const has = new Set(d.presence);
    const foundation = [];
    if (!has.has('website')) foundation.push('Launch a fast, mobile-friendly website.');
    else if (d.challenges.includes('pro_website')) foundation.push('Rebuild your website for speed, clarity and enquiries.');
    if (!has.has('gbp')) foundation.push('Claim and verify your Google Business Profile so you appear on Maps.');
    if (!has.has('whatsapp')) foundation.push('Set up WhatsApp Business with a catalogue and quick replies.');
    if (!has.has('instagram')) foundation.push('Create a business Instagram profile with a consistent look.');
    if (!foundation.length) foundation.push('Audit your existing channels so your name, address and phone match everywhere.');

    const focus = d.challenges.map((id) => CHALLENGE_PLANS[id]).filter(Boolean);
    const goalLabel = labelOf(o.goals, d.goal).toLowerCase();

    const phases = [
      {
        title: 'Phase 1: Digital foundation',
        text: 'The basics that make you easy to find and easy to contact.',
        items: foundation.slice(0, 4)
      },
      focus.length
        ? { title: 'Phase 2: What you asked for', text: 'Built around the improvements you picked.', items: focus.slice(0, 4) }
        : { title: 'Phase 2: Customer acquisition', text: `Focused on your goal to ${goalLabel}.`, items: [CHALLENGE_PLANS.more_customers, CHALLENGE_PLANS.whatsapp_automation] },
      GOAL_PLANS[d.goal] || GOAL_PLANS.more_customers
    ];

    const categoryLabel = d.category === 'other' && d.customCategory ? d.customCategory : labelOf(o.categories, d.category);
    return { phases, categoryLabel, timelineNote: TIMELINE_NOTES[d.timeline] || '' };
  }

  function renderRoadmap() {
    const d = state.data;
    const plan = buildRoadmap(d, state.options);
    const name = d.bizName || 'your business';

    const summary = $('roadmapSummary');
    summary.replaceChildren(
      'A plan for ',
      el('strong', { text: name }),
      ` (${plan.categoryLabel}${d.bizLocation ? ', ' + d.bizLocation : ''}). ${plan.timelineNote}`
    );

    $('phases').replaceChildren(
      ...plan.phases.map((p) =>
        el('article', { class: 'phase' }, el('h4', { text: p.title }), el('p', { text: p.text }), el('ul', {}, p.items.map((t) => el('li', { text: t }))))
      )
    );
  }

  function runAnalysis() {
    $('analysisHeader').textContent = state.data.bizName ? `Building a roadmap for ${state.data.bizName}...` : 'Building your roadmap...';
    showStep(6);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 2000;
    setTimeout(() => {
      renderRoadmap();
      showStep(7);
    }, delay);
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

    const btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.fields) setFieldErrors(body.fields);
        showFormError(body.error || 'We could not send your enquiry. Please try again.');
        const firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }
      $('successRef').hidden = !body.leadRef;
      $('successRefCode').textContent = body.leadRef || '';
      showStep(9);
    } catch (err) {
      showFormError('Network problem. Check your connection and try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send my enquiry';
    }
  }

  /* ---------------- Reset ---------------- */

  function resetAll() {
    Object.assign(state.data, {
      category: null, customCategory: '', bizName: '', bizLocation: '', bizWebsite: '',
      presence: [], challenges: [], goal: 'more_customers', timeline: '30days'
    });
    ['customCategory', 'bizName', 'bizLocation', 'bizWebsite'].forEach((id) => ($(id).value = ''));
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
    let w = 0, h = 0;
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    const dots = Array.from({ length: 35 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 1, c: Math.random() > 0.5 ? '#00f2fe' : '#8a2be2'
    }));

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.55;
      dots.forEach((p) => {
        if (!still) {
          p.x += p.vx; p.y += p.vy;
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
    $('startBtn').addEventListener('click', () => showStep(1));
    $('nextBtn').addEventListener('click', next);
    $('backBtn').addEventListener('click', back);
    $('toLeadBtn').addEventListener('click', () => showStep(8));
    $('backToRoadmap').addEventListener('click', () => showStep(7));
    $('leadForm').addEventListener('submit', submitLead);

    // Enter advances on the text steps.
    ['customCategory', 'bizName', 'bizLocation', 'bizWebsite'].forEach((id) =>
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } })
    );
    // Keep the phone field to digits and an optional +91 prefix.
    $('leadPhone').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^\d+\s]/g, ''); });

    const start = $('startBtn');
    start.disabled = true;
    try {
      const res = await fetch('/api/options');
      if (!res.ok) throw new Error('options ' + res.status);
      state.options = await res.json();
      renderAllChoices();
      start.disabled = false;
    } catch (err) {
      start.disabled = true;
      $('step0').append(el('p', { class: 'field-error', role: 'alert', text: "We couldn't load the form. Please refresh the page." }));
    }
    showStep(0);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
