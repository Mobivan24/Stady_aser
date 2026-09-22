'use strict';

const fs = require('fs');
const { assertValidAllowedTags } = require('./config-schema');
const { isUrlAllowedByEntry } = require('./url-policy');

/**
 * Нормализует UID к единому формату: верхний регистр, байты через ':'.
 * Принимает как "04331e2ac22191", так и "04:33:1E:2A:C2:21:91".
 */
function normalizeUid(uid) {
  if (uid === null || uid === undefined) return null;
  const hex = String(uid).replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length === 0 || hex.length % 2 !== 0) {
    throw new Error(`Некорректный UID: "${uid}"`);
  }
  return hex.match(/.{2}/g).join(':');
}

/**
 * Загружает и валидирует config/allowed-tags.json.
 * Бросает исключение при синтаксической или схемной ошибке — вызывающий
 * код должен обработать это как "конфигурация невалидна, не менять
 * текущее поведение" (см. index.js reloadConfig).
 */
function loadAllowlist(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  assertValidAllowedTags(data);

  const defaults = data.defaults || {};
  const tags = data.tags.map((tag) => ({
    ...defaults,
    ...tag,
    uid: tag.uid === null || tag.uid === undefined ? null : normalizeUid(tag.uid),
    allowedUrlPrefixes: tag.allowedUrlPrefixes || []
  }));

  return { version: data.version, defaults, tags };
}

/**
 * Ищет первую активную запись допуска, которая одновременно:
 *  - enabled === true
 *  - UID совпадает (или в записи uid === null — UID не проверяется)
 *  - URL совпадает точно либо по разрешённому префиксу с учётом схемы
 *
 * Возвращает { entry, urlCheck } либо { entry: null, reason } с причиной
 * отказа для журналирования (denied_unknown_uid / denied_url_mismatch /
 * denied_disabled).
 */
function findMatchingEntry(allowlist, normalizedUid, rawUrl, settings) {
  const candidatesByUid = allowlist.tags.filter((t) => t.enabled);

  if (candidatesByUid.length === 0) {
    return { entry: null, reason: 'denied_unknown_uid' };
  }

  let sawUidMatch = false;

  for (const entry of candidatesByUid) {
    const uidMatches = entry.uid === null || entry.uid === normalizedUid;
    if (!uidMatches) continue;
    sawUidMatch = true;

    const check = isUrlAllowedByEntry(rawUrl, entry, settings);
    if (check.allowed) {
      return { entry, urlCheck: check };
    }
  }

  if (!sawUidMatch) {
    return { entry: null, reason: 'denied_unknown_uid' };
  }
  return { entry: null, reason: 'denied_url_mismatch' };
}

module.exports = {
  normalizeUid,
  loadAllowlist,
  findMatchingEntry
};
