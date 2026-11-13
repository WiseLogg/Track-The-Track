// Real PostgreSQL, disposable container, no ports, no production credentials.
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const name = `track-test-${randomUUID()}`;
function docker(args, options = {}) { return execFileSync('docker', args, { encoding: 'utf8', ...options }); }
async function main() {
  try {
    docker(['run', '--detach', '--rm', '--network', 'none', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17']);
    let ready = false;
    for (let i = 0; i < 60; i++) {
      // Docker's temporary initialization server accepts Unix sockets, then stops.
      // TCP is available only after initialization, when the final server starts.
      try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'], { stdio: 'pipe' }); ready = true; break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
    for (const file of ['tests/database-bootstrap.sql', 'supabase/setup.sql', 'supabase/workouts.sql', 'supabase/workout-library.sql', 'supabase/release.sql', 'tests/database.test.sql']) {
      docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: readFileSync(file, 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] });
      console.log(`Passed: ${file}`);
    }
    // Exercise a real dump/restore in isolation, then repeat the permission checks.
    const backup = docker(['exec', name, 'pg_dump', '-U', 'postgres', '-Fc', '--no-owner', 'postgres'], { encoding: null });
    docker(['exec', name, 'createdb', '-U', 'postgres', 'track_restore']);
    docker(['exec', '-i', name, 'pg_restore', '-U', 'postgres', '--dbname', 'track_restore', '--clean', '--if-exists', '--no-owner', '--exit-on-error'], { input: backup, encoding: null });
    docker(['exec', '-i', name, 'psql', '-U', 'postgres', '--dbname', 'track_restore', '-v', 'ON_ERROR_STOP=1'], { input: readFileSync('tests/database.test.sql', 'utf8') });
    console.log('Backup restored successfully; ownership checks passed again on the restored database.');
    console.log('Database ownership, validation, moderation, rate limits, and deletion checks passed.');
  } finally {
    try { docker(['rm', '--force', name], { stdio: 'pipe' }); } catch {}
  }
}
main().catch((error) => { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; });
