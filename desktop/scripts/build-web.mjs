// Builds the web client for app use (web/.env.app → VITE_API_URL etc.) and copies it to desktop/web-dist.
// Override the server with e.g. `VITE_API_URL=https://my.server npm run dist`.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', '..', 'web');
const out = join(here, '..', 'web-dist');

if (!existsSync(join(web, 'node_modules'))) execSync('npm ci', { cwd: web, stdio: 'inherit' });
execSync('npm run build:app', { cwd: web, stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
cpSync(join(web, 'dist'), out, { recursive: true });
console.log(`web build copied to ${out}`);
