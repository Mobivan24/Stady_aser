'use strict';

const { EventEmitter } = require('events');

// Обёртка над pcsclite, дающая приложению высокоуровневые события:
//   'reader-connected'    (readerName)
//   'reader-disconnected' (readerName)
//   'card-inserted'       ({ transmit, disconnect, readerName })
//   'card-removed'        ()
//   'error'               (Error)
//
// Никакой бизнес-логики (allowlist, NDEF) здесь нет — только доступ к
// PC/SC. Это позволяет протестировать остальной код без реального ридера.
class PcscReaderManager extends EventEmitter {
  constructor() {
    super();
    this._pcsc = null;
    this._activeReader = null;
    this._cardConnected = false;
  }

  start() {
    if (this._pcsc) return;

    let pcsclite;
    try {
      // eslint-disable-next-line global-require
      pcsclite = require('pcsclite');
    } catch (err) {
      this.emit(
        'error',
        new Error(
          'Модуль pcsclite не установлен или не собрался для этой платформы. ' +
            'Выполните "npm install" на машине с Windows и драйвером ACS PC/SC.'
        )
      );
      return;
    }

    this._pcsc = pcsclite();

    this._pcsc.on('reader', (reader) => this._attachReader(reader));
    this._pcsc.on('error', (err) => this.emit('error', err));
  }

  stop() {
    if (this._pcsc && typeof this._pcsc.close === 'function') {
      try {
        this._pcsc.close();
      } catch {
        // игнорируем ошибку закрытия при остановке
      }
    }
    this._pcsc = null;
    this._activeReader = null;
  }

  _attachReader(reader) {
    this._activeReader = reader;
    reader.state = 0;
    this.emit('reader-connected', reader.name);

    reader.on('status', (status) => this._onStatus(reader, status));
    reader.on('end', () => {
      if (this._activeReader === reader) {
        this._activeReader = null;
      }
      this.emit('reader-disconnected', reader.name);
    });
    reader.on('error', (err) => this.emit('error', err));
  }

  _onStatus(reader, status) {
    const previousState = reader.state || 0;
    const changes = previousState ^ status.state;
    reader.state = status.state;

    const presentNow = Boolean(status.state & reader.SCARD_STATE_PRESENT);
    const emptyNow = Boolean(status.state & reader.SCARD_STATE_EMPTY);

    if ((changes & reader.SCARD_STATE_PRESENT) && presentNow) {
      this._handleCardInserted(reader);
    } else if ((changes & reader.SCARD_STATE_EMPTY) && emptyNow) {
      this._handleCardRemoved(reader);
    }
  }

  _handleCardInserted(reader) {
    if (this._cardConnected) return; // уже обрабатывается предыдущая вставка
    this._cardConnected = true;

    reader.connect(
      { share_mode: reader.SCARD_SHARE_SHARED },
      (err, protocol) => {
        if (err) {
          this._cardConnected = false;
          this.emit('error', err);
          return;
        }

        const transmit = (apdu, resLen = 256) =>
          new Promise((resolve, reject) => {
            reader.transmit(apdu, resLen, protocol, (transmitErr, data) => {
              if (transmitErr) reject(transmitErr);
              else resolve(data);
            });
          });

        this.emit('card-inserted', {
          transmit,
          readerName: reader.name
        });
      }
    );
  }

  _handleCardRemoved(reader) {
    this._cardConnected = false;
    reader.disconnect(reader.SCARD_LEAVE_CARD, () => {
      // намеренно игнорируем ошибку disconnect — карта уже физически убрана
    });
    this.emit('card-removed');
  }
}

module.exports = { PcscReaderManager };
