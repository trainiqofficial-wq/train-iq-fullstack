const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const opt = require('../options');
const store = require('../db');
const analytics = require('../analytics');
const auth = require('../auth');
const { clean } = require('../validate');

const router = express.Router();

// Admin responses are private and should never be cached.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    if (!config.adminConfigured) {
      return res.status(503).json({
        error: 'Admin login is not set up on this server yet.'
      });
    }

    const { username, password } = req.body || {};

    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      password.length > 200
    ) {
      return res.status(400).json({
        error: 'Enter your username and password.'
      });
    }

    const ok = await auth.verifyCredentials(username, password);

    if (!ok) {
      return res.status(401).json({
        error: 'Incorrect username or password.'
      });
    }

    auth.startSession(res, config.adminUsername);
    res.json({ success: true, user: config.adminUsername });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  auth.endSession(res);
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  const session = auth.readSession(req);

  if (!session) {
    return res.status(401).json({ authenticated: false });
  }

  res.json({ authenticated: true, user: session.sub });
});

// Everything below this point requires a valid admin session.
router.use(auth.requireAdmin);

/* ---------------- Funnel analytics ---------------- */

// A non-submitting session is classified as a drop-off only after
// 30 minutes without recorded activity.
router.get('/analytics', async (req, res, next) => {
  try {
    const daysArg = Number(req.query.days);
    const days = Number.isInteger(daysArg)
      ? Math.max(1, Math.min(90, daysArg))
      : 30;

    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();

    const cutoffMs = Date.now() - 30 * 60 * 1000;

    const [sessionsRaw, eventsRaw] = await Promise.all([
      analytics.listSessions(since),
      analytics.listEvents(since, 100)
    ]);

    const sessions = sessionsRaw.filter((s) => s.first_seen_at >= since);

    const isSubmitted = (s) => Boolean(s.submitted_at);
    const isStarted = (s) => Boolean(s.flow_started_at);

    const isInactive = (s) => {
      const last = Date.parse(
        s.last_activity_at || s.first_seen_at || ''
      );
      return Number.isFinite(last) && last <= cutoffMs;
    };

    const startedSessions = sessions.filter(isStarted);
    const submittedSessions = sessions.filter(isSubmitted);

    const abandonedSessions = sessions.filter(
      (s) => isStarted(s) && !isSubmitted(s) && isInactive(s)
    );

    const activeIncomplete = sessions.filter(
      (s) => isStarted(s) && !isSubmitted(s) && !isInactive(s)
    );

    const stepNames = {
      1: 'Business details',
      2: 'Online goals',
      3: 'Contact details'
    };

    const steps = [1, 2, 3].map((step) => ({
      step,
      label: stepNames[step],
      reached: sessions.filter(
        (s) => Array.isArray(s.steps_reached) &&
          s.steps_reached.includes(step)
      ).length,
      inactiveDropoffs: abandonedSessions.filter(
        (s) => Number(s.last_step) === step
      ).length
    }));

    const countBy = (key, unknown = 'Direct / unknown') => {
      const counts = new Map();

      sessions.forEach((s) => {
        const fallback = key === 'utm_source'
          ? (s.referrer_host || '')
          : '';

        const value = String(s[key] || fallback).trim() || unknown;
        counts.set(value, (counts.get(value) || 0) + 1);
      });

      return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);
    };

    const eventNames = {
      link_opened: 'Link opened',
      flow_started: 'Flow started',
      step_view: 'Step viewed',
      field_interaction: 'Started filling',
      step_completed: 'Step completed',
      submit_attempt: 'Submit attempted',
      submit_failed: 'Submit failed',
      submitted: 'Submitted',
      activity: 'Active on page',
      page_hidden: 'Page hidden'
    };

    const recentSessions = [...sessions]
      .sort((a, b) =>
        Date.parse(b.last_activity_at || b.first_seen_at) -
        Date.parse(a.last_activity_at || a.first_seen_at)
      )
      .slice(0, 50)
      .map((s) => {
        let status = 'Opened · not started';

        if (isSubmitted(s)) {
          status = 'Submitted';
        } else if (isStarted(s) && isInactive(s)) {
          status = 'Dropped off · inactive 30m+';
        } else if (isStarted(s)) {
          status = 'In progress';
        }

        return {
          sessionId: s.session_id,
          firstSeenAt: s.first_seen_at,
          lastActivityAt: s.last_activity_at,
          flowStartedAt: s.flow_started_at,
          firstInteractionAt: s.first_interaction_at,
          submittedAt: s.submitted_at,
          lastStep: Number(s.last_step) || 0,
          stepsReached: Array.isArray(s.steps_reached)
            ? s.steps_reached
            : [],
          pagePath: s.page_path || '/',
          referrerHost: s.referrer_host || '',
          utmSource: s.utm_source || '',
          utmMedium: s.utm_medium || '',
          utmCampaign: s.utm_campaign || '',
          deviceType: s.device_type || 'unknown',
          lastEvent: eventNames[s.last_event] || s.last_event || '',
          eventCount: Number(s.event_count) || 0,
          status
        };
      });

    const recentEvents = eventsRaw.map((e) => ({
      occurredAt: e.occurred_at,
      sessionId: e.session_id,
      eventName: eventNames[e.event_name] || e.event_name,
      step: e.step || null,
      fieldName: e.field_name || ''
    }));

    res.json({
      periodDays: days,
      inactivityMinutes: 30,
      asOf: new Date().toISOString(),

      metrics: {
        opened: sessions.length,
        started: startedSessions.length,

        interacted: sessions.filter(
          (s) => Boolean(s.first_interaction_at)
        ).length,

        submitted: submittedSessions.length,
        abandoned: abandonedSessions.length,

        openedNoStart: sessions.filter(
          (s) => !isStarted(s)
        ).length,

        activeIncomplete: activeIncomplete.length,

        conversionRate: startedSessions.length
          ? Math.round(
              (submittedSessions.length / startedSessions.length) * 1000
            ) / 10
          : 0,

        submissionAttempts: sessions.reduce(
          (sum, s) => sum + (Number(s.submit_attempt_count) || 0),
          0
        ),

        submissionFailures: sessions.reduce(
          (sum, s) => sum + (Number(s.submit_failure_count) || 0),
          0
        ),

        fieldInteractions: sessions.reduce(
          (sum, s) => sum + (Number(s.field_interaction_count) || 0),
          0
        )
      },

      steps,
      sources: countBy('utm_source'),
      devices: countBy('device_type', 'Unknown'),
      recentSessions,
      recentEvents
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Existing lead management ---------------- */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) {
    return res.status(404).json({ error: 'Lead not found.' });
  }
  next();
});

function parseFilters(query) {
  const status = opt.STATUSES.includes(query.status) ? query.status : '';
  const q = clean(query.q, 100);
  return { status, q };
}

router.get('/leads', async (req, res, next) => {
  try {
    const leads = await store.listLeads(parseFilters(req.query));
    res.json({ leads });
  } catch (err) {
    next(err);
  }
});

// Neutralise spreadsheet formulas beginning with =, +, -, or @.
const csvCell = (value) => {
  let text = Array.isArray(value)
    ? value.join('; ')
    : String(value == null ? '' : value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
};

router.get('/leads/export.csv', async (req, res, next) => {
  try {
    const leads = await store.listLeads(parseFilters(req.query));
    const label = (list, id) => (id ? opt.labelOf(list, id) : '');

    const header = [
      'Reference', 'Date', 'Status', 'Full name', 'Mobile', 'Email',
      'Preferred contact', 'Business', 'Category', 'Location', 'Website',
      'Current channels', 'Wants to improve', 'Primary goal', 'Timeline'
    ];

    const rows = leads.map((l) => [
      l.leadRef,
      l.createdAt,
      l.status,
      l.fullName,
      l.mobileNumber,
      l.email,
      l.preferredContactMethod,
      l.businessName,
      l.businessCategory,
      l.businessLocation,
      l.businessWebsite,
      l.currentPresence.map((id) => label(opt.PRESENCE, id)),
      l.challenges.map((id) => label(opt.CHALLENGES, id)),
      label(opt.GOALS, l.primaryGoal),
      label(opt.TIMELINES, l.desiredTimeline)
    ]);

    const csv = [header, ...rows]
      .map((r) => r.map(csvCell).join(','))
      .join('\r\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition':
        `attachment; filename="trainiq-leads-${new Date().toISOString().slice(0, 10)}.csv"`
    });

    res.send('\uFEFF' + csv);
  } catch (err) {
    next(err);
  }
});

router.patch('/leads/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};

    if (!opt.STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const lead = await store.updateStatus(req.params.id, status);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

router.delete('/leads/:id', async (req, res, next) => {
  try {
    const removed = await store.deleteLead(req.params.id);

    if (!removed) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;