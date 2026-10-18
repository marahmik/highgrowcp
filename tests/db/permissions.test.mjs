import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  createTestDatabase, existingDate, month, newDate, stores, users,
} from './fixture.mjs';

// Expected SQL errors abort a PostgreSQL transaction. Recover only that statement
// so we can inspect database effects and run a permitted control in the scenario.
async function denied(query, sql, params, code, message) {
  await query('SAVEPOINT denied_statement');
  let failure;
  try {
    await query(sql, params);
  } catch (error) {
    failure = error;
    await query('ROLLBACK TO SAVEPOINT denied_statement');
  }
  await query('RELEASE SAVEPOINT denied_statement');
  assert.ok(failure, 'The unauthorized statement must fail');
  assert.equal(failure.code, code, failure.message);
  if (message) assert.match(failure.message, message);
}

const insertRequest = `
  INSERT INTO public.schedules (store_id, user_id, date, leave_type, note)
  VALUES ($1, $2, $3, 'request', 'new request') RETURNING user_id, leave_type, note
`;
const updateRequest = `
  UPDATE public.schedules SET note = 'edited request'
  WHERE store_id = $1 AND user_id = $2 AND date = $3 RETURNING note
`;

// One memory-only database, no concurrent use of its connection, and a rollback
// per test. Observations via the owner cannot establish permission: each attempted
// action is explicitly made with SET LOCAL ROLE authenticated + a fixture UID.
describe('actual PostgreSQL migrations: permissions and calendar locks', { concurrency: false }, () => {
  let database;
  before(async () => { database = await createTestDatabase(); });
  after(async () => { if (database) await database.close(); });

  test('fixture identities use a non-owner, non-superuser, non-bypass authenticated role', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.manager, async (authenticatedQuery) => {
        const { rows } = await authenticatedQuery(`
          SELECT current_user AS role, auth.uid() AS uid, rolsuper, rolbypassrls
          FROM pg_roles WHERE rolname = current_user
        `);
        assert.deepEqual(rows, [{
          role: 'authenticated', uid: users.manager, rolsuper: false, rolbypassrls: false,
        }]);
      });
      const { rows } = await query('SELECT id, role FROM public.profiles ORDER BY id');
      assert.deepEqual(rows, Object.entries(users).map(([name, id]) => ({
        id, role: name === 'admin' ? 'admin' : 'user',
      })));
      const owners = await query('SELECT DISTINCT owner_id FROM public.stores');
      assert.deepEqual(owners.rows, [{ owner_id: users.admin }]);
      const managers = await query(`
        SELECT store_id, status, role FROM public.store_members WHERE user_id = $1
      `, [users.manager]);
      assert.deepEqual(managers.rows, [{ store_id: stores.local, status: 'approved', role: 'admin' }]);
    });
  });

  test('an employee cannot create a store; a global admin can', async () => {
    await database.scenario(async ({ query, asUser }) => {
      const sql = `
        INSERT INTO public.stores (name, owner_id)
        VALUES ('Permission control store', $1) RETURNING name
      `;
      await asUser(users.employee, (q) => denied(q, sql, [users.employee], '42501'));
      assert.deepEqual((await query("SELECT name FROM public.stores WHERE name = 'Permission control store'")).rows, []);
      await asUser(users.admin, async (q) => {
        assert.deepEqual((await q(sql, [users.admin])).rows, [{ name: 'Permission control store' }]);
      });
      assert.equal((await query('SELECT count(*)::int AS total FROM public.stores')).rows[0].total, 3);
    });
  });

  test('an employee must not promote their own profile to global admin', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.employee, async (q) => {
        assert.deepEqual((await q(`
          UPDATE public.profiles SET display_name = 'Updated employee'
          WHERE id = $1 RETURNING display_name
        `, [users.employee])).rows, [{ display_name: 'Updated employee' }]);
        await denied(q, `
          UPDATE public.profiles SET role = 'admin' WHERE id = $1
        `, [users.employee], '42501');
      });
      assert.deepEqual((await query('SELECT role FROM public.profiles WHERE id = $1', [users.employee])).rows, [{ role: 'user' }]);
    });
  });

  test('only a global admin can create, change, or delete monthly locks', async () => {
    await database.scenario(async ({ query, asUser }) => {
      const update = 'UPDATE public.monthly_locks SET is_locked = true WHERE month = $1 RETURNING is_locked';
      const insert = 'INSERT INTO public.monthly_locks (month, is_locked) VALUES ($1, true) RETURNING month';
      const remove = 'DELETE FROM public.monthly_locks WHERE month = $1 RETURNING month';
      await asUser(users.employee, async (q) => {
        assert.deepEqual((await q(update, [month])).rows, []);
        assert.deepEqual((await q(remove, [month])).rows, []);
        await denied(q, insert, ['2026-07'], '42501');
      });
      assert.deepEqual((await query('SELECT month, is_locked FROM public.monthly_locks')).rows, [{ month, is_locked: false }]);
      await asUser(users.admin, async (q) => {
        assert.deepEqual((await q(update, [month])).rows, [{ is_locked: true }]);
        assert.deepEqual((await q(insert, ['2026-07'])).rows, [{ month: '2026-07' }]);
        assert.deepEqual((await q(remove, ['2026-07'])).rows, [{ month: '2026-07' }]);
      });
      assert.deepEqual((await query('SELECT month, is_locked FROM public.monthly_locks')).rows, [{ month, is_locked: true }]);
    });
  });

  test('delete_user RPC denies an employee and permits a global admin with real cascades', async () => {
    await database.scenario(async ({ query, asUser }) => {
      const sql = 'SELECT public.delete_user($1::uuid)';
      await asUser(users.employee, (q) => denied(q, sql, [users.colleague], 'P0001', /only super admin/));
      assert.deepEqual((await query('SELECT id FROM auth.users WHERE id = $1', [users.colleague])).rows, [{ id: users.colleague }]);
      assert.deepEqual((await query('SELECT id FROM public.profiles WHERE id = $1', [users.colleague])).rows, [{ id: users.colleague }]);
      await asUser(users.admin, (q) => q(sql, [users.colleague]));
      assert.deepEqual((await query('SELECT id FROM auth.users WHERE id = $1', [users.colleague])).rows, []);
      assert.deepEqual((await query('SELECT id FROM public.profiles WHERE id = $1', [users.colleague])).rows, []);
      assert.deepEqual((await query('SELECT user_id FROM public.store_members WHERE user_id = $1', [users.colleague])).rows, []);
      assert.deepEqual((await query('SELECT user_id FROM public.schedules WHERE user_id = $1', [users.colleague])).rows, []);
    });
  });

  test('an employee can insert and edit their own unlocked request', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.employee, async (q) => {
        assert.deepEqual((await q(insertRequest, [stores.local, users.employee, newDate])).rows, [{
          user_id: users.employee, leave_type: 'request', note: 'new request',
        }]);
        for (const date of [existingDate, newDate]) {
          assert.deepEqual((await q(updateRequest, [stores.local, users.employee, date])).rows, [{ note: 'edited request' }]);
        }
      });
      const { rows } = await query(`
        SELECT note, work_type, leave_type FROM public.schedules
        WHERE store_id = $1 AND user_id = $2 ORDER BY date
      `, [stores.local, users.employee]);
      assert.deepEqual(rows, [existingDate, newDate].map(() => ({
        note: 'edited request', work_type: null, leave_type: 'request',
      })));
    });
  });

  test('an employee cannot insert or update a work_type', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.employee, async (q) => {
        await denied(q, `
          INSERT INTO public.schedules (store_id, user_id, date, work_type)
          VALUES ($1, $2, $3, 'open')
        `, [stores.local, users.employee, newDate], 'P0001', /only set request leave type/);
        await denied(q, `
          UPDATE public.schedules SET work_type = 'close'
          WHERE store_id = $1 AND user_id = $2 AND date = $3
        `, [stores.local, users.employee, existingDate], 'P0001', /only set request leave type/);
      });
      assert.deepEqual((await query(`
        SELECT work_type, note FROM public.schedules WHERE store_id = $1 AND user_id = $2
      `, [stores.local, users.employee])).rows, [{ work_type: null, note: 'employee baseline' }]);
    });
  });

  test('an employee cannot insert or edit another employee request', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.employee, async (q) => {
        await denied(q, insertRequest, [stores.local, users.colleague, newDate], 'P0001', /only edit their own schedule/);
        // RLS filters this existing, visible row instead of raising an error.
        assert.deepEqual((await q(updateRequest, [stores.local, users.colleague, existingDate])).rows, []);
      });
      assert.deepEqual((await query(`
        SELECT note FROM public.schedules WHERE store_id = $1 AND user_id = $2
      `, [stores.local, users.colleague])).rows, [{ note: 'colleague baseline' }]);
    });
  });

  test('employee membership does not permit requests in a foreign store', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.employee, async (q) => {
        await denied(q, insertRequest, [stores.foreign, users.employee, newDate], '42501');
        assert.deepEqual((await q(updateRequest, [stores.foreign, users.colleague, existingDate])).rows, []);
      });
      assert.deepEqual((await query('SELECT user_id, note FROM public.schedules WHERE store_id = $1', [stores.foreign])).rows, [{
        user_id: users.colleague, note: 'foreign baseline',
      }]);
    });
  });

  for (const lock of ['monthly', 'store']) {
    async function enableLock(asUser) {
      await asUser(users.admin, async (q) => {
        const result = lock === 'monthly'
          ? await q('UPDATE public.monthly_locks SET is_locked = true WHERE month = $1 RETURNING is_locked', [month])
          : await q('UPDATE public.stores SET locked = true WHERE id = $1 RETURNING locked', [stores.local]);
        assert.equal(result.rows.length, 1, 'authorized lock setup must affect one row');
      });
    }

    test(`${lock} lock blocks employee INSERT and UPDATE without changing requests`, async () => {
      await database.scenario(async ({ query, asUser }) => {
        await enableLock(asUser);
        const message = lock === 'monthly' ? /locked for this month/ : /locked by store manager/;
        await asUser(users.employee, async (q) => {
          await denied(q, insertRequest, [stores.local, users.employee, newDate], 'P0001', message);
          await denied(q, updateRequest, [stores.local, users.employee, existingDate], 'P0001', message);
        });
        assert.deepEqual((await query(`
          SELECT note FROM public.schedules WHERE store_id = $1 AND user_id = $2
        `, [stores.local, users.employee])).rows, [{ note: 'employee baseline' }]);
      });
    });

    test(`${lock} lock still permits the approved non-owner manager and global admin`, async () => {
      await database.scenario(async ({ query, asUser }) => {
        await enableLock(asUser);
        for (const [actor, target] of [[users.manager, users.employee], [users.admin, users.colleague]]) {
          await asUser(actor, async (q) => {
            assert.deepEqual((await q(`
              INSERT INTO public.schedules (store_id, user_id, date, work_type)
              VALUES ($1, $2, $3, 'open') RETURNING work_type
            `, [stores.local, target, newDate])).rows, [{ work_type: 'open' }]);
            assert.deepEqual((await q(`
              UPDATE public.schedules SET work_type = 'close', note = 'authorized locked edit'
              WHERE store_id = $1 AND user_id = $2 AND date = $3 RETURNING work_type
            `, [stores.local, target, existingDate])).rows, [{ work_type: 'close' }]);
          });
        }
        assert.deepEqual((await query(`
          SELECT work_type, note FROM public.schedules WHERE store_id = $1 AND date = $2 ORDER BY user_id
        `, [stores.local, existingDate])).rows, [users.employee, users.colleague].map(() => ({
          work_type: 'close', note: 'authorized locked edit',
        })));
      });
    });
  }

  test('a monthly lock leaves adjacent months writable but rejects moving a request into the locked month', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.admin, (q) => q(
        'UPDATE public.monthly_locks SET is_locked = true WHERE month = $1', [month],
      ));
      const adjacentDate = '2026-07-11';
      await asUser(users.employee, async (q) => {
        assert.deepEqual((await q(insertRequest, [stores.local, users.employee, adjacentDate])).rows, [{
          user_id: users.employee, leave_type: 'request', note: 'new request',
        }]);
        assert.deepEqual((await q(updateRequest, [stores.local, users.employee, adjacentDate])).rows, [{ note: 'edited request' }]);
        await denied(q, `
          UPDATE public.schedules SET date = $4
          WHERE store_id = $1 AND user_id = $2 AND date = $3
        `, [stores.local, users.employee, adjacentDate, newDate], 'P0001', /locked for this month/);
      });
      assert.deepEqual((await query(`
        SELECT date::text, note FROM public.schedules
        WHERE store_id = $1 AND user_id = $2 ORDER BY date
      `, [stores.local, users.employee])).rows, [
        { date: existingDate, note: 'employee baseline' },
        { date: adjacentDate, note: 'edited request' },
      ]);
    });
  });

  test('an employee must not move a request out of a locked month into an unlocked month', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.admin, (q) => q(
        'UPDATE public.monthly_locks SET is_locked = true WHERE month = $1', [month],
      ));
      await asUser(users.employee, (q) => denied(q, `
        UPDATE public.schedules SET date = $4
        WHERE store_id = $1 AND user_id = $2 AND date = $3
      `, [stores.local, users.employee, existingDate, '2026-07-10'], 'P0001', /locked for this month/));
      assert.deepEqual((await query(`
        SELECT date::text, note FROM public.schedules
        WHERE store_id = $1 AND user_id = $2
      `, [stores.local, users.employee])).rows, [{ date: existingDate, note: 'employee baseline' }]);
    });
  });

  test('a store lock leaves requests in another approved store writable', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await query(`
        INSERT INTO public.store_members (store_id, user_id, status, role)
        VALUES ($1, $2, 'approved', 'parttimer')
      `, [stores.foreign, users.employee]);
      await asUser(users.manager, (q) => q(
        'UPDATE public.stores SET locked = true WHERE id = $1', [stores.local],
      ));
      await asUser(users.employee, async (q) => {
        assert.deepEqual((await q(insertRequest, [stores.foreign, users.employee, newDate])).rows, [{
          user_id: users.employee, leave_type: 'request', note: 'new request',
        }]);
        assert.deepEqual((await q(updateRequest, [stores.foreign, users.employee, newDate])).rows, [{ note: 'edited request' }]);
      });
      assert.deepEqual((await query(`
        SELECT note FROM public.schedules WHERE store_id = $1 AND user_id = $2
      `, [stores.foreign, users.employee])).rows, [{ note: 'edited request' }]);
    });
  });

  test('a manager can read but cannot update another store schedule', async () => {
    await database.scenario(async ({ query, asUser }) => {
      await asUser(users.manager, async (q) => {
        assert.deepEqual((await q('SELECT note FROM public.schedules WHERE store_id = $1', [stores.foreign])).rows, [{ note: 'foreign baseline' }]);
        assert.deepEqual((await q(updateRequest, [stores.foreign, users.colleague, existingDate])).rows, []);
      });
      assert.deepEqual((await query('SELECT note FROM public.schedules WHERE store_id = $1', [stores.foreign])).rows, [{ note: 'foreign baseline' }]);
    });
  });

  test('store lock changes are denied to an employee and allowed to the non-owner manager', async () => {
    await database.scenario(async ({ query, asUser }) => {
      const sql = 'UPDATE public.stores SET locked = true WHERE id = $1 RETURNING locked';
      await asUser(users.employee, async (q) => {
        assert.deepEqual((await q(sql, [stores.local])).rows, []);
      });
      assert.deepEqual((await query('SELECT locked FROM public.stores WHERE id = $1', [stores.local])).rows, [{ locked: false }]);
      await asUser(users.manager, async (q) => {
        assert.deepEqual((await q(sql, [stores.local])).rows, [{ locked: true }]);
        assert.deepEqual((await q(sql, [stores.foreign])).rows, []);
      });
      assert.deepEqual((await query('SELECT locked FROM public.stores WHERE id = $1', [stores.local])).rows, [{ locked: true }]);
      assert.deepEqual((await query('SELECT locked FROM public.stores WHERE id = $1', [stores.foreign])).rows, [{ locked: false }]);
    });
  });

  test('memo writes require the relevant store manager or global admin', async () => {
    await database.scenario(async ({ query, asUser }) => {
      const insert = 'INSERT INTO public.store_memos (store_id, month, content) VALUES ($1, $2, $3) RETURNING content';
      const update = 'UPDATE public.store_memos SET content = $3 WHERE store_id = $1 AND month = $2 RETURNING content';
      await asUser(users.employee, async (q) => {
        await denied(q, insert, [stores.local, '2026-07', 'unauthorized'], '42501');
        assert.deepEqual((await q(update, [stores.local, month, 'unauthorized'])).rows, []);
      });
      assert.deepEqual((await query('SELECT content FROM public.store_memos')).rows, [{ content: 'memo baseline' }]);
      await asUser(users.manager, async (q) => {
        assert.deepEqual((await q(insert, [stores.local, '2026-07', 'manager insert'])).rows, [{ content: 'manager insert' }]);
        assert.deepEqual((await q(update, [stores.local, month, 'manager edit'])).rows, [{ content: 'manager edit' }]);
        await denied(q, insert, [stores.foreign, month, 'unauthorized'], '42501');
      });
      await asUser(users.admin, async (q) => {
        assert.deepEqual((await q(insert, [stores.foreign, month, 'admin insert'])).rows, [{ content: 'admin insert' }]);
      });
      await asUser(users.manager, async (q) => {
        assert.deepEqual((await q(update, [stores.foreign, month, 'unauthorized'])).rows, []);
      });
      assert.deepEqual((await query('SELECT content FROM public.store_memos ORDER BY store_id, month')).rows, [
        { content: 'manager edit' }, { content: 'manager insert' }, { content: 'admin insert' },
      ]);
    });
  });

  test('migration 008 denies direct memo deletion even to managers and global admins; clearing content remains permitted', async () => {
    await database.scenario(async ({ query, asUser }) => {
      for (const actor of [users.employee, users.manager, users.admin]) {
        await asUser(actor, (q) => denied(q,
          'DELETE FROM public.store_memos WHERE store_id = $1 AND month = $2',
          [stores.local, month], '42501'));
      }
      assert.deepEqual((await query('SELECT content FROM public.store_memos')).rows, [{ content: 'memo baseline' }]);
      await asUser(users.manager, async (q) => {
        assert.deepEqual((await q(`
          UPDATE public.store_memos SET content = '' WHERE store_id = $1 AND month = $2 RETURNING content
        `, [stores.local, month])).rows, [{ content: '' }]);
      });
      assert.deepEqual((await query('SELECT content FROM public.store_memos')).rows, [{ content: '' }]);
    });
  });
});
