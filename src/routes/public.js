const express = require('express');
const rateLimit = require('express-rate-limit');
const opt = require('../options');
const store = require('../db');
const { validateLead } = require('../validate');
const { notifyNewLead } = require('../telegram');
const analytics = require('../analytics');

const router = express.Router();

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Analytics event limit reached.' }
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again in a few minutes.' }
});

// Public event collector. Field values and contact details are not recorded.
router.post('/analytics/event', analyticsLimiter, async (req, res) => {
  try {
    await analytics.record(req.body || {});
    res.status(202).json({ success: true });
  } catch (_) {
    res.status(400).json({ error: 'Invalid analytics event.' });
  }
});

// Choices used by the public form.
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
    // Honeypot: genuine visitors leave this hidden field empty.
    if (req.body && req.body.hp) {
      return res.status(201).json({ success: true });
    }

    const { errors, value } = validateLead(req.body);

    if (errors) {
      return res.status(400).json({
        error: 'Please check the highlighted fields.',
        fields: errors
      });
    }

    const lead = await store.insertLead(value);

    // Tracking must never prevent a valid lead from being saved.
    if (req.body && typeof req.body.analyticsSessionId === 'string') {
      try {
        await analytics.record({
          sessionId: req.body.analyticsSessionId,
          eventName: 'submitted',
          step: 3
        });
      } catch (_) {
        // Lead submission remains successful if analytics has an issue.
      }
    }

    // Telegram notification is best-effort.
    await notifyNewLead(lead);

    res.status(201).json({
      success: true,
      leadRef: lead.leadRef
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;