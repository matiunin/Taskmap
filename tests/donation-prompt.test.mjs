import test from 'node:test';
import assert from 'node:assert/strict';
import { DonationPromptTracker, DONATION_VISITS_KEY, DONATION_SEEN_KEY, DONATION_SESSION_KEY } from '../src/utils/donationPrompt.ts';
import { JiraReadinessObserver, isJiraReadRequest } from '../src/utils/jiraReadiness.ts';

const storage = () => {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('Only a qualified third tab session is eligible; reload, StrictMode and reconnect count once', () => {
  const local = storage();
  for (let visit = 1; visit <= 3; visit++) {
    const session = storage();
    const tracker = new DonationPromptTracker(local, session);
    assert.equal(tracker.shouldPrompt(), false, 'A saved config alone does not count');
    assert.equal(tracker.recordQualifiedVisit(), visit === 3);
    assert.equal(tracker.recordQualifiedVisit(), visit === 3, 'Repeated successful requests do not increment');
    const refreshed = new DonationPromptTracker(local, session);
    assert.equal(refreshed.recordQualifiedVisit(), visit === 3, 'Reload keeps the session guard');
    assert.equal(local.getItem(DONATION_VISITS_KEY), String(visit));
    assert.deepEqual([...session.values], [[DONATION_SESSION_KEY, 'true']]);
  }
  assert.equal(new DonationPromptTracker(local, storage()).recordQualifiedVisit(), true);
  assert.equal(local.getItem(DONATION_VISITS_KEY), '3', 'Counter is capped');
  assert.deepEqual([...local.values.keys()], [DONATION_VISITS_KEY], 'No identity or history is stored');
});

test('A real manual or automatic opening suppresses prompts in this and future sessions', () => {
  const local = storage();
  const first = new DonationPromptTracker(local, storage());
  first.markShown();
  assert.equal(local.getItem(DONATION_SEEN_KEY), 'true');
  assert.equal(first.recordQualifiedVisit(), false);
  assert.equal(new DonationPromptTracker(local, storage()).recordQualifiedVisit(), false);
  assert.equal(local.getItem(DONATION_VISITS_KEY), null, 'Manual opening needs no connection');
});

test('Storage exceptions and malformed flags disable automatic prompts without throwing', () => {
  const broken = { getItem() { throw new Error('Synthetic storage failure'); }, setItem() { throw new Error('Synthetic storage failure'); } };
  for (const [local, session] of [[broken, storage()], [storage(), broken]]) {
    const tracker = new DonationPromptTracker(local, session);
    assert.equal(tracker.recordQualifiedVisit(), false);
    assert.equal(tracker.shouldPrompt(), false);
    assert.doesNotThrow(() => tracker.markShown(), 'Manual dialog remains independent of bookkeeping');
  }
  for (const [key, value] of [[DONATION_VISITS_KEY, '-1'], [DONATION_VISITS_KEY, '99'], [DONATION_VISITS_KEY, '{}'], [DONATION_SEEN_KEY, 'false']]) {
    const local = storage();
    local.setItem(key, value);
    const tracker = new DonationPromptTracker(local, storage());
    assert.equal(tracker.recordQualifiedVisit(), false);
    local.setItem(DONATION_VISITS_KEY, '3');
    assert.equal(tracker.shouldPrompt(), false, 'A failed tracker remains disabled');
  }
  const local = storage();
  const session = storage();
  session.setItem(DONATION_SESSION_KEY, 'false');
  assert.equal(new DonationPromptTracker(local, session).recordQualifiedVisit(), false);
});

test('A failed write can delay eligibility but never adds a second visit on refresh', () => {
  const local = storage();
  const session = storage();
  const writeFails = { getItem: local.getItem, setItem() { throw new Error('Synthetic quota failure'); } };
  const tracker = new DonationPromptTracker(writeFails, session);
  assert.equal(tracker.recordQualifiedVisit(), false);
  assert.equal(session.getItem(DONATION_SESSION_KEY), 'true');
  assert.equal(new DonationPromptTracker(local, session).recordQualifiedVisit(), false);
  assert.equal(local.getItem(DONATION_VISITS_KEY), null);
});

test('Only same-tenant REST reads and POST JQL searches qualify, never health or automation', () => {
  const base = 'https://example.atlassian.net';
  assert.equal(isJiraReadRequest(`${base}/rest/api/3/myself`, base, 'GET'), true);
  assert.equal(isJiraReadRequest(`${base}/rest/api/3/search/jql`, base, 'POST', { jql: 'project = TEST' }), true);
  for (const [url, method, data] of [
    [`${base}/rest/api/3/issue/TEST-1`, 'PUT', {}],
    [`${base}/rest/api/3/search/jql`, 'POST', { jql: ['project = TEST'] }],
    [`${base}/rest/api/3/search/jql`, 'POST', null],
    [`${base}/gateway/api/automation/rule`, 'GET', null],
    [`${base}/_edge/tenant_info`, 'GET', null],
    ['http://127.0.0.1:3004/api/health', 'GET', null],
    ['https://other.example.com/rest/api/3/myself', 'GET', null],
  ]) assert.equal(isJiraReadRequest(url, base, method, data), false);
});

test('Readiness ignores old responses after changing or reconnecting the same config object', () => {
  const observer = new JiraReadinessObserver();
  const states = [];
  observer.subscribe((state) => states.push(state));
  const config = {};
  observer.setConfig(config);
  const stale = observer.begin(config);
  observer.setConfig(null);
  observer.setConfig(config);
  observer.success(stale, true);
  observer.finish(stale, false);
  assert.deepEqual(states.at(-1), { ready: false, pendingRequests: 0 });
  const current = observer.begin(config);
  observer.success(current, true);
  observer.finish(current, false);
  assert.deepEqual(states.at(-1), { ready: true, pendingRequests: 0 });
  const failed = observer.begin(config);
  observer.finish(failed, true);
  assert.deepEqual(states.at(-1), { ready: false, pendingRequests: 0 }, 'Jira failures stop the prompt');
  const write = observer.begin(config);
  observer.success(write, false);
  observer.finish(write, false);
  assert.equal(states.at(-1).ready, false, 'A successful write cannot verify a connection');
  const old = observer.begin(config);
  observer.setConfig({});
  observer.success(old, true);
  observer.finish(old, false);
  assert.equal(states.at(-1).ready, false);
});

test('One faulty readiness listener cannot affect requests or other observers', () => {
  const observer = new JiraReadinessObserver();
  observer.subscribe(() => { throw new Error('Synthetic optional observer failure'); });
  let latest;
  const unsubscribe = observer.subscribe((state) => { latest = state; });
  const config = {};
  assert.doesNotThrow(() => {
    observer.setConfig(config);
    const request = observer.begin(config);
    observer.success(request, true);
    observer.finish(request, false);
  });
  assert.deepEqual(latest, { ready: true, pendingRequests: 0 });
  unsubscribe();
  observer.setConfig(null);
  assert.deepEqual(latest, { ready: true, pendingRequests: 0 });
});
