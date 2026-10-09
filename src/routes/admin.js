const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const opt = require('../options');
const store = require('../db');
const auth = require('../auth');
const { clean } = require('../validate');

const router = express.Router();

// Admin responses are private - never cache them.
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
      return res.status(503).json({ error: 'Admin login is not set up on this server yet.' });
    }
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 200) {
      return res.status(400).json({ error: 'Enter your username and password.' });
    }
    const ok = await auth.verifyCredentials(username, password);
    if (!ok) return res.status(401).json({ error: 'Incorrect username or password.' });

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
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: session.sub });
});

// ---- Everything below requires a valid admin session ----
router.use(auth.requireAdmin);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Lead not found.' });
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

// Spreadsheet apps run formulas that start with = + - @ - neutralise those.
const csvCell = (value) => {
  let text = Array.isArray(value) ? value.join('; ') : String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

router.get('/leads/export.csv', async (req, res, next) => {
  try {
    const leads = await store.listLeads(parseFilters(req.query));
    const label = (list, id) => (id ? opt.labelOf(list, id) : '');
    const header = [
      'Reference', 'Date', 'Status', 'Full name', 'Mobile', 'Email', 'Preferred contact',
      'Business', 'Category', 'Location', 'Website', 'Current channels', 'Wants to improve',
      'Primary goal', 'Timeline'
    ];
    const rows = leads.map((l) => [
      l.leadRef, l.createdAt, l.status, l.fullName, l.mobileNumber, l.email, l.preferredContactMethod,
      l.businessName, l.businessCategory, l.businessLocation, l.businessWebsite,
      l.currentPresence.map((id) => label(opt.PRESENCE, id)),
      l.challenges.map((id) => label(opt.CHALLENGES, id)),
      label(opt.GOALS, l.primaryGoal), label(opt.TIMELINES, l.desiredTimeline)
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="trainiq-leads-${new Date().toISOString().slice(0, 10)}.csv"`
    });
    res.send('\uFEFF' + csv); // BOM so Excel reads UTF-8 correctly
  } catch (err) {
    next(err);
  }
});

router.patch('/leads/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!opt.STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const lead = await store.updateStatus(req.params.id, status);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    res.json({ lead });
  } catch (err) {
    next(err);
  }
});

router.delete('/leads/:id', async (req, res, next) => {
  try {
    const removed = await store.deleteLead(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Lead not found.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
