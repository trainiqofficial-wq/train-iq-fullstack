// Usage: npm run hash-password -- "your-strong-password"
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Provide a password of at least 10 characters:\n  npm run hash-password -- "your-strong-password"');
  process.exit(1);
}
console.log('\nAdd this line to your .env (or Vercel environment variables):\n');
console.log(`ADMIN_PASSWORD_HASH=${bcrypt.hashSync(password, 12)}\n`);
