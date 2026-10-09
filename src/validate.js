const opt = require('./options');

const clean = (v, max) =>
  String(v == null ? '' : v)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function normalizeUrl(raw) {
  const text = clean(raw, 200);
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function pickIds(value, allowed, max = 10) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === 'string' && allowed.includes(v)))].slice(0, max);
}

/**
 * Validate the raw request body from the public funnel.
 * Returns { errors } when invalid, or { value } with a clean lead object.
 */
function validateLead(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};

  const fullName = clean(b.fullName, 100);
  if (fullName.length < 2) errors.fullName = 'Enter your full name.';

  const mobileNumber = normalizePhone(b.mobileNumber);
  if (!mobileNumber) errors.mobileNumber = 'Enter a valid 10-digit Indian mobile number.';

  const email = clean(b.email, 150).toLowerCase();
  if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';

  const preferredContactMethod = opt.CONTACT_METHODS.includes(b.preferredContactMethod)
    ? b.preferredContactMethod
    : 'WhatsApp';

  const businessCategory = opt.ids(opt.CATEGORIES).includes(b.businessCategory) ? b.businessCategory : null;
  if (!businessCategory) errors.businessCategory = 'Pick a business category.';

  const customCategory = clean(b.customCategory, 80);
  const businessWebsite = normalizeUrl(b.businessWebsite);
  if (businessWebsite === null) errors.businessWebsite = 'Enter a valid website address.';

  if (Object.keys(errors).length) return { errors };

  const categoryLabel =
    businessCategory === 'other' && customCategory
      ? customCategory
      : opt.labelOf(opt.CATEGORIES, businessCategory);

  return {
    value: {
      fullName,
      mobileNumber,
      email,
      preferredContactMethod,
      businessName: clean(b.businessName, 120),
      businessCategory: categoryLabel,
      businessLocation: clean(b.businessLocation, 120),
      businessWebsite,
      currentPresence: pickIds(b.currentPresence, opt.ids(opt.PRESENCE)),
      challenges: pickIds(b.challenges, opt.ids(opt.CHALLENGES)),
      primaryGoal: opt.ids(opt.GOALS).includes(b.primaryGoal) ? b.primaryGoal : '',
      desiredTimeline: opt.ids(opt.TIMELINES).includes(b.desiredTimeline) ? b.desiredTimeline : ''
    }
  };
}

module.exports = { validateLead, clean };
