'use strict';

const { execFile } = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function timestamp() {
  return new Date().toLocaleTimeString('ru-RU');
}

function printStatus(message, color = 'reset') {
  const c = COLORS[color] || COLORS.reset;
  // eslint-disable-next-line no-console
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${c}${message}${COLORS.reset}`);
}

function printBanner() {
  // eslint-disable-next-line no-console
  console.log(`${COLORS.cyan}=== NFC URL Agent — локальный агент, только чтение ===${COLORS.reset}`);
  printHelp();
}

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(
    [
      'Команды:',
      '  o — открыть папку конфигурации',
      '  l — открыть папку журналов',
      '  r — перезагрузить конфигурацию',
      '  p — приостановить/возобновить сканирование',
      '  c — проверить конфигурацию (без изменений)',
      '  h — показать эту справку',
      '  q — выход'
    ].join('\n')
  );
}

function openFolder(folderPath) {
  execFile('explorer.exe', [folderPath], () => {
    // explorer.exe нередко возвращает ненулевой код и при успехе — игнорируем.
  });
}

/**
 * Включает построчный ввод одиночных команд с клавиатуры. Не использует
 * raw-mode stdin, чтобы не конфликтовать с обычным вводом консоли и
 * оставаться простым и предсказуемым при пайпах/редиректах.
 */
function setupCommands(handlers) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    const cmd = chunk.trim().toLowerCase();
    switch (cmd) {
      case 'o':
        handlers.onOpenConfigFolder?.();
        break;
      case 'l':
        handlers.onOpenLogFolder?.();
        break;
      case 'r':
        handlers.onReloadConfig?.();
        break;
      case 'p':
        handlers.onTogglePause?.();
        break;
      case 'c':
        handlers.onCheckConfig?.();
        break;
      case 'h':
        printHelp();
        break;
      case 'q':
        handlers.onQuit?.();
        break;
      default:
        if (cmd.length > 0) {
          printStatus(`Неизвестная команда: "${cmd}". Нажмите h для справки.`, 'yellow');
        }
    }
  });
}

module.exports = {
  printStatus,
  printBanner,
  printHelp,
  openFolder,
  setupCommands
};
