const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function escapeHtml(value) {
  return String(value == null || value === '' ? 'Not provided' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyNewLead(lead) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[telegram] Notifications skipped: Telegram environment variables are missing.');
    return false;
  }

  const text = [
    '<b>🚀 New Train IQ Lead</b>',
    '',
    `<b>Reference:</b> ${escapeHtml(lead.leadRef)}`,
    `<b>Name:</b> ${escapeHtml(lead.fullName)}`,
    `<b>Phone:</b> ${escapeHtml(lead.mobileNumber)}`,
    `<b>Email:</b> ${escapeHtml(lead.email)}`,
    `<b>Business:</b> ${escapeHtml(lead.businessName)}`,
    `<b>Category:</b> ${escapeHtml(lead.businessCategory)}`,
    `<b>City / Location:</b> ${escapeHtml(lead.businessLocation)}`,
    `<b>Timeline:</b> ${escapeHtml(lead.desiredTimeline)}`,
    `<b>Contact preference:</b> ${escapeHtml(lead.preferredContactMethod)}`,
    '',
    '<a href="https://train-iq-fullstack.vercel.app/admin/">Open Train IQ Admin</a>'
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[telegram] Telegram API returned HTTP ${response.status}: ${body.slice(0, 300)}`);
      return false;
    }
    const result = await response.json();
    if (!result.ok) {
      console.error('[telegram] Telegram API did not accept the notification.');
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] Notification failed:', err.message);
    return false;
  }
}

module.exports = { notifyNewLead };
