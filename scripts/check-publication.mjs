#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Reports file locations and rule names only. Never print a matched value.
const options = { root: fileURLToPath(new URL('../', import.meta.url)), history: false };
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--git-history') options.history = true;
  else if (arg === '--include-local') options.includeLocal = true;
  else if ((arg === '--root' || arg === '--private-denylist') && process.argv[i + 1]) {
    options[arg === '--root' ? 'root' : 'denylist'] = resolve(process.argv[++i]);
  } else if (arg === '--help') {
    console.log('Usage: node scripts/check-publication.mjs [--root DIRECTORY] [--git-history] [--include-local] [--private-denylist FILE]');
    console.log('Private JSON format: { "forbiddenLiterals": ["private value"], "forbiddenPatterns": ["private regex"] }');
    process.exit(0);
  } else {
    console.error('Unknown or incomplete option. Use --help.');
    process.exit(2);
  }
}
options.root = resolve(options.root);
options.denylist ??= process.env.PUBLICATION_DENYLIST_FILE;

let privateLiterals = [];
let privatePatterns = [];
if (options.denylist) {
  try {
    const input = JSON.parse(readFileSync(options.denylist, 'utf8'));
    if (!Array.isArray(input.forbiddenLiterals ?? []) || !Array.isArray(input.forbiddenPatterns ?? [])) throw new Error();
    privateLiterals = (input.forbiddenLiterals ?? []).map((value) => {
      if (typeof value !== 'string' || value.length < 3) throw new Error();
      return value.toLowerCase();
    });
    privatePatterns = (input.forbiddenPatterns ?? []).map((value) => {
      if (typeof value !== 'string' || value.length === 0) throw new Error();
      return new RegExp(value, 'giu');
    });
  } catch {
    console.error('Cannot load private denylist: check its JSON, strings and regular expressions. Values were not printed.');
    process.exit(2);
  }
}

const excludedDirectories = new Set(['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report', '__pycache__', '.pytest_cache', '.mypy_cache', '.venv', 'venv']);
const findings = new Map();
let scannedFiles = 0;
let scannedHistoryBlobs = 0;
let scannedIndexBlobs = 0;
let imageFiles = 0;
let gitCandidates;
const indexedFiles = new Map();
const workingHashes = new Map();

function report(path, rule, line, revision) {
  const key = `${revision ?? ''}\0${path}\0${rule}\0${line ?? ''}`;
  let safePath = path;
  for (const value of privateLiterals) safePath = safePath.replaceAll(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[redacted]');
  for (const regex of privatePatterns) {
    regex.lastIndex = 0;
    safePath = safePath.replace(regex, '[redacted]');
  }
  safePath = safePath.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]');
  safePath = safePath.replace(/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,})/g, '[redacted]');
  findings.set(key, { path: safePath, rule, ...(line ? { line } : {}), ...(revision ? { revision } : {}) });
}

function forbiddenPath(path) {
  const name = path.split('/').at(-1);
  const lower = name.toLowerCase();
  const example = /(?:^|\.)(?:example|sample|template)(?:\.|$)/i.test(name);
  if (path.split('/').includes('.git')) return 'nested-git-metadata';
  if (path.split('/').some((part) => excludedDirectories.has(part))) return 'generated-or-vendored-artifact';
  if (/^(?:archive|Screenshots)(?:\/|$)/.test(path) || /(?:^|\/)(?:\.cursor|\.idea|\.vscode)(?:\/|$)/.test(path)) return 'private-or-old-export-directory';
  if (!example && (lower === '.env' || lower.startsWith('.env.') || lower === 'deploy.config' || lower.startsWith('deploy.config.'))) return 'live-environment-or-deploy-config';
  if (!example && /^(?:db-config\.(?:php|json)|robokassa-config\.php|feedback-config\.php|auth-secret\.php)$/.test(lower)) return 'live-credential-config';
  if (/\.(?:pem|key|p12|pfx|session|session-journal|sqlite(?:3|-wal|-shm)?|db(?:-wal|-shm)?|log|bak|backup|dump|zip|tar|tgz|gz|7z|rar)$/i.test(name)) return 'private-key-runtime-or-backup-file';
  if (/^(?:feedback\.csv|feedback-runtime\.json|pricing\.json|publication-denylist\.json)$/i.test(name)) return 'private-runtime-or-audit-data';
  if (/(?:^|\/)data\//.test(path) && !example && !['.gitkeep', '.htaccess', 'README.md'].includes(name)) return 'unreviewed-runtime-data';
  if (/^(?:\.DS_Store|Thumbs\.db)$/i.test(name)) return 'local-system-metadata';
  return undefined;
}

const placeholder = (value) => {
  const text = value.trim();
  return text.length === 0 || /^(?:your[_ -]|example(?:[_ -]|$)|synthetic[_ -]|placeholder(?:[_ -]|$)|replace[_ -]|change[_ -]?me|demo[_ -]|sample[_ -]|test[_ -]|<|\$\{|\{\{|\*{3})/i.test(text)
    || /^(?:password|secret|token|username|api[_ -]?token|api[_ -]?key)$/i.test(text);
};
const exampleEmail = (domain) => /(?:^|\.)(?:example\.(?:com|org|net)|example|invalid|localhost)$/i.test(domain);
const exampleJira = (host) => /^(?:example|your-company|your-domain|yourcompany|yourdomain|mycompany|company|test)\.atlassian\.net$/i.test(host);
const textRules = [
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['known-access-token-format', /(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{25,})/g],
];

function scan(path, data, revision) {
  const badPath = forbiddenPath(path);
  if (badPath) report(path, badPath, undefined, revision);
  privateLiterals.forEach((value, item) => {
    if (path.toLowerCase().includes(value)) report(path, `private-denylist-literal-${item + 1}`, undefined, revision);
  });
  privatePatterns.forEach((regex, item) => {
    regex.lastIndex = 0;
    if (regex.test(path)) report(path, `private-denylist-pattern-${item + 1}`, undefined, revision);
  });
  const binary = data.includes(0);
  const text = data.toString(binary ? 'latin1' : 'utf8');
  const lines = text.split('\n');
  if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(path)) imageFiles += 1;
  if (/\.[cm]?tsx?$/.test(path) && /^\s*(?:<\?xml[^>]*>\s*)?(?:<!DOCTYPE\s+svg[^>]*>\s*)?<svg\b/i.test(text.slice(0, 4096))) report(path, 'image-masquerading-as-source', 1, revision);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [rule, regex] of textRules) {
      regex.lastIndex = 0;
      if (regex.test(line)) report(path, rule, index + 1, revision);
    }
    const userinfoUrls = [...line.matchAll(/https?:\/\/[^\s/"'<>@]+@[^\s/"'<>]+/g)];
    for (const match of userinfoUrls) {
      let synthetic = false;
      try {
        const url = new URL(match[0]);
        const user = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);
        const documentedHost = exampleEmail(url.hostname) || exampleJira(url.hostname);
        const commonDummy = ['username:password', 'user:password', 'user:pass', 'u:p'].includes(`${user}:${password}`);
        synthetic = (placeholder(user) && placeholder(password)) || (commonDummy && documentedHost);
      } catch { /* An unparseable userinfo URL still requires review. */ }
      if (!synthetic) report(path, 'credential-bearing-url', index + 1, revision);
    }
    for (const match of line.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) {
      if (userinfoUrls.some((url) => match.index >= url.index && match.index < url.index + url[0].length)) continue;
      if (!exampleEmail(match[1])) report(path, 'non-placeholder-email', index + 1, revision);
    }
    for (const match of line.matchAll(/\b([A-Z0-9.-]+\.atlassian\.net)\b/gi)) {
      if (!exampleJira(match[1])) report(path, 'non-placeholder-jira-host', index + 1, revision);
    }
    for (const match of line.matchAll(/\b[A-Z0-9_-]*(?:api[_-]?key|token|password|passwd|secret)\b\s*["']?\s*(?:=>|:|=)\s*["']([^"'\r\n]+)["']/gi)) {
      const value = match[1];
      // Human-readable translation labels are not credentials. Token formats are checked separately.
      if (!/^src\/i18n\/locales\//.test(path) && !placeholder(value) && !/\s/.test(value) && value.length >= 8 && /[A-Za-z]/.test(value)) {
        report(path, 'literal-credential-assignment', index + 1, revision);
      }
    }
    for (const match of line.matchAll(/\bBearer\s+([A-Za-z0-9._~+/-]{8,})/g)) {
      if (!placeholder(match[1])) report(path, 'literal-bearer-credential', index + 1, revision);
    }
    const lower = line.toLowerCase();
    privateLiterals.forEach((value, item) => {
      if (lower.includes(value)) report(path, `private-denylist-literal-${item + 1}`, index + 1, revision);
    });
    privatePatterns.forEach((regex, item) => {
      regex.lastIndex = 0;
      if (regex.test(line)) report(path, `private-denylist-pattern-${item + 1}`, index + 1, revision);
    });
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    const path = relative(options.root, full).split(sep).join('/');
    if (path === '.git') continue;
    if (entry.name === '.git') {
      report(path, 'nested-git-metadata');
      continue;
    }
    if (entry.isSymbolicLink()) {
      if (!gitCandidates || gitCandidates.has(path)) report(path, 'unreviewed-symbolic-link');
      continue;
    }
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) continue;
      walk(full);
    } else if (entry.isFile()) {
      if (gitCandidates && !gitCandidates.has(path)) continue;
      const data = readFileSync(full);
      scan(path, data);
      const indexed = indexedFiles.get(path);
      if (indexed) {
        const format = indexed.oid.length === 64 ? 'sha256' : 'sha1';
        workingHashes.set(path, createHash(format).update(`blob ${data.length}\0`).update(data).digest('hex'));
      }
      scannedFiles += 1;
    }
  }
}

function git(...args) {
  const result = spawnSync('git', ['-C', options.root, ...args], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error('Git history could not be inspected.');
  return result.stdout;
}

try {
  if (!statSync(options.root).isDirectory()) throw new Error();
  let inGit = false;
  try { inGit = git('rev-parse', '--is-inside-work-tree').toString('utf8').trim() === 'true'; } catch { /* Non-Git exports are inspected directly. */ }
  if (inGit) {
    if (!options.includeLocal) gitCandidates = new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString('utf8').split('\0').filter(Boolean));
    for (const entry of git('ls-files', '--stage', '-z').toString('utf8').split('\0').filter(Boolean)) {
      const tab = entry.indexOf('\t');
      const [mode, oid, stage] = entry.slice(0, tab).split(' ');
      const path = entry.slice(tab + 1);
      if (stage !== '0') {
        report(path, 'unmerged-index-entry', undefined, 'index');
      } else if (mode === '160000') {
        report(path, 'unreviewed-nested-repository', undefined, 'index');
      } else {
        if (mode === '120000') report(path, 'unreviewed-symbolic-link', undefined, 'index');
        indexedFiles.set(path, { mode, oid });
      }
    }
  }
  walk(options.root);
  // A sanitized working file must not hide different content already staged in Git.
  for (const [path, indexed] of indexedFiles) {
    if (workingHashes.get(path) === indexed.oid) continue;
    scan(path, git('cat-file', 'blob', indexed.oid), 'index');
    scannedIndexBlobs += 1;
  }
  if (options.history) {
    const revisions = git('rev-list', '--all').toString('utf8').trim().split('\n').filter(Boolean);
    const seen = new Set();
    for (const revision of revisions) {
      const entries = git('ls-tree', '-r', '-z', revision).toString('utf8').split('\0').filter(Boolean);
      for (const entry of entries) {
        const tab = entry.indexOf('\t');
        const [mode, type, oid] = entry.slice(0, tab).split(' ');
        const path = entry.slice(tab + 1);
        if (mode === '120000') report(path, 'unreviewed-symbolic-link', undefined, revision.slice(0, 12));
        if (mode === '160000' || type !== 'blob') {
          report(path, 'unreviewed-nested-repository', undefined, revision.slice(0, 12));
          continue;
        }
        const key = `${path}\0${oid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        scan(path, git('cat-file', 'blob', oid), revision.slice(0, 12));
        scannedHistoryBlobs += 1;
      }
    }
  }
} catch {
  console.error('Publication scan failed while reading files or Git history. No source content was printed.');
  process.exit(2);
}

const results = [...findings.values()].sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
for (const finding of results) console.error(JSON.stringify(finding));
console.log(JSON.stringify({ ok: results.length === 0, scannedFiles, scannedIndexBlobs, scannedHistoryBlobs, findings: results.length, imageFiles, gitIgnoreApplied: Boolean(gitCandidates), privateDenylistLoaded: Boolean(options.denylist) }));
if (results.length === 0) console.log('Pattern checks passed. Review images, demo content and access configuration before publishing.');
process.exitCode = results.length === 0 ? 0 : 1;
