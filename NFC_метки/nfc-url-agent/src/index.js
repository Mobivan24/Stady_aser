'use strict';

const fs = require('fs');
const path = require('path');

const { PcscReaderManager } = require('./pcsc-reader');
const acr122u = require('./acr122u');
const { parseNdefFromMemory } = require('./ndef-parser');
const { loadAllowlist, findMatchingEntry, normalizeUid } = require('./allowlist');
const { assertValidSettings } = require('./config-schema');
const { openUrl, showConfirmationDialog, BrowserOpenError, CONFIRM_TIMEOUT_MS } = require('./browser');
const { Logger } = require('./logger');
const ui = require('./ui');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
const ALLOWED_TAGS_PATH = path.join(CONFIG_DIR, 'allowed-tags.json');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

// --- Состояние приложения --------------------------------------------
let settings = null;
let allowlist = null;
let logger = null;
let paused = false;
/** true, пока на экране открыто окно подтверждения — второе не показываем */
let confirmationPending = false;
/** cooldownKey ("UID::URL") -> timestamp последнего успешного открытия */
const cooldownMap = new Map();

function loadConfigOrThrow() {
  const rawSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  assertValidSettings(rawSettings);
  const loadedAllowlist = loadAllowlist(ALLOWED_TAGS_PATH);
  return { rawSettings, loadedAllowlist };
}

function loadConfigAtStartup() {
  const { rawSettings, loadedAllowlist } = loadConfigOrThrow();
  settings = rawSettings;
  allowlist = loadedAllowlist;
}

function reloadConfig() {
  try {
    const { rawSettings, loadedAllowlist } = loadConfigOrThrow();
    settings = rawSettings;
    allowlist = loadedAllowlist;
    logger.log({ event: 'config_reload', result: 'ok' });
    ui.printStatus('Конфигурация перезагружена успешно.', 'green');
  } catch (err) {
    logger.log({ event: 'config_reload', result: 'error', error: err.message });
    ui.printStatus(
      `Ошибка перезагрузки конфигурации: ${err.message}. Продолжаю работу со старой конфигурацией.`,
      'red'
    );
  }
}

function checkConfigOnly() {
  try {
    loadConfigOrThrow();
    ui.printStatus('Конфигурация валидна.', 'green');
  } catch (err) {
    ui.printStatus(`Конфигурация НЕВАЛИДНА: ${err.message}`, 'red');
  }
}

// --- Обработка вставки метки ------------------------------------------

async function handleCardInserted(transmit, readerName) {
  if (paused) {
    ui.printStatus('Метка обнаружена, но сканирование приостановлено — игнорирую.', 'yellow');
    return;
  }

  ui.printStatus('Метка обнаружена.', 'cyan');

  let uidBuffer;
  try {
    uidBuffer = await acr122u.readUid(transmit);
  } catch (err) {
    logger.log({ event: 'tag_read', reader: readerName, result: 'read_error', error: err.message });
    ui.printStatus(`Не удалось прочитать UID метки: ${err.message}`, 'red');
    return;
  }

  const normalizedUid = normalizeUid(uidBuffer.toString('hex'));

  let memory;
  try {
    memory = await acr122u.readUserMemory(transmit);
  } catch (err) {
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: logger.redactUid(normalizedUid),
      result: 'read_error',
      error: err.message
    });
    ui.printStatus(`Ошибка чтения памяти метки: ${err.message}`, 'red');
    return;
  }

  let parsed;
  try {
    parsed = parseNdefFromMemory(memory);
  } catch (err) {
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: logger.redactUid(normalizedUid),
      result: 'read_error',
      error: `Ошибка разбора NDEF: ${err.message}`
    });
    ui.printStatus(`Метка обнаружена, но её NDEF-данные повреждены или не поддерживаются.`, 'yellow');
    return;
  }

  if (parsed.records.length === 0) {
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: logger.redactUid(normalizedUid),
      result: 'unsupported_tag',
      note: 'empty_or_no_ndef'
    });
    ui.printStatus('Метка обнаружена, но разрешённая NDEF URL-запись не найдена.', 'yellow');
    return;
  }

  for (const record of parsed.records) {
    if (record.kind === 'text') {
      ui.printStatus(`Text-запись на метке (только для информации): [${record.lang}] ${record.text}`, 'gray');
      logger.log({
        event: 'tag_read',
        reader: readerName,
        uid: logger.redactUid(normalizedUid),
        result: 'text_record',
        text: record.text
      });
    }
  }

  const uriRecord = parsed.records.find((r) => r.kind === 'uri' && r.uri);
  if (!uriRecord) {
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: logger.redactUid(normalizedUid),
      result: 'unsupported_tag',
      note: 'no_uri_record'
    });
    ui.printStatus('Метка обнаружена, но разрешённая NDEF URL-запись не найдена.', 'yellow');
    return;
  }

  await evaluateAndMaybeOpen({ readerName, normalizedUid, rawUrl: uriRecord.uri });
}

