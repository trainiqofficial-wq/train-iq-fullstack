'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const EVENT_NAMES = new Set([
  'link_opened',
  'flow_started',
  'step_view',
  'field_interaction',
  'step_completed',
  'submit_attempt',
  'submit_failed',
  'submitted',
  'activity',
  'page_hidden'
]);

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value, max = 120) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
    : '';
}

function normalizeContext(input) {
  const c = input && typeof input === 'object' ? input : {};
  const width = Number(c.viewportWidth);

  return {
    page_path: cleanText(c.pagePath, 180).split('?')[0] || '/',
    referrer_host: cleanText(c.referrerHost, 180),
    utm_source: cleanText(c.utmSource, 100),
    utm_medium: cleanText(c.utmMedium, 100),
    utm_campaign: cleanText(c.utmCampaign, 100),
    device_type: ['mobile', 'tablet', 'desktop'].includes(c.deviceType)
      ? c.deviceType
      : 'unknown',
    viewport_width: Number.isFinite(width)
      ? Math.max(0, Math.min(10000, Math.round(width)))
      : null,
    language: cleanText(c.language, 35),
    timezone: cleanText(c.timezone, 80)
  };
}

function eventRecord(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid analytics event.');
  }

  const sessionId = cleanText(input.sessionId, 40);

  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error('Invalid session ID.');
  }

  if (!EVENT_NAMES.has(input.eventName)) {
    throw new Error('Invalid event name.');
  }

  const stepNum = Number(input.step);
  const step = Number.isInteger(stepNum) && stepNum >= 0 && stepNum <= 3
    ? stepNum
    : 0;

  const fieldName =
    /^[a-zA-Z0-9_-]{1,80}$/.test(String(input.fieldName || ''))
      ? String(input.fieldName)
      : '';

  return {
    sessionId,
    eventName: input.eventName,
    step,
    fieldName,
    context: input.eventName === 'link_opened'
      ? normalizeContext(input.context)
      : null
  };
}

function sessionFromEvent(previous, evt, now) {
  const old = previous || {};
  const context = evt.context || {};
  const steps = new Set(Array.isArray(old.steps_reached) ? old.steps_reached : []);

  if (
    evt.step > 0 &&
    [
      'step_view',
      'field_interaction',
      'step_completed',
      'submit_attempt',
      'submitted'
    ].includes(evt.eventName)
  ) {
    steps.add(evt.step);
  }

  return {
    session_id: evt.sessionId,
    first_seen_at: old.first_seen_at || now,
    last_activity_at: now,

    flow_started_at:
      old.flow_started_at ||
      (evt.eventName === 'flow_started' ? now : null),

    first_interaction_at:
      old.first_interaction_at ||
      (evt.eventName === 'field_interaction' ? now : null),

    submitted_at:
      old.submitted_at ||
      (evt.eventName === 'submitted' ? now : null),

    last_step: Math.max(Number(old.last_step) || 0, evt.step),
    steps_reached: [...steps].sort((a, b) => a - b),

    page_path: context.page_path || old.page_path || '/',
    referrer_host: context.referrer_host || old.referrer_host || '',
    utm_source: context.utm_source || old.utm_source || '',
    utm_medium: context.utm_medium || old.utm_medium || '',
    utm_campaign: context.utm_campaign || old.utm_campaign || '',
    device_type: context.device_type || old.device_type || 'unknown',
    viewport_width: context.viewport_width ?? old.viewport_width ?? null,
    language: context.language || old.language || '',
    timezone: context.timezone || old.timezone || '',

    last_event: evt.eventName,
    event_count: (Number(old.event_count) || 0) + 1,

    field_interaction_count:
      (Number(old.field_interaction_count) || 0) +
      (evt.eventName === 'field_interaction' ? 1 : 0),

    submit_attempt_count:
      (Number(old.submit_attempt_count) || 0) +
      (evt.eventName === 'submit_attempt' ? 1 : 0),

    submit_failure_count:
      (Number(old.submit_failure_count) || 0) +
      (evt.eventName === 'submit_failed' ? 1 : 0),

    submission_count:
      (Number(old.submission_count) || 0) +
      (evt.eventName === 'submitted' && !old.submitted_at ? 1 : 0)
  };
}

function createSupabaseStore() {
  const { createClient } = require('@supabase/supabase-js');

  const client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return {
    mode: 'supabase',

    async record(input) {
      const evt = eventRecord(input);
      const now = new Date().toISOString();

      const { data: previous, error: readError } = await client
        .from('funnel_sessions')
        .select('*')
        .eq('session_id', evt.sessionId)
        .maybeSingle();

      if (readError) throw readError;

      const row = sessionFromEvent(previous, evt, now);

      const { error: upsertError } = await client
        .from('funnel_sessions')
        .upsert(row, { onConflict: 'session_id' });

      if (upsertError) throw upsertError;

      const { error: eventError } = await client
        .from('funnel_events')
        .insert({
          session_id: evt.sessionId,
          event_name: evt.eventName,
          step: evt.step || null,
          field_name: evt.fieldName || null,
          metadata: {}
        });

      if (eventError) throw eventError;

      return { success: true };
    },

    async listSessions(since) {
      const { data, error } = await client
        .from('funnel_sessions')
        .select('*')
        .gte('first_seen_at', since)
        .order('first_seen_at', { ascending: false })
        .limit(5000);

      if (error) throw error;
      return data || [];
    },

    async listEvents(since, limit = 100) {
      const { data, error } = await client
        .from('funnel_events')
        .select('id,session_id,event_name,step,field_name,occurred_at')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    }
  };
}

function createFileStore() {
  const file = path.join(process.cwd(), 'data', 'analytics.json');
  let queue = Promise.resolve();

  const read = async () => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { sessions: {}, events: [] };
      }
      throw err;
    }
  };

  const write = async (db) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(db, null, 2));
  };

  const exclusive = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  return {
    mode: 'file',

    record(input) {
      return exclusive(async () => {
        const evt = eventRecord(input);
        const db = await read();
        const now = new Date().toISOString();

        db.sessions[evt.sessionId] = sessionFromEvent(
          db.sessions[evt.sessionId],
          evt,
          now
        );

        db.events.unshift({
          id: crypto.randomUUID(),
          session_id: evt.sessionId,
          event_name: evt.eventName,
          step: evt.step || null,
          field_name: evt.fieldName || null,
          occurred_at: now
        });

        db.events = db.events.slice(0, 20000);
        await write(db);

        return { success: true };
      });
    },

    async listSessions(since) {
      const db = await read();

      return Object.values(db.sessions)
        .filter((s) => s.first_seen_at >= since)
        .sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at))
        .slice(0, 5000);
    },

    async listEvents(since, limit = 100) {
      const db = await read();

      return db.events
        .filter((e) => e.occurred_at >= since)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .slice(0, limit);
    }
  };
}

const analyticsStore = config.hasSupabase
  ? createSupabaseStore()
  : createFileStore();

console.log(`[analytics] using ${analyticsStore.mode} store`);

module.exports = {
  ...analyticsStore,
  EVENT_NAMES,
  SESSION_ID_RE
};