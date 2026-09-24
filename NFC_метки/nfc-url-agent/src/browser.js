'use strict';

const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');
const { parseUrl, isSchemeAllowed } = require('./url-policy');

const CONFIRM_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'confirm-dialog.ps1');

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
 * Показывает нативное окно подтверждения (Windows MessageBox через
 * PowerShell). Возвращает Promise<boolean> — true если пользователь
 * нажал "Открыть"/OK. При недоступности PowerShell использует резервный
 * консольный y/n prompt, чтобы приложение продолжало работать.
 */
function showConfirmationDialog(name, url) {
  return new Promise((resolve) => {
    const child = execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', CONFIRM_SCRIPT_PATH,
        '-Name', name,
        '-Url', url
      ],
      (err) => {
        if (err && err.code === 'ENOENT') {
          resolve(consoleConfirmFallback(name, url));
          return;
        }
        // execFile передаёт ошибку, если процесс завершился с кодом != 0
        // (наш случай "Cancel" = exit 1) — это не сбой запуска, а отказ.
        resolve(!err);
      }
    );
    child.on('error', () => {
      resolve(consoleConfirmFallback(name, url));
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
        resolve(answer.trim().toLowerCase() === 'y');
      }
    );
  });
}

module.exports = {
  BrowserOpenError,
  openUrl,
  showConfirmationDialog
};
