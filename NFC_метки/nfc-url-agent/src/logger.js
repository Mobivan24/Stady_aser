'use strict';

const fs = require('fs');
const path = require('path');

// Локальный JSONL-журнал. Никогда не пишет полные UID (если не разрешено
// явно logFullUid=true), пароли/токены, дампы памяти или содержимое
// неподдерживаемых карт (паспорта, банковские карты и т.п.) — вызывающий
// код (index.js) обязан не передавать сюда такие данные вовсе.
class Logger {
  constructor({ logsDir, logFullUid = false }) {
    this.logsDir = logsDir;
    this.logFullUid = logFullUid;
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  _currentLogFilePath() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(this.logsDir, `nfc-agent-${today}.log`);
  }

  /**
   * Сокращает UID до последних 4 байт (8 hex-символов), если полное
   * логирование UID не включено явно в settings.json.
   */
  redactUid(normalizedUid) {
    if (normalizedUid === null || normalizedUid === undefined) return null;
    if (this.logFullUid) return normalizedUid;
    const bytes = normalizedUid.split(':');
    return bytes.slice(-4).join(':');
  }

  log(event) {
    const entry = {
      time: new Date().toISOString(),
      ...event
    };
    const line = `${JSON.stringify(entry)}\n`;
    try {
      fs.appendFileSync(this._currentLogFilePath(), line, 'utf8');
    } catch (err) {
      // Журналирование не должно приводить к падению приложения.
      // eslint-disable-next-line no-console
      console.error('Не удалось записать в журнал:', err.message);
    }
  }
}

module.exports = { Logger };
