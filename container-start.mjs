import { chmodSync, chownSync } from 'node:fs';

// Prepare the dedicated volume if mounted with root ownership, then drop
// privileges before loading the application or opening the database.
if (process.getuid() === 0) {
  chownSync('/app/storage', 1000, 1000);
  chmodSync('/app/storage', 0o700);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}

await import('./server.mjs');
