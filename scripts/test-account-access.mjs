import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const moduleUrl = (file, replacements = []) => {
  let source = stripTypeScriptTypes(readFileSync(file, 'utf8'));
  for (const [from, to] of replacements) source = source.replace(from, to);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
};
const requestUrl = moduleUrl('src/lib/authRequest.ts');
const { resolvePortal, availablePortals, signInDestination, safeReturnPath } = await import(moduleUrl('src/lib/account-routing.ts'));
const { requestWithDeadline } = await import(requestUrl);
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`ok ${name}`); }

const officer = { profileRole: 'officer', roles: ['officer'], companyCount: 0 };
const teamMember = { ...officer, companyCount: 1 };
const company = { profileRole: 'company', roles: ['company'], companyCount: 1 };
await test('company team membership wins over original officer signup on generic sign-in', () => assert.equal(resolvePortal(teamMember, null, null), 'company'));
await test('company ownership works even if role rows are missing', () => assert.equal(resolvePortal({ profileRole: null, roles: [], companyCount: 1 }, null, null), 'company'));
await test('officer-only accounts stay officers', () => assert.equal(resolvePortal(officer, null, null), 'officer'));
await test('dual-role users can deliberately open the officer portal', () => assert.equal(resolvePortal(teamMember, 'officer', null), 'officer'));
await test('company URL requests require real access', () => assert.throws(() => resolvePortal(officer, 'company', 'foreign'), /No active company workspace/));
await test('stale company role alone grants no workspace', () => assert.deepEqual(availablePortals({ ...officer, roles: ['officer', 'company'] }), ['officer']));
await test('stale officer destination does not reclassify company accounts', () => assert.throws(() => resolvePortal(company, 'officer', null), /does not have a security officer profile/));
await test('platform admin still lands in admin unless a workspace is selected', () => assert.equal(resolvePortal({ ...officer, roles: ['admin'] }, null, null), 'admin'));
await test('admin role alone cannot open an arbitrary company', () => assert.throws(() => resolvePortal({ ...officer, roles: ['admin'] }, 'company', 'foreign'), /No active company/));
await test('company sign-in intent survives authentication', () => assert.equal(signInDestination(null, 'company'), '/dashboard?viewAs=company'));
await test('return link retains company, tab and officer record', () => assert.equal(signInDestination('/dashboard?companyId=kairos&tab=team&officerId=steve', 'company'), '/dashboard?companyId=kairos&tab=team&officerId=steve&viewAs=company'));
await test('officer application return link stays at its saved step', () => assert.equal(signInDestination('/dashboard?viewAs=officer&tab=hiring-application&step=9', null), '/dashboard?viewAs=officer&tab=hiring-application&step=9'));
await test('external and backslash return destinations are rejected', () => {
  for (const next of ['https://bad.example', '//bad.example', '/\\bad.example', '/\n/bad.example']) assert.equal(safeReturnPath(next), null);
});

const tables = {
  profiles: [{ id: 'erika', role: 'officer', full_name: 'Test team member' }, { id: 'owner', role: 'company' }],
  user_roles: [{ user_id: 'erika', role: 'officer' }, { user_id: 'owner', role: 'company' }],
  company_profiles: [{ id: 'kairos', user_id: 'owner', company_name: 'Kairos' }, { id: 'other', user_id: 'steve', company_name: 'Other' }],
  company_members: [{ company_id: 'kairos', user_id: 'erika', role: 'admin', status: 'active' }],
};
const calls = [];
let failure = null;
globalThis.accountAccessTestClient = {
  from(table) {
    const filters = [];
    let single = false;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      maybeSingle() { single = true; return query; },
      abortSignal() { return query; },
      then(resolve, reject) {
        calls.push(table);
        const data = tables[table].filter(row => filters.every(filter => filter(row)));
        return Promise.resolve({ data: single ? data[0] || null : data, error: table === failure ? new Error('network unavailable') : null }).then(resolve, reject);
      },
    };
    return query;
  },
};
const imports = [
  [/import \{ supabase \} from [^;]+;/, 'const supabase = globalThis.accountAccessTestClient;'],
  [/from "@\/lib\/authRequest"/, `from "${requestUrl}"`],
];
const workspaceUrl = moduleUrl('src/lib/company-workspaces.ts', imports);
const { loadCompanyWorkspaces, selectCompanyWorkspace } = await import(workspaceUrl);
const accessUrl = moduleUrl('src/lib/account-access.ts', [...imports, [/from "@\/lib\/company-workspaces"/, `from "${workspaceUrl}"`]]);
const { loadAccountAccess } = await import(accessUrl);

await test('Navbar and Dashboard share a running access lookup', async () => {
  calls.length = 0;
  const first = loadAccountAccess('erika');
  assert.equal(loadAccountAccess('erika'), first);
  const result = await first;
  assert.equal(result.companyCount, 1);
  assert.equal(result.workspaces[0].role, 'admin');
  assert.equal(resolvePortal(result, null, null), 'company');
  assert.equal(calls.filter(table => table === 'profiles').length, 1);
  assert.equal(calls.filter(table => table === 'user_roles').length, 1);
});
await test('owners are not re-fetched and retain their owner role', async () => {
  calls.length = 0;
  const workspaces = await loadCompanyWorkspaces('owner');
  assert.equal(workspaces[0].role, 'owner');
  assert.equal(workspaces[0].owned, true);
  assert.equal(calls.filter(table => table === 'company_profiles').length, 1);
});
await test('different users never share access results', async () => {
  const [a, b] = await Promise.all([loadAccountAccess('erika'), loadAccountAccess('steve')]);
  assert.equal(a.workspaces[0].company.id, 'kairos');
  assert.equal(b.workspaces[0].company.id, 'other');
});
await test('unverified URL company cannot be selected', async () => {
  const workspaces = await loadCompanyWorkspaces('erika');
  assert.equal(selectCompanyWorkspace(workspaces, 'other').company.id, 'kairos');
});
await test('failed company reads fail closed and are retryable', async () => {
  failure = 'company_members';
  await assert.rejects(loadAccountAccess('erika'), /network unavailable/);
  failure = null;
  assert.equal((await loadAccountAccess('erika')).companyCount, 1);
});
await test('removed or pending membership is not reused from a successful lookup', async () => {
  tables.company_members[0].status = 'invited';
  assert.equal((await loadAccountAccess('erika')).companyCount, 0);
  tables.company_members[0].status = 'removed';
  assert.equal((await loadAccountAccess('erika')).companyCount, 0);
});
await test('timed-out account reads are cancelled', async () => {
  let signal;
  await assert.rejects(requestWithDeadline(s => { signal = s; return new Promise(() => {}); }, 5), /taking too long/);
  assert.equal(signal.aborted, true);
});
delete globalThis.accountAccessTestClient;
console.log(`PASS ${checks} account access and company sign-in regression checks`);
