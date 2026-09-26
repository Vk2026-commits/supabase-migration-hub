import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const companies = [
  { id: 'kairos', user_id: 'stephen', company_name: 'Kairos' },
  { id: 'secureguard', user_id: 'stephen', company_name: 'SecureGuard' },
  { id: 'unrelated', user_id: 'someone-else', company_name: 'Unrelated' },
];
const members = [
  { company_id: 'kairos', user_id: 'ricky', role: 'admin', status: 'active' },
  { company_id: 'kairos', user_id: 'stephen', role: 'owner', status: 'active' },
  { company_id: 'unrelated', user_id: 'ricky', role: 'owner', status: 'removed' },
];
const supabase = { from(table) {
  let rows = table === 'company_profiles' ? companies : members;
  const query = {
    select() { return query; },
    eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
    in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return query;
} };
const source = readFileSync(new URL('../src/lib/company-workspaces.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('require', 'exports', compiled)(() => ({ supabase }), exports);
const owned = await exports.loadCompanyWorkspaces('stephen');
assert.equal(owned.length, 2);
assert.ok(owned.every(workspace => workspace.owned && workspace.role === 'owner'));
assert.equal(exports.selectCompanyWorkspace(owned, 'secureguard').company.id, 'secureguard');
const admin = await exports.loadCompanyWorkspaces('ricky');
assert.equal(admin.length, 1);
assert.equal(admin[0].role, 'admin');
assert.equal(admin[0].owned, false);
assert.equal(exports.selectCompanyWorkspace(admin, 'unrelated').company.id, 'kairos');
assert.deepEqual(await exports.loadCompanyWorkspaces('outsider'), []);
console.log('PASS: multiple ownership, deduplication, administrator access, removed memberships, workspace selection');
