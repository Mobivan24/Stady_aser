'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNdefFromMemory, decodeUriRecord, extractNdefMessageFromTlv } = require('../src/ndef-parser');

function buildUriRecord(prefixCode, rest) {
  const payload = Buffer.concat([Buffer.from([prefixCode]), Buffer.from(rest, 'utf8')]);
  const header = 0xd1; // MB=1 ME=1 SR=1 TNF=1 (well-known)
  const type = Buffer.from('U', 'ascii');
  return Buffer.concat([
    Buffer.from([header, type.length, payload.length]),
    type,
    payload
  ]);
}

function wrapInNdefTlv(ndefMessage) {
  return Buffer.concat([
    Buffer.from([0x03, ndefMessage.length]),
    ndefMessage,
    Buffer.from([0xfe]) // terminator TLV
  ]);
}

test('decodeUriRecord применяет префикс https://', () => {
  const uri = decodeUriRecord(Buffer.concat([Buffer.from([0x04]), Buffer.from('example.com')]));
  assert.equal(uri, 'https://example.com');
});

test('extractNdefMessageFromTlv находит NDEF Message TLV', () => {
  const record = buildUriRecord(0x04, 'example.com');
  const memory = wrapInNdefTlv(record);
  const message = extractNdefMessageFromTlv(memory);
  assert.deepEqual(message, record);
});

test('parseNdefFromMemory разбирает простую метку с URI-записью', () => {
  const record = buildUriRecord(0x04, 'example.com');
  const memory = wrapInNdefTlv(record);
  const result = parseNdefFromMemory(memory);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].kind, 'uri');
  assert.equal(result.records[0].uri, 'https://example.com');
});

test('parseNdefFromMemory возвращает пустой список для пустой метки', () => {
  const emptyMemory = Buffer.alloc(64, 0x00);
  const result = parseNdefFromMemory(emptyMemory);
  assert.deepEqual(result.records, []);
});

test('parseNdefFromMemory не бросает исключение на мусорных данных', () => {
  const garbage = Buffer.from([0x03, 0xff, 0xff, 0xff, 0x01, 0x02, 0x03]);
  assert.doesNotThrow(() => parseNdefFromMemory(garbage));
});
