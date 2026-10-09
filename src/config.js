require('dotenv').config();
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || '',
  sessionHours: 8
};

config.hasSupabase = Boolean(config.supabaseUrl && config.supabaseKey);
config.adminConfigured = Boolean(config.adminPasswordHash);

if (!config.jwtSecret) {
  if (isProd) {
    throw new Error('JWT_SECRET is required in production.');
  }
  // Development only: random per start, so admin sessions reset on restart.
  config.jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set - using a temporary one (dev only).');
}

if (isProd && !config.hasSupabase) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production.');
}

if (!config.adminConfigured) {
  console.warn('[config] ADMIN_PASSWORD_HASH not set - admin login is disabled. Run: npm run hash-password -- "your-password"');
}

module.exports = config;