async function evaluateAndMaybeOpen({ readerName, normalizedUid, rawUrl }) {
  const redactedUid = logger.redactUid(normalizedUid);
  const match = findMatchingEntry(allowlist, normalizedUid, rawUrl, settings);

  if (!match.entry) {
    const message =
      match.reason === 'denied_url_mismatch'
        ? 'URL не совпадает с разрешённым правилом.'
        : 'Метка не внесена в таблицу допуска.';
    ui.printStatus(message, 'red');
    logger.log({ event: 'tag_read', reader: readerName, uid: redactedUid, url: rawUrl, result: match.reason });
    return;
  }

  const entry = match.entry;
  const cooldownSeconds = entry.cooldownSeconds ?? allowlist.defaults.cooldownSeconds ?? 5;
  const cooldownKey = `${normalizedUid || 'no-uid'}::${rawUrl}`;
  const lastOpenedAt = cooldownMap.get(cooldownKey);

  if (lastOpenedAt && Date.now() - lastOpenedAt < cooldownSeconds * 1000) {
    ui.printStatus(`Повторное открытие "${entry.name}" в пределах cooldown — пропущено.`, 'gray');
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: redactedUid,
      url: rawUrl,
      rule: entry.id,
      result: 'cooldown_skipped'
    });
    return;
  }

  if (settings.dryRun) {
    ui.printStatus(
      `[dry-run] Правило "${entry.name}" разрешает открытие ${rawUrl} (браузер не запускается).`,
      'cyan'
    );
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: redactedUid,
      url: rawUrl,
      rule: entry.id,
      result: 'dry_run_allowed'
    });
    return;
  }

  const requireConfirmation = entry.requireConfirmation !== false;

  if (requireConfirmation) {
    if (confirmationPending) {
      ui.printStatus('Уже ожидается подтверждение — повторное прикладывание пропущено.', 'gray');
      logger.log({
        event: 'tag_read',
        reader: readerName,
        uid: redactedUid,
        url: rawUrl,
        rule: entry.id,
        result: 'confirmation_pending_skipped'
      });
      return;
    }

    confirmationPending = true;
    let confirmation;
    try {
      confirmation = await showConfirmationDialog(entry.name, rawUrl);
    } catch (err) {
      confirmation = { status: 'error', detail: err.message };
    } finally {
      confirmationPending = false;
    }

    if (confirmation.status !== 'confirmed') {
      const timeoutSec = Math.round(CONFIRM_TIMEOUT_MS / 1000);
      const messages = {
        cancelled: 'Открытие отменено пользователем.',
        timeout: `Нет ответа ${timeoutSec} с — открытие отменено автоматически.`,
        error: `Ошибка окна подтверждения: ${confirmation.detail}. Ссылка не открыта.`
      };
      const results = {
        cancelled: 'cancelled',
        timeout: 'confirm_timeout',
        error: 'confirm_error'
      };
      ui.printStatus(
        messages[confirmation.status] || messages.error,
        confirmation.status === 'error' ? 'red' : 'yellow'
      );
      const logEntry = {
        event: 'tag_read',
        reader: readerName,
        uid: redactedUid,
        url: rawUrl,
        rule: entry.id,
        result: results[confirmation.status] || 'confirm_error'
      };
      if (confirmation.detail) logEntry.error = confirmation.detail;
      logger.log(logEntry);
      return;
    }
  }

  try {
    await openUrl(rawUrl, entry.browser, settings);
    cooldownMap.set(cooldownKey, Date.now());
    ui.printStatus(`Открыто: ${entry.name} → ${rawUrl}`, 'green');
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: redactedUid,
      url: rawUrl,
      rule: entry.id,
      result: requireConfirmation ? 'confirmed_opened' : 'opened'
    });
  } catch (err) {
    const isBrowserError = err instanceof BrowserOpenError;
    ui.printStatus(`Не удалось открыть браузер: ${err.message}`, 'red');
    logger.log({
      event: 'tag_read',
      reader: readerName,
      uid: redactedUid,
      url: rawUrl,
      rule: entry.id,
      result: 'open_error',
      error: isBrowserError ? err.message : `Неожиданная ошибка: ${err.message}`
    });
  }
}

