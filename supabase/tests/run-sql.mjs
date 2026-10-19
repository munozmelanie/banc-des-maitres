// PostgreSQL réel en WASM + pgTAP, données synthétiques uniquement.
// Sans Supabase local : FLUENCE_TEST_MODULES=/chemin/node_modules node run-sql.mjs
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.FLUENCE_TEST_MODULES ? path.join(process.env.FLUENCE_TEST_MODULES, '..', 'package.json') : import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const { pgtap } = require('@electric-sql/pglite-pgtap');
const pg = await PGlite.create({ extensions: { pgtap } });
try {
  // Reproduit les rôles/PostgreSQL auth.uid() du projet. Cela ne simule pas
  // une signature JWT : les tests de passerelle et d'Auth restent à faire
  // avec supabase test db puis un projet de test avant mise en service.
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  const migrations = path.join(here, '..', 'migrations');
  for (const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort()) await pg.exec(await readFile(path.join(migrations,file),'utf8'));
  for (const file of (await readdir(path.join(here,'database'))).filter(f=>f.endsWith('.test.sql')).sort()) {
  console.log('# '+file);
  const results = await pg.exec(await readFile(path.join(here,'database',file),'utf8'));
  const tap = results.flatMap(r=>r.rows).flatMap(row=>Object.values(row)).filter(v=>typeof v==='string' && /^(ok |not ok |#|\d+\.\.)/.test(v));
  for (const line of tap) console.log(line);
  if (!tap.some(v=>/^\d+\.\./.test(v)) || tap.some(v=>/^not ok /m.test(v) || /Looks like you failed/.test(v))) throw new Error('Échec pgTAP.');
  }
} finally { await pg.close(); }
