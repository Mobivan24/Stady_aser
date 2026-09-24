'use strict';

const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');
const { parseUrl, isSchemeAllowed } = require('./url-policy');

const CONFIRM_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'confirm-dialog.ps1');
const CONFIRM_TIMEOUT_MS = 30000;
const CONFIRM_TITLE = 'NFC URL Agent — подтверждение';

class BrowserOpenError extends Error {}

/**
 * Открывает URL через explorer.exe, что делегирует открытие
 * зарегистрированному в Windows браузеру по умолчанию. Аргумент
 * передаётся как отдельный элемент argv (без shell), поэтому
 * метасимволы командной строки не интерпретируются.
 */
function openWithDefaultBrowser(url) {
  return new Promise((resolve, reject) => {
    execFile('explorer.exe', [url], (err) => {
      // explorer.exe часто возвращает ненулевой код даже при успехе —
      // ориентируемся на факт запуска процесса, а не на код выхода.
      if (err && err.code === 'ENOENT') {
        reject(new BrowserOpenError('explorer.exe не найден'));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Открывает URL явно указанным исполняемым файлом браузера (chrome/edge/
 * comet), без участия shell.
 */
function openWithExecutable(executablePath, url) {
  return new Promise((resolve, reject) => {
    execFile(executablePath, [url], (err) => {
      if (err) {
        reject(new BrowserOpenError(`Не удалось запустить "${executablePath}": ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Открывает URL согласно режиму browser ('default' | 'chrome' | 'edge' |
 * 'comet'). Перед открытием заново проверяет схему URL — защита от
 * использования этой функции в обход url-policy.
 */
async function openUrl(rawUrl, browserMode, settings) {
  const url = parseUrl(rawUrl);
  if (!url) {
    throw new BrowserOpenError(`Невалидный URL: ${rawUrl}`);
  }
  if (!isSchemeAllowed(url, settings)) {
    throw new BrowserOpenError(`Схема URL не разрешена: ${url.protocol}`);
  }

  if (!browserMode || browserMode === 'default') {
    return openWithDefaultBrowser(url.href);
  }

  const browsers = (settings && settings.browsers) || {};
  const executablePath = browsers[browserMode];
  if (!executablePath) {
    throw new BrowserOpenError(
      `Для режима browser="${browserMode}" не задан путь к exe в config/settings.json (browsers.${browserMode})`
    );
  }

  return openWithExecutable(executablePath, url.href);
}

/**
 * Показывает нативное окно подтверждения поверх всех окон (Windows
 * MessageBox через PowerShell). Возвращает Promise<{ status, detail? }>:
 *   confirmed — нажато OK;
 *   cancelled — нажата «Отмена» или окно закрыто;
 *   timeout   — нет ответа CONFIRM_TIMEOUT_MS, окно закрыто автоматически;
 *   error     — сбой скрипта (detail содержит текст ошибки).
 * Любой статус, кроме confirmed, означает «не открывать» (fail-closed).
 */
function showConfirmationDialog(name, url) {
  return new Promise((resolve) => {
    const message = `Обнаружена разрешённая NFC-метка: ${name}\r\nURL: ${url}\r\n\r\nОткрыть?`;
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const child = execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', CONFIRM_SCRIPT_PATH,
        '-Title', CONFIRM_TITLE,
        '-Message', message
      ],
      { timeout: CONFIRM_TIMEOUT_MS, windowsHide: true },
      (err, _stdout, stderr) => {
        if (!err) {
          done({ status: 'confirmed' });
          return;
        }
        if (err.code === 'ENOENT') {
          consoleConfirmFallback(name, url).then(done);
          return;
        }
        if (err.killed) {
          done({ status: 'timeout' });
          return;
        }
        if (err.code === 1) {
          done({ status: 'cancelled' });
          return;
        }
        done({ status: 'error', detail: String(stderr || err.message).trim() });
      }
    );
    child.on('error', (err) => {
      if (err && err.code === 'ENOENT') {
        consoleConfirmFallback(name, url).then(done);
      } else {
        done({ status: 'error', detail: err ? err.message : 'unknown error' });
      }
    });
  });
}

function consoleConfirmFallback(name, url) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `\nОбнаружена разрешённая NFC-метка: ${name}\nURL: ${url}\nОткрыть? [y/N]: `,
      (answer) => {
        rl.close();
        resolve({ status: answer.trim().toLowerCase() === 'y' ? 'confirmed' : 'cancelled' });
      }
    );
  });
}

module.exports = {
  BrowserOpenError,
  openUrl,
  showConfirmationDialog,
  CONFIRM_TIMEOUT_MS
};
