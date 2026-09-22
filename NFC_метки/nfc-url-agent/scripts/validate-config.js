'use strict';

// Автономный валидатор конфигурации: npm run validate-config
// Ничего не открывает и не подключается к ридеру — только проверяет
// config/settings.json и config/allowed-tags.json по JSON Schema.

const fs = require('fs');
const path = require('path');
const { assertValidSettings } = require('../src/config-schema');
const { loadAllowlist } = require('../src/allowlist');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
const ALLOWED_TAGS_PATH = path.join(CONFIG_DIR, 'allowed-tags.json');

let hasError = false;

try {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  assertValidSettings(settings);
  console.log('OK: config/settings.json валиден.');
} catch (err) {
  hasError = true;
  console.error(`ОШИБКА в config/settings.json: ${err.message}`);
}

try {
  const allowlist = loadAllowlist(ALLOWED_TAGS_PATH);
  console.log(`OK: config/allowed-tags.json валиден (${allowlist.tags.length} записей).`);
  for (const tag of allowlist.tags) {
    if (tag.enabled && tag.uid === null) {
      console.warn(
        `ПРЕДУПРЕЖДЕНИЕ: правило "${tag.id}" включено (enabled=true) без привязки к UID — ` +
          'сработает на любую метку с совпадающим URL.'
      );
    }
  }
} catch (err) {
  hasError = true;
  console.error(`ОШИБКА в config/allowed-tags.json: ${err.message}`);
}

process.exit(hasError ? 1 : 0);
