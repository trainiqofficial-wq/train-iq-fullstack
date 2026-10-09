const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

// ---------- helpers: API shape <-> database row ----------

const makeLeadRef = () => 'IQ-' + crypto.randomBytes(4).toString('hex').toUpperCase();

function toRow(lead) {
  return {
    lead_id: lead.leadRef,
    full_name: lead.fullName,
    mobile_number: lead.mobileNumber,
    email: lead.email || null,
    business_name: lead.businessName || null,
    business_category: lead.businessCategory || null,
    business_location: lead.businessLocation || null,
    business_website: lead.businessWebsite || null,
    current_presence: lead.currentPresence || [],
    challenges: lead.challenges || [],
    primary_goal: lead.primaryGoal || null,
    desired_timeline: lead.desiredTimeline || null,
    preferred_contact_method: lead.preferredContactMethod || null,
    status: 'NEW'
  };
}

function fromRow(r) {
  return {
    id: r.id,
    leadRef: r.lead_id,
    createdAt: r.created_at,
    fullName: r.full_name,
    mobileNumber: r.mobile_number,
    email: r.email || '',
    businessName: r.business_name || '',
    businessCategory: r.business_category || '',
    businessLocation: r.business_location || '',
    businessWebsite: r.business_website || '',
    currentPresence: r.current_presence || [],
    challenges: r.challenges || [],
    primaryGoal: r.primary_goal || '',
    desiredTimeline: r.desired_timeline || '',
    preferredContactMethod: r.preferred_contact_method || '',
    status: r.status
  };
}

function matchesSearch(lead, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [lead.fullName, lead.mobileNumber, lead.email, lead.businessName, lead.businessCategory, lead.businessLocation, lead.leadRef]
    .some((v) => String(v || '').toLowerCase().includes(needle));
}

const LIST_LIMIT = 1000;

// ---------- Supabase store ----------

function createSupabaseStore() {
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const table = () => client.from('leads');

  return {
    mode: 'supabase',

    async insertLead(lead) {
      const row = toRow({ ...lead, leadRef: makeLeadRef() });
      const { data, error } = await table().insert(row).select().single();
      if (error) throw error;
      return fromRow(data);
    },

    async listLeads({ status, q } = {}) {
      let query = table().select('*').order('created_at', { ascending: false }).limit(LIST_LIMIT);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(fromRow).filter((l) => matchesSearch(l, q));
    },

    async updateStatus(id, status) {
      const { data, error } = await table().update({ status }).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return data ? fromRow(data) : null;
    },

    async deleteLead(id) {
      const { data, error } = await table().delete().eq('id', id).select('id');
      if (error) throw error;
      return data.length > 0;
    }
  };
}

// ---------- JSON file store (development only) ----------

function createFileStore() {
  const file = path.join(process.cwd(), 'data', 'leads.json');
  let queue = Promise.resolve();

  const read = async () => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  };
  const write = async (rows) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(rows, null, 2));
  };
  // Serialise read-modify-write so concurrent requests can't clobber each other.
  const exclusive = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  return {
    mode: 'file',

    insertLead(lead) {
      return exclusive(async () => {
        const rows = await read();
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...toRow({ ...lead, leadRef: makeLeadRef() })
        };
        rows.unshift(row);
        await write(rows);
        return fromRow(row);
      });
    },

    async listLeads({ status, q } = {}) {
      const rows = await read();
      return rows
        .map(fromRow)
        .filter((l) => (!status || l.status === status) && matchesSearch(l, q))
        .slice(0, LIST_LIMIT);
    },

    updateStatus(id, status) {
      return exclusive(async () => {
        const rows = await read();
        const row = rows.find((r) => r.id === id);
        if (!row) return null;
        row.status = status;
        await write(rows);
        return fromRow(row);
      });
    },

    deleteLead(id) {
      return exclusive(async () => {
        const rows = await read();
        const next = rows.filter((r) => r.id !== id);
        if (next.length === rows.length) return false;
        await write(next);
        return true;
      });
    }
  };
}

const store = config.hasSupabase ? createSupabaseStore() : createFileStore();
console.log(`[db] using ${store.mode} store`);

module.exports = store;
