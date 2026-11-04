import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const questionsUrl = `data:text/javascript;base64,${Buffer.from(compile('src/lib/applicationQuestions.ts')).toString('base64')}`;
const src = compile('src/lib/hiringRestore.ts').replace('./applicationQuestions',questionsUrl);
const m = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
const { resolveRestoreStep, requirementsMet, runResumeUpload, createGeneration, shouldAutoOpenApplication, resumeObjectPath } = m;

// Synthetic fixture only — no real applicant data.
const full = { firstName: 'Sample', lastName: 'Officer', startDate: '2026-11-10', appliedBefore: 'No', employedHereBefore: 'No', convicted: 'No', outsideEmployment: 'No', licenseSuspended: 'No', otherNamesUsed: 'No', presentlyEmployed: 'No', everFired: 'No', driversLicenseNumber: 'SAMPLE', licenseClass: 'C', driverLicenseState: 'TX', professionalActivities: 'None', machinesEquipment: 'None', skills: 'None', hasWorkHistory: 'No', hasReferences: 'No', schoolHistory: ['High School/GED','College/University','Vocational/Technical'].map(type => ({type,attended:'No',name:'',years:'',degree:'',subjects:''})), position: 'Officer', applicantName: 'Test', email: 't@example.invalid', phone: '123-456-7890', address: '1 St', city: 'X', state: 'TX', zip: '00000', isAdult: 'Yes', eligibleToWork: 'Yes', driversLicense: 'Yes', education: 'HS', licenseLevels: ['No license'] };
const shared = { employmentTypes: ['full_time'], shiftPreferences: ['first_shift'], schedule: { Monday: { start: '09:00', end: '17:00' } } };
const base = { urlStep: null, savedStep: 2, hasDraft: true, submitted: false, form: full, shared, selectedJobId: 'job' };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('formatted phone counts as 10 digits', () => assert.equal(requirementsMet(1, full, shared, 'job', false), true));
t('short phone is incomplete -> resumes at personal info', () => assert.equal(resolveRestoreStep({ ...base, savedStep: 6, form: { ...full, phone: '123-456' } }), 1));
t('no license / no photos never blocks; complete draft resumes at signature', () => assert.equal(resolveRestoreStep({ ...base, savedStep: 7 }), 9));
t('first incomplete even if saved step is later', () => assert.equal(resolveRestoreStep({ ...base, savedStep: 8, form: { ...full, skills: '' } }), 3));
t('missing job selection resumes at step 1', () => assert.equal(resolveRestoreStep({ ...base, selectedJobId: '' }), 0));
t('deep link / deliberate backward navigation wins', () => assert.equal(resolveRestoreStep({ ...base, urlStep: 1, form: { ...full, skills: '' } }), 1));
t('submitted application keeps saved step', () => assert.equal(resolveRestoreStep({ ...base, submitted: true, form: {}, savedStep: 4 }), 4));
t('no draft starts at saved/zero', () => assert.equal(resolveRestoreStep({ ...base, hasDraft: false, form: {}, savedStep: 0 }), 0));

t('stale restore generation is rejected', () => { const g = createGeneration(); const a = g.next(); const b = g.next(); assert.equal(g.isCurrent(a), false); assert.equal(g.isCurrent(b), true); });
t('auto-open respects explicit tab', () => assert.equal(shouldAutoOpenApplication({ requestedTab: 'profile', initialTab: 'overview', hasPendingOffer: false, hasSubmittedApplication: false, employmentConfirmed: false }), null));
t('auto-open unfinished application', () => assert.equal(shouldAutoOpenApplication({ requestedTab: null, initialTab: 'overview', hasPendingOffer: false, hasSubmittedApplication: false, employmentConfirmed: false }), 'hiring-application'));
t('submitted user is not redirected', () => assert.equal(shouldAutoOpenApplication({ requestedTab: null, initialTab: 'overview', hasPendingOffer: false, hasSubmittedApplication: true, employmentConfirmed: false }), null));
t('unique resume paths', () => assert.notEqual(resumeObjectPath('u', 'pdf', 'a'), resumeObjectPath('u', 'pdf', 'b')));

const calls = [];
const deps = (over = {}) => ({ isCurrent: () => true, hasPrevious: true, deadline: (p) => p, upload: async () => { calls.push('upload'); return { error: null }; }, persistReference: async () => { calls.push('persist'); return { error: null }; }, removePrevious: async () => { calls.push('remove'); }, ...over });
assert.equal(await runResumeUpload(deps()), 'saved'); assert.deepEqual(calls.splice(0), ['upload', 'persist', 'remove']); console.log('ok upload success removes previous only after persist'); n++;
await assert.rejects(runResumeUpload(deps({ upload: async () => ({ error: new Error('upload failed') }) })), /upload failed/); assert.deepEqual(calls.splice(0), []); console.log('ok upload failure keeps previous file and reference'); n++;
await assert.rejects(runResumeUpload(deps({ persistReference: async () => ({ error: new Error('persist failed') }) })), /persist failed/); assert.deepEqual(calls.splice(0), ['upload']); console.log('ok persist failure never deletes previous'); n++;
await assert.rejects(runResumeUpload(deps({ deadline: () => Promise.reject(new Error('timeout')) })), /timeout/); console.log('ok timeout surfaces error'); n++;
calls.splice(0);
assert.equal(await runResumeUpload(deps({ isCurrent: () => false })), 'stale'); assert.deepEqual(calls.splice(0), ['upload']); console.log('ok superseded upload never persists or deletes'); n++;
console.log(`PASS ${n} hiring restore/upload regression tests`);

for (const levels of [[], ['No license', 'Level II'], ['unknown']]) assert.equal(requirementsMet(2, { ...full, licenseLevels: levels }, shared, 'job', false), false);
for (const levels of [['No license'], ['Level II'], ['Level III', 'Level IV']]) assert.equal(requirementsMet(2, { ...full, licenseLevels: levels }, shared, 'job', false), true);
for (const value of ['', 'maybe', 'false']) assert.equal(requirementsMet(2, { ...full, driversLicense: value }, shared, 'job', false), false);
assert.equal(requirementsMet(2, { ...full, driversLicense: 'No' }, shared, 'job', false), true);
console.log('PASS explicit license and Yes/No validation');

for (const key of ['appliedBefore','employedHereBefore','convicted','outsideEmployment','licenseSuspended']) {
 assert.equal(requirementsMet(2, {...full,[key]:''},shared,'job',false),false);
 assert.equal(requirementsMet(2, {...full,[key]:'Yes'},shared,'job',false),false);
}
assert.equal(requirementsMet(2,{...full,appliedBefore:'Yes',appliedBeforeWhen:'2025'},shared,'job',false),true);
assert.equal(requirementsMet(4,{...full,everFired:'Yes'},shared,'job',false),false);
assert.equal(requirementsMet(4,{...full,everFired:'Yes',firedDetails:'Sample explanation'},shared,'job',false),true);
assert.equal(requirementsMet(5,{...full,hasReferences:'Yes',references:[{name:'Sample'}]},shared,'job',false),false);
assert.equal(requirementsMet(3,{...full,schoolHistory:[]},shared,'job',false),false);
console.log('PASS full application question validation');