// --- Наблюдение за файлами конфигурации --------------------------------

function watchConfigFiles() {
  if (!settings.configWatch) return;
  let debounceTimer = null;
  const onChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reloadConfig, 300);
  };
  try {
    fs.watch(SETTINGS_PATH, onChange);
    fs.watch(ALLOWED_TAGS_PATH, onChange);
  } catch (err) {
    ui.printStatus(`Наблюдение за конфигурацией недоступно: ${err.message}`, 'yellow');
  }
}

// --- Точка входа ---------------------------------------------------------

function main() {
  try {
    loadConfigAtStartup();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Не удалось загрузить конфигурацию, приложение остановлено: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  logger = new Logger({ logsDir: LOGS_DIR, logFullUid: settings.logFullUid === true });

  ui.printBanner();
  if (settings.dryRun) {
    ui.printStatus('Режим DRY-RUN включён: браузер не будет открываться, только журналирование.', 'cyan');
  }

  const pcsc = new PcscReaderManager();

  pcsc.on('reader-connected', (name) => {
    ui.printStatus(`Ридер подключён: ${name}`, 'green');
  });
  pcsc.on('reader-disconnected', (name) => {
    ui.printStatus(`Ридер отключён: ${name}. Ожидание повторного подключения...`, 'yellow');
  });
  pcsc.on('card-inserted', ({ transmit, readerName }) => {
    handleCardInserted(transmit, readerName).catch((err) => {
      logger.log({ event: 'tag_read', reader: readerName, result: 'read_error', error: err.message });
      ui.printStatus(`Непредвиденная ошибка обработки метки: ${err.message}`, 'red');
    });
  });
  pcsc.on('card-removed', () => {
    ui.printStatus('Метка убрана.', 'gray');
  });
  pcsc.on('error', (err) => {
    ui.printStatus(`Ошибка ридера: ${err.message}`, 'red');
    logger.log({ event: 'reader_error', error: err.message });
  });

  ui.printStatus('Ридер не найден. Поиск подключённого ACR122U...', 'yellow');
  pcsc.start();

  watchConfigFiles();

  ui.setupCommands({
    onOpenConfigFolder: () => ui.openFolder(CONFIG_DIR),
    onOpenLogFolder: () => ui.openFolder(LOGS_DIR),
    onReloadConfig: reloadConfig,
    onCheckConfig: checkConfigOnly,
    onTogglePause: () => {
      paused = !paused;
      ui.printStatus(paused ? 'Сканирование приостановлено.' : 'Сканирование возобновлено.', 'yellow');
    },
    onQuit: () => {
      ui.printStatus('Завершение работы...', 'gray');
      pcsc.stop();
      process.exit(0);
    }
  });

  process.on('SIGINT', () => {
    ui.printStatus('Получен SIGINT, завершение работы...', 'gray');
    pcsc.stop();
    process.exit(0);
  });
}

main();
