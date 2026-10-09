const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

app.set('trust proxy', 1); // correct client IPs behind Vercel / proxies (rate limiting)

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': config.isProd ? [] : null
      }
    }
  })
);

app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

// ---- API ----
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- Admin site: reachable only by typing the URL, never linked from the public page ----
app.use('/admin', (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
// (express.static redirects /admin -> /admin/ and serves public/admin/index.html)

// ---- Public site ----
app.use(express.static(PUBLIC_DIR, { maxAge: config.isProd ? '1h' : 0 }));

// ---- Errors: log details, return a generic message ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

if (require.main === module) {
  app.listen(config.port, () => console.log(`Train IQ running on http://localhost:${config.port}`));
}

module.exports = app; // used by Vercel's serverless runtime
