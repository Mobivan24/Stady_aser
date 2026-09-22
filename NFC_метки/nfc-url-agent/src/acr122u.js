'use strict';

// APDU-команды ACR122U для режима "Storage Card" (MIFARE Ultralight /
// NTAG213/215/216). Используются ТОЛЬКО команды чтения:
//   - FF CA 00 00 00              — Get Data (UID считывателя/карты)
//   - FF B0 00 <block> <length>   — Read Binary (чтение страницы памяти)
//
// Команды записи (A2 ...), форматирования, блокировки, аутентификации
// защищённых секторов и подбора ключей ЗДЕСЬ НЕ РЕАЛИЗОВАНЫ и не должны
// добавляться — это осознанное ограничение по ТЗ (режим "только чтение").

const APDU_GET_UID = Buffer.from([0xff, 0xca, 0x00, 0x00, 0x00]);

const SUCCESS_SW = Buffer.from([0x90, 0x00]);

// Type 2 Tag: пользовательские данные начинаются со страницы 0x04.
// NTAG213 имеет 45 страниц (180 байт), из них ~144 байта пользовательских.
// Ограничиваем чтение безопасным потолком, чтобы не зациклиться на
// нестандартной/повреждённой метке.
const USER_MEMORY_START_PAGE = 0x04;
const MAX_PAGES_TO_READ = 64; // safety cap, покрывает NTAG213/215/216
const PAGE_SIZE = 4;

class Acr122uError extends Error {}

function isSuccess(response) {
  return (
    response.length >= 2 &&
    response[response.length - 2] === SUCCESS_SW[0] &&
    response[response.length - 1] === SUCCESS_SW[1]
  );
}

function stripStatusWord(response) {
  return response.subarray(0, response.length - 2);
}

/**
 * Читает UID карты через pseudo-APDU Get Data. Возвращает Buffer с UID
 * либо бросает Acr122uError, если ридер/карта не поддерживают команду.
 */
async function readUid(transmit) {
  const response = await transmit(APDU_GET_UID, 32);
  if (!isSuccess(response)) {
    throw new Acr122uError(
      `Не удалось получить UID (SW=${response.subarray(-2).toString('hex')})`
    );
  }
  return stripStatusWord(response);
}

/**
 * Читает одну страницу (4 байта) начиная с адреса page. ACR122U обычно
 * возвращает 16 байт (4 страницы) даже при запросе 4 — вызывающий код
 * должен учитывать это через readUserMemory.
 */
async function readBinary(transmit, page, length = PAGE_SIZE) {
  const apdu = Buffer.from([0xff, 0xb0, 0x00, page & 0xff, length & 0xff]);
  const response = await transmit(apdu, length + 2);
  if (!isSuccess(response)) {
    return null; // конец памяти либо страница недоступна — не ошибка
  }
  return stripStatusWord(response);
}

/**
 * Последовательно читает пользовательскую область памяти Type 2 Tag,
 * начиная со страницы 04h, до MAX_PAGES_TO_READ страниц или до первой
 * неудачной попытки чтения (что обычно означает конец памяти метки).
 * Всегда завершается — ошибка чтения одной страницы просто прерывает
 * цикл, а не бросает исключение (приложение не должно "зависать" или
 * падать на повреждённой/укороченной метке).
 */
async function readUserMemory(transmit) {
  const chunks = [];
  let page = USER_MEMORY_START_PAGE;
  let pagesRead = 0;

  while (pagesRead < MAX_PAGES_TO_READ) {
    const data = await readBinary(transmit, page, PAGE_SIZE);
    if (!data || data.length === 0) {
      break;
    }
    chunks.push(data);
    const pagesInChunk = Math.max(1, Math.floor(data.length / PAGE_SIZE));
    page += pagesInChunk;
    pagesRead += pagesInChunk;
  }

  return Buffer.concat(chunks);
}

module.exports = {
  Acr122uError,
  readUid,
  readBinary,
  readUserMemory,
  USER_MEMORY_START_PAGE
};
