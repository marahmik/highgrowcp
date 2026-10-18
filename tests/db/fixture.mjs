import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const users = Object.freeze({
  admin: '10000000-0000-0000-0000-000000000001',
  manager: '10000000-0000-0000-0000-000000000002',
  employee: '10000000-0000-0000-0000-000000000003',
  colleague: '10000000-0000-0000-0000-000000000004',
});

export const stores = Object.freeze({
  local: '20000000-0000-0000-0000-000000000001',
  foreign: '20000000-0000-0000-0000-000000000002',
});

export const month = '2026-06';
export const existingDate = `${month}-10`;
export const newDate = `${month}-11`;

// TEST ONLY: the migrations assume Supabase's auth schema/default grants, and
// stores.memo / stores.locked added outside the checked-in migration history.
// This is the minimum prerequisite fixture, NOT a complete application baseline.
// No policies, triggers, application constraints, or extra columns are invented.
const authFixture = `
  CREATE ROLE anon NOSUPERUSER NOBYPASSRLS;
  CREATE ROLE authenticated NOSUPERUSER NOBYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    raw_user_meta_data JSONB
  );
  CREATE FUNCTION auth.uid() RETURNS UUID
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO authenticated;
`;

async function applyMigrations(db) {
  await db.exec(authFixture);
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const migrations = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (migrations.length === 0) throw new Error('No SQL migrations discovered');

  // Default grants precede 007, so 008's DELETE revocation stays effective.
  for (const filename of migrations) {
    try {
      await db.exec(await readFile(new URL(filename, directory), 'utf8'));
      if (filename === '001_initial_schema.sql') {
        await db.exec(`
          ALTER TABLE public.stores ADD COLUMN memo TEXT;
          ALTER TABLE public.stores ADD COLUMN locked BOOLEAN DEFAULT false;
        `);
      }
    } catch (cause) {
      throw new Error(`Failed to apply migration ${filename}: ${cause.message}`, { cause });
    }
  }
}

async function seedDatabase(db, query, asUser) {
  // The real first-user trigger assigns only the first identity global admin.
  // The store manager is deliberately NOT a store owner.
  for (const [name, id] of Object.entries(users)) {
    await query(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ($1, $2, $3::jsonb)
    `, [id, `${name}@example.invalid`, JSON.stringify({ full_name: name })]);
  }
  await query(`
    INSERT INTO public.stores (id, name, owner_id) VALUES
      ($1, 'Local fixture store', $3), ($2, 'Foreign fixture store', $3)
  `, [stores.local, stores.foreign, users.admin]);
  await query(`
    INSERT INTO public.store_members (store_id, user_id, status, role) VALUES
      ($1, $3, 'approved', 'admin'),
      ($1, $4, 'approved', 'parttimer'),
      ($1, $5, 'approved', 'parttimer'),
      ($2, $5, 'approved', 'parttimer')
  `, [stores.local, stores.foreign, users.manager, users.employee, users.colleague]);
  await query('INSERT INTO public.monthly_locks (month, is_locked) VALUES ($1, false)', [month]);

  await db.exec('BEGIN');
  try {
    await asUser(users.admin, async (authenticatedQuery) => {
      await authenticatedQuery(`
        INSERT INTO public.schedules (store_id, user_id, date, leave_type, note) VALUES
          ($1, $3, $5, 'request', 'employee baseline'),
          ($1, $4, $5, 'request', 'colleague baseline'),
          ($2, $4, $5, 'request', 'foreign baseline')
      `, [stores.local, stores.foreign, users.employee, users.colleague, existingDate]);
      await authenticatedQuery(`
        INSERT INTO public.store_memos (store_id, month, content, updated_by)
        VALUES ($1, $2, 'memo baseline', $3)
      `, [stores.local, month, users.admin]);
    });
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

// No URL/environment/external connection argument is accepted. The PostgreSQL
// engine and all data exist only in memory; no production auth or DB is used.
export async function createTestDatabase() {
  const db = await PGlite.create('memory://');
  const query = (sql, params = []) => db.query(sql, params);

  // Called only within a transaction. Permission actions always run under this
  // non-owner, non-bypass role, even when the application profile is an admin.
  async function asUser(userId, operation) {
    await db.exec('SET LOCAL ROLE authenticated');
    await query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await operation(query);
    await db.exec('SET LOCAL ROLE NONE');
    await query("SELECT set_config('request.jwt.claim.sub', '', true)");
    return result;
  }

  try {
    await applyMigrations(db);
    await seedDatabase(db, query, asUser);
  } catch (error) {
    await db.close();
    throw error;
  }

  return {
    // Scenarios must be awaited sequentially. Every scenario rolls back changes,
    // so lock tests, deletions, and positive controls cannot contaminate others.
    // query is the fixture owner's observation/setup channel, NEVER the channel
    // for asserting permission. All attempted consumer actions use asUser.
    async scenario(operation) {
      await db.exec('BEGIN');
      try {
        return await operation({ query, asUser });
      } finally {
        await db.exec('ROLLBACK');
      }
    },
    close: () => db.close(),
  };
}
