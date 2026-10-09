const express = require('express');
const rateLimit = require('express-rate-limit');
const opt = require('../options');
const store = require('../db');
const { validateLead } = require('../validate');

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again in a few minutes.' }
});

// Choices that drive the funnel UI (kept in sync with server validation).
router.get('/options', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    categories: opt.CATEGORIES,
    presence: opt.PRESENCE,
    challenges: opt.CHALLENGES,
    goals: opt.GOALS,
    timelines: opt.TIMELINES,
    contactMethods: opt.CONTACT_METHODS
  });
});

router.post('/leads', submitLimiter, async (req, res, next) => {
  try {
    // Honeypot: real visitors never fill this hidden field. Pretend success to bots.
    if (req.body && req.body.hp) return res.status(201).json({ success: true });

    const { errors, value } = validateLead(req.body);
    if (errors) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });

    const lead = await store.insertLead(value);
    res.status(201).json({ success: true, leadRef: lead.leadRef });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
