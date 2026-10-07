import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checker = fileURLToPath(new URL('../scripts/check-publication.mjs', import.meta.url));
const syntheticMarker = ['synthetic', 'private', 'marker'].join('-');
const fakeCredential = ['alphabetic', 'fixture', 'value'].join('');
const fakeAccessToken = ['gh', 'p', '_', 'A'.repeat(32)].join('');
const fakePrivateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('') + '\nsynthetic fixture';
const badEmail = ['person', '@', 'sample.test'].join('');
const privateAddress = ['192', '168', '1', '23'].join('.');
const credentialAssignment = (key) => `const ${key} = '${fakeCredential}';`;

function run(directory, options = {}) {
  const args = [checker, '--root', directory];
  if (options.denylist) args.push('--private-denylist', options.denylist);
  if (options.history) args.push('--git-history');
  if (options.includeLocal) args.push('--include-local');
  return spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, 'Cannot prepare local synthetic Git fixture');
}

function initializeGit(directory) {
  git(directory, 'init', '--quiet');
  git(directory, 'config', 'user.name', 'Synthetic Test');
  git(directory, 'config', 'user.email', 'test@example.com');
}

function fixture(files, callback) {
  const directory = mkdtempSync(join(tmpdir(), 'taskmap-publication-test-'));
  try {
    for (const [path, text] of Object.entries(files)) {
      const full = join(directory, path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, text);
    }
    callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const cases = [
  ['documented placeholders', { 'README.md': 'you@example.com; example.atlassian.net; 192.0.2.10' }, 0],
  ['non-placeholder email', { 'fixture.ts': `const contact = '${badEmail}';` }, 1],
  ['access token format', { 'fixture.ts': `const value = '${fakeAccessToken}';` }, 1],
  ['private key block', { 'fixture.txt': fakePrivateKey }, 1],
  ['literal password', { 'fixture.ts': credentialAssignment('password') }, 1],
  ['prefixed token variable', { 'fixture.ts': credentialAssignment('JIRA_API_TOKEN') }, 1],
  ['camelcase token variable', { 'fixture.ts': credentialAssignment('proxyAuthToken') }, 1],
  ['synthetic credential placeholder', { 'fixture.ts': "const proxyAuthToken = 'synthetic_fixture';" }, 0],
  ['userinfo credential', { 'fixture.ts': `const url = '${'https://' + ['someone', fakeCredential].join(':') + '@example.com'}';` }, 1],
  ['documented dummy userinfo', { 'fixture.ts': 'const url = "https://user:pass@example.atlassian.net";' }, 0],
  ['live environment file', { '.env': '' }, 1],
  ['legitimate PHP API source', { 'deploy/api/feedback-public-config.php': '<?php echo json_encode([]);' }, 0],
  ['SVG masquerading as source', { 'src/fixture.tsx': '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, 1],
  ['SVG inside ordinary JSX', { 'src/fixture.tsx': 'import React from "react"; const Icon = () => <svg />;' }, 0],
  ['synthetic network policy', { 'server/policy.js': 'const blocks = ["10.0.0.0/8", "192.168.0.0/16"];' }, 0],
  ['generic IP is not a secret', { 'fixture.ts': `const host = '${privateAddress}';` }, 0],
  ['unreviewed archive', { 'export.zip': 'synthetic archive' }, 1],
];

for (const [name, files, expected] of cases) {
  test(`publication scanner: ${name}`, () => fixture(files, (directory) => {
    const result = run(directory);
    assert.equal(result.status, expected, 'Unexpected scanner status');
    const output = result.stdout + result.stderr;
    for (const value of [fakeCredential, fakeAccessToken, fakePrivateKey, badEmail, privateAddress]) {
      assert.equal(output.includes(value), false, 'Scanner exposed a synthetic matched value');
    }
  }));
}

for (const [name, files, value] of [
  ['private content', { 'fixture.ts': `const value = '${syntheticMarker}';` }, syntheticMarker],
  ['private filename', { [`${syntheticMarker}.txt`]: 'Synthetic fixture' }, syntheticMarker],
  ['private server address', { 'fixture.ts': `const host = '${privateAddress}';` }, privateAddress],
]) {
  test(`publication scanner: ${name}`, () => fixture(files, (directory) => {
    const privateDirectory = mkdtempSync(join(tmpdir(), 'taskmap-private-test-'));
    try {
      const denylist = join(privateDirectory, 'denylist.json');
      writeFileSync(denylist, JSON.stringify({ forbiddenLiterals: [value] }));
      const result = run(directory, { denylist });
      assert.equal(result.status, 1, 'Private identifier was not rejected');
      assert.equal((result.stdout + result.stderr).includes(value), false, 'Scanner exposed a private fixture value');
    } finally {
      rmSync(privateDirectory, { recursive: true, force: true });
    }
  }));
}

test('publication scanner: ignored local environment is omitted and nested Git is still detected', () => fixture({ '.gitignore': '.env\nnested/\n', '.env': 'Synthetic local configuration' }, (directory) => {
  initializeGit(directory);
  assert.equal(run(directory).status, 0, 'An ignored local environment file is not a publication candidate');
  assert.equal(run(directory, { includeLocal: true }).status, 1, 'The local inspection mode must reject live configuration');
  mkdirSync(join(directory, 'nested', '.git'), { recursive: true });
  const nested = run(directory);
  assert.equal(nested.status, 1, 'Ignored nested Git metadata must not be missed');
  assert.equal(nested.stderr.includes('nested-git-metadata'), true, 'The nested repository finding was missing');
}));

test('publication scanner: tracked environment remains forbidden despite ignore rules', () => fixture({ '.gitignore': '.env\n', '.env': 'Synthetic local configuration' }, (directory) => {
  initializeGit(directory);
  git(directory, 'add', '.gitignore');
  git(directory, 'add', '--force', '.env');
  git(directory, 'commit', '--quiet', '-m', 'Synthetic tracked environment fixture');
  assert.equal(run(directory).status, 1, 'Tracked live configuration must always fail');
  rmSync(join(directory, '.env'));
  assert.equal(run(directory).status, 1, 'A missing working file must not hide live configuration in the index');
}));

test('publication scanner: reachable Git history retains a removed secret', () => fixture({}, (directory) => {
  initializeGit(directory);
  writeFileSync(join(directory, 'fixture.ts'), `const value = '${fakeAccessToken}';`);
  git(directory, 'add', 'fixture.ts');
  git(directory, 'commit', '--quiet', '-m', 'Synthetic fixture');
  writeFileSync(join(directory, 'fixture.ts'), "const value = 'example_token';");
  assert.equal(run(directory).status, 1, 'A clean working file must not hide a secret still present in the index');
  git(directory, 'add', 'fixture.ts');
  git(directory, 'commit', '--quiet', '-m', 'Replace synthetic fixture');
  assert.equal(run(directory).status, 0, 'The clean current tree should pass');
  const result = run(directory, { history: true });
  assert.equal(result.status, 1, 'A secret in reachable history was not rejected');
  assert.equal((result.stdout + result.stderr).includes(fakeAccessToken), false, 'Scanner exposed a historical fixture value');
}));
