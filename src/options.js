// Single source of truth for the funnel's choices.
// The server validates against these and the browser loads them from /api/options.

const CATEGORIES = [
  { id: 'retail', label: 'Retail Shop' },
  { id: 'restaurant', label: 'Restaurant & Cafe' },
  { id: 'realestate', label: 'Real Estate & Property' },
  { id: 'healthcare', label: 'Healthcare & Clinic' },
  { id: 'beauty', label: 'Beauty & Salon' },
  { id: 'professional', label: 'Professional Services' },
  { id: 'other', label: 'Other Business' }
];

const PRESENCE = [
  { id: 'website', label: 'Website' },
  { id: 'gbp', label: 'Google Business Profile' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'none', label: 'None of these yet' }
];

const CHALLENGES = [
  { id: 'google_visibility', label: 'Show up on Google Search' },
  { id: 'pro_website', label: 'A modern website' },
  { id: 'more_customers', label: 'Attract local customers' },
  { id: 'online_payments', label: 'Online orders & payments' },
  { id: 'whatsapp_automation', label: 'WhatsApp Business automation' },
  { id: 'reviews', label: 'More customer reviews' }
];

const GOALS = [
  { id: 'more_customers', label: 'Get more customers' },
  { id: 'increase_sales', label: 'Increase sales' },
  { id: 'strong_presence', label: 'Build a strong presence' }
];

const TIMELINES = [
  { id: 'asap', label: 'As soon as possible' },
  { id: '30days', label: 'Within 30 days' },
  { id: '3months', label: 'Within 3 months' }
];

const CONTACT_METHODS = ['WhatsApp', 'Phone Call', 'Email'];
const STATUSES = ['NEW', 'CONTACTED', 'CLOSED'];

const ids = (list) => list.map((o) => o.id);
const labelOf = (list, id) => (list.find((o) => o.id === id) || {}).label || id;

module.exports = {
  CATEGORIES, PRESENCE, CHALLENGES, GOALS, TIMELINES, CONTACT_METHODS, STATUSES, ids, labelOf
};
