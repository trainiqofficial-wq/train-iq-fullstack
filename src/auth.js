const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const COOKIE_NAME = 'trainiq_admin';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.isProd,
  path: '/',
  maxAge: config.sessionHours * 60 * 60 * 1000
});

// Compare without leaking length/timing information.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Valid-looking hash used so a wrong username takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-the-password', 12);

async function verifyCredentials(username, password) {
  const userOk = safeEqual(username, config.adminUsername);
  const passOk = await bcrypt.compare(String(password), config.adminPasswordHash || DUMMY_HASH);
  return userOk && passOk;
}

function startSession(res, username) {
  const token = jwt.sign({ sub: username, role: 'admin' }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.sessionHours}h`
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function endSession(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

function readSession(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return payload.role === 'admin' ? payload : null;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Please sign in.' });
  req.admin = session;
  next();
}

module.exports = { verifyCredentials, startSession, endSession, readSession, requireAdmin };
