'use strict';

// Разрешённые по умолчанию схемы. http допускается только для локальных
// адресов и только если settings.allowHttpLocal === true.
const ALWAYS_ALLOWED_SCHEMES = new Set(['https:']);
const LOCAL_ONLY_SCHEMES = new Set(['http:']);

/**
 * Безопасно парсит строку в URL. Возвращает null вместо исключения,
 * чтобы вызывающий код не мог случайно продолжить работу с "почти URL".
 */
function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(hostname) {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host.endsWith('.local')) {
    return true;
  }

  // IPv4 приватные диапазоны и loopback.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    return false;
  }

  // IPv6 loopback / unique local.
  if (host === '::1') return true;
  if (host.startsWith('fd') || host.startsWith('fc')) return true; // fc00::/7

  return false;
}

/**
 * Проверяет, разрешена ли схема URL согласно политике.
 * https: разрешён всегда. http: разрешён только для локальных/приватных
 * адресов и только если allowHttpLocal включён в settings.
 */
function isSchemeAllowed(url, settings) {
  if (ALWAYS_ALLOWED_SCHEMES.has(url.protocol)) {
    return true;
  }

  if (LOCAL_ONLY_SCHEMES.has(url.protocol)) {
    if (!settings || settings.allowHttpLocal !== true) {
      return false;
    }
    return isPrivateOrLocalHost(url.hostname);
  }

  return false;
}

/**
 * Точное совпадение URL: сравнение нормализованных строк URL (через
 * повторный парсинг обеих сторон, чтобы избежать эквивалентных, но
 * текстуально разных записей, напр. с/без trailing slash по умолчанию).
 */
function matchesExactUrl(url, allowedUrls) {
  if (!Array.isArray(allowedUrls)) return false;
  return allowedUrls.some((candidate) => {
    const allowed = parseUrl(candidate);
    return allowed !== null && allowed.href === url.href;
  });
}

/**
 * Совпадение по префиксу: сравнение строкового префикса, префикс должен
 * быть валидным URL-подобным началом (защищает от обхода вида
 * "https://evil.com?x=https://allowed.com").
 */
function matchesUrlPrefix(url, allowedUrlPrefixes) {
  if (!Array.isArray(allowedUrlPrefixes)) return false;
  return allowedUrlPrefixes.some((prefix) => url.href.startsWith(prefix));
}

/**
 * Итоговая проверка: URL должен парситься, схема быть разрешённой,
 * и совпадать точно или по префиксу с записью допуска.
 */
function isUrlAllowedByEntry(rawUrl, entry, settings) {
  const url = parseUrl(rawUrl);
  if (!url) {
    return { allowed: false, reason: 'invalid_url' };
  }

  if (!isSchemeAllowed(url, settings)) {
    return { allowed: false, reason: 'scheme_denied', url };
  }

  const exact = matchesExactUrl(url, entry.allowedUrls);
  const prefix = !exact && matchesUrlPrefix(url, entry.allowedUrlPrefixes || []);

  if (!exact && !prefix) {
    return { allowed: false, reason: 'url_mismatch', url };
  }

  return { allowed: true, reason: exact ? 'exact_match' : 'prefix_match', url };
}

module.exports = {
  parseUrl,
  isSchemeAllowed,
  isPrivateOrLocalHost,
  matchesExactUrl,
  matchesUrlPrefix,
  isUrlAllowedByEntry
};
