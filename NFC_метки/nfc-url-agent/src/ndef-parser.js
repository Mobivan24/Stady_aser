'use strict';

// Небольшой самодостаточный парсер NDEF для NFC Forum Type 2 Tag.
// Никаких внешних зависимостей — весь код читаем и проверяем целиком.
//
// Формат памяти Type 2 Tag: последовательность TLV-блоков, начинающихся
// с 4-й страницы (после UID/lock/CC на страницах 0-3). Нас интересует
// TLV с тегом 0x03 (NDEF Message TLV).

const TLV_NDEF_MESSAGE = 0x03;
const TLV_TERMINATOR = 0xfe;
const TLV_LOCK_CONTROL = 0x01;
const TLV_MEMORY_CONTROL = 0x02;
const TLV_NULL = 0x00;

// Таблица префиксов URI согласно NFC Forum "URI Record Type Definition".
const URI_PREFIXES = [
  '', 'http://www.', 'https://www.', 'http://', 'https://',
  'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
  'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://',
  'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:',
  'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://',
  'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:', 'urn:epc:pat:',
  'urn:epc:raw:', 'urn:epc:', 'urn:nfc:'
];

class NdefParseError extends Error {}

/**
 * Извлекает тело NDEF Message TLV из линейного дампа памяти страниц.
 * Возвращает Buffer с NDEF-сообщением либо null, если TLV не найден
 * (пустая метка / нет NDEF).
 */
function extractNdefMessageFromTlv(memory) {
  let offset = 0;
  while (offset < memory.length) {
    const tag = memory[offset];

    if (tag === TLV_NULL) {
      offset += 1;
      continue;
    }
    if (tag === TLV_TERMINATOR) {
      break;
    }

    if (offset + 1 >= memory.length) {
      break; // недостаточно данных для длины — прекращаем безопасно
    }

    let length = memory[offset + 1];
    let valueOffset = offset + 2;

    if (length === 0xff) {
      if (offset + 3 >= memory.length) break;
      length = (memory[offset + 2] << 8) | memory[offset + 3];
      valueOffset = offset + 4;
    }

    if (valueOffset + length > memory.length) {
      // TLV заявляет больше данных, чем реально прочитано — обрезаем.
      length = Math.max(0, memory.length - valueOffset);
    }

    if (tag === TLV_NDEF_MESSAGE) {
      return memory.subarray(valueOffset, valueOffset + length);
    }

    if (tag !== TLV_LOCK_CONTROL && tag !== TLV_MEMORY_CONTROL) {
      // Неизвестный TLV — прекращаем разбор, а не гадаем дальше.
      break;
    }

    offset = valueOffset + length;
  }
  return null;
}

/**
 * Разбирает одно или несколько NDEF-записей из буфера NDEF Message.
 * Поддерживает короткие (SR) и длинные записи, ID length, но не
 * поддерживает chunked records (CF) — такие записи отбрасываются как
 * неподдерживаемые, поскольку они не нужны для простых URI-меток.
 */
function parseNdefRecords(buffer) {
  const records = [];
  let offset = 0;

  while (offset < buffer.length) {
    const header = buffer[offset];
    offset += 1;

    const mb = Boolean(header & 0x80); // eslint-disable-line no-unused-vars
    const me = Boolean(header & 0x40); // eslint-disable-line no-unused-vars
    const cf = Boolean(header & 0x20);
    const sr = Boolean(header & 0x10);
    const il = Boolean(header & 0x08);
    const tnf = header & 0x07;

    if (offset >= buffer.length) {
      throw new NdefParseError('Обрезанный заголовок NDEF-записи');
    }

    const typeLength = buffer[offset];
    offset += 1;

    let payloadLength;
    if (sr) {
      if (offset >= buffer.length) throw new NdefParseError('Обрезана длина payload (SR)');
      payloadLength = buffer[offset];
      offset += 1;
    } else {
      if (offset + 4 > buffer.length) throw new NdefParseError('Обрезана длина payload');
      payloadLength = buffer.readUInt32BE(offset);
      offset += 4;
    }

    let idLength = 0;
    if (il) {
      if (offset >= buffer.length) throw new NdefParseError('Обрезана длина ID');
      idLength = buffer[offset];
      offset += 1;
    }

    if (offset + typeLength > buffer.length) {
      throw new NdefParseError('Обрезан type данной записи');
    }
    const type = buffer.subarray(offset, offset + typeLength);
    offset += typeLength;

    if (il) {
      if (offset + idLength > buffer.length) throw new NdefParseError('Обрезан id данной записи');
      offset += idLength; // ID нам не нужен, пропускаем
    }

    if (offset + payloadLength > buffer.length) {
      throw new NdefParseError('Обрезан payload данной записи');
    }
    const payload = buffer.subarray(offset, offset + payloadLength);
    offset += payloadLength;

    if (cf) {
      // Chunked-записи не поддерживаются — это осознанное ограничение.
      throw new NdefParseError('Chunked NDEF-записи не поддерживаются');
    }

    records.push({ tnf, type: type.toString('latin1'), payload });

    if (me) break;
  }

  return records;
}

/**
 * Декодирует Well-Known URI Record (TNF=1, type='U').
 */
function decodeUriRecord(payload) {
  if (payload.length < 1) return null;
  const prefixCode = payload[0];
  const prefix = URI_PREFIXES[prefixCode] || '';
  const rest = payload.subarray(1).toString('utf8');
  return prefix + rest;
}

/**
 * Декодирует Well-Known Text Record (TNF=1, type='T'). Только для
 * отображения/журнала — приложение не выполняет над ним никаких действий.
 */
function decodeTextRecord(payload) {
  if (payload.length < 1) return null;
  const statusByte = payload[0];
  const isUtf16 = Boolean(statusByte & 0x80);
  const langCodeLength = statusByte & 0x3f;
  const langCode = payload.subarray(1, 1 + langCodeLength).toString('ascii');
  const textBytes = payload.subarray(1 + langCodeLength);
  const text = textBytes.toString(isUtf16 ? 'utf16le' : 'utf8');
  return { lang: langCode, text };
}

/**
 * Верхнеуровневая функция: memory (Buffer, начиная со страницы 4) ->
 * список интерпретированных записей вида { kind: 'uri'|'text'|'other', ... }.
 * Возвращает { records: [] } если TLV/NDEF не найден (пустая метка).
 */
function parseNdefFromMemory(memory) {
  const ndefMessage = extractNdefMessageFromTlv(memory);
  if (!ndefMessage || ndefMessage.length === 0) {
    return { records: [] };
  }

  let rawRecords;
  try {
    rawRecords = parseNdefRecords(ndefMessage);
  } catch (err) {
    if (err instanceof NdefParseError) {
      // Повреждённые/укороченные NDEF-данные — не валимся, просто нет записей.
      return { records: [] };
    }
    throw err;
  }

  const records = rawRecords.map((r) => {
    if (r.tnf === 0x01 && r.type === 'U') {
      const uri = decodeUriRecord(r.payload);
      return { kind: 'uri', uri };
    }
    if (r.tnf === 0x01 && r.type === 'T') {
      const decoded = decodeTextRecord(r.payload);
      return { kind: 'text', ...decoded };
    }
    return { kind: 'other', tnf: r.tnf, type: r.type };
  });

  return { records };
}

module.exports = {
  NdefParseError,
  extractNdefMessageFromTlv,
  parseNdefRecords,
  decodeUriRecord,
  decodeTextRecord,
  parseNdefFromMemory
};
