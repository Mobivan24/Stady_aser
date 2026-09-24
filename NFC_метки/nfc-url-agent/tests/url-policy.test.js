'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isUrlAllowedByEntry, isSchemeAllowed, parseUrl } = require('../src/url-policy');

test('https разрешён всегда', () => {
  const url = parseUrl('https://example.com');
  assert.equal(isSchemeAllowed(url, {}), true);
});

test('http запрещён по умолчанию', () => {
  const url = parseUrl('http://192.168.1.10/');
  assert.equal(isSchemeAllowed(url, { allowHttpLocal: false }), false);
});

test('http разрешён для локального адреса при allowHttpLocal=true', () => {
  const url = parseUrl('http://192.168.1.10/');
  assert.equal(isSchemeAllowed(url, { allowHttpLocal: true }), true);
});

test('http для публичного адреса запрещён даже при allowHttpLocal=true', () => {
  const url = parseUrl('http://example.com/');
  assert.equal(isSchemeAllowed(url, { allowHttpLocal: true }), false);
});

test('isUrlAllowedByEntry: точное совпадение URL', () => {
  const entry = { allowedUrls: ['https://example.com'], allowedUrlPrefixes: [] };
  const result = isUrlAllowedByEntry('https://example.com', entry, {});
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'exact_match');
});

test('isUrlAllowedByEntry: совпадение по префиксу', () => {
  const entry = { allowedUrls: [], allowedUrlPrefixes: ['https://ha.example.local/'] };
  const result = isUrlAllowedByEntry('https://ha.example.local/dashboard', entry, {});
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'prefix_match');
});

test('isUrlAllowedByEntry: несовпадение URL отклоняется', () => {
  const entry = { allowedUrls: ['https://example.com'], allowedUrlPrefixes: [] };
  const result = isUrlAllowedByEntry('https://evil.example.com', entry, {});
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'url_mismatch');
});

test('isUrlAllowedByEntry: запрещённая схема отклоняется даже при точном совпадении', () => {
  const entry = { allowedUrls: ['javascript:alert(1)'], allowedUrlPrefixes: [] };
  const result = isUrlAllowedByEntry('javascript:alert(1)', entry, {});
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'scheme_denied');
});

test('isUrlAllowedByEntry: невалидный URL отклоняется', () => {
  const entry = { allowedUrls: ['https://example.com'], allowedUrlPrefixes: [] };
  const result = isUrlAllowedByEntry('not a url', entry, {});
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'invalid_url');
});
