'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUid, findMatchingEntry } = require('../src/allowlist');

test('normalizeUid приводит к верхнему регистру с разделителями ":"', () => {
  assert.equal(normalizeUid('04331e2ac22191'), '04:33:1E:2A:C2:21:91');
  assert.equal(normalizeUid('04:33:1E:2A:C2:21:91'), '04:33:1E:2A:C2:21:91');
});

test('normalizeUid возвращает null для null', () => {
  assert.equal(normalizeUid(null), null);
});

test('normalizeUid бросает исключение на нечётной длине', () => {
  assert.throws(() => normalizeUid('04331e2ac2219'));
});

function makeAllowlist(tags) {
  return { version: 1, defaults: {}, tags };
}

test('findMatchingEntry: разрешает при совпадении UID и URL', () => {
  const allowlist = makeAllowlist([
    {
      id: 'test-02',
      name: 'TEST-02',
      enabled: true,
      uid: '04:33:1E:2A:C2:21:91',
      allowedUrls: ['https://example.com'],
      allowedUrlPrefixes: [],
      action: 'open_browser',
      browser: 'default',
      requireConfirmation: false
    }
  ]);
  const result = findMatchingEntry(allowlist, '04:33:1E:2A:C2:21:91', 'https://example.com', {});
  assert.ok(result.entry);
  assert.equal(result.entry.id, 'test-02');
});

test('findMatchingEntry: denied_unknown_uid для незарегистрированного UID', () => {
  const allowlist = makeAllowlist([
    {
      id: 'test-02',
      name: 'TEST-02',
      enabled: true,
      uid: '04:33:1E:2A:C2:21:91',
      allowedUrls: ['https://example.com'],
      allowedUrlPrefixes: [],
      action: 'open_browser',
      browser: 'default',
      requireConfirmation: false
    }
  ]);
  const result = findMatchingEntry(allowlist, '11:22:33:44:55:66:77', 'https://example.com', {});
  assert.equal(result.entry, null);
  assert.equal(result.reason, 'denied_unknown_uid');
});

test('findMatchingEntry: denied_url_mismatch при верном UID, но другом URL', () => {
  const allowlist = makeAllowlist([
    {
      id: 'test-02',
      name: 'TEST-02',
      enabled: true,
      uid: '04:33:1E:2A:C2:21:91',
      allowedUrls: ['https://example.com'],
      allowedUrlPrefixes: [],
      action: 'open_browser',
      browser: 'default',
      requireConfirmation: false
    }
  ]);
  const result = findMatchingEntry(allowlist, '04:33:1E:2A:C2:21:91', 'https://evil.example.com', {});
  assert.equal(result.entry, null);
  assert.equal(result.reason, 'denied_url_mismatch');
});

test('findMatchingEntry: выключенная запись (enabled=false) игнорируется', () => {
  const allowlist = makeAllowlist([
    {
      id: 'test-02',
      name: 'TEST-02',
      enabled: false,
      uid: '04:33:1E:2A:C2:21:91',
      allowedUrls: ['https://example.com'],
      allowedUrlPrefixes: [],
      action: 'open_browser',
      browser: 'default',
      requireConfirmation: false
    }
  ]);
  const result = findMatchingEntry(allowlist, '04:33:1E:2A:C2:21:91', 'https://example.com', {});
  assert.equal(result.entry, null);
  assert.equal(result.reason, 'denied_unknown_uid');
});

test('findMatchingEntry: uid=null означает, что UID не проверяется', () => {
  const allowlist = makeAllowlist([
    {
      id: 'no-uid-rule',
      name: 'Без UID',
      enabled: true,
      uid: null,
      allowedUrls: ['https://example.com'],
      allowedUrlPrefixes: [],
      action: 'open_browser',
      browser: 'default',
      requireConfirmation: true
    }
  ]);
  const result = findMatchingEntry(allowlist, 'AA:BB:CC:DD', 'https://example.com', {});
  assert.ok(result.entry);
  assert.equal(result.entry.id, 'no-uid-rule');
});
