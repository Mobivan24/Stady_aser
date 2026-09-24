'use strict';

const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true, strict: true });

const uidPattern = '^[0-9A-F]{2}(:[0-9A-F]{2})*$';

const settingsSchema = {
  $id: 'settings.json',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'mode'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    mode: { type: 'string', enum: ['confirm', 'auto'] },
    dryRun: { type: 'boolean' },
    logFullUid: { type: 'boolean' },
    allowHttpLocal: { type: 'boolean' },
    pollIntervalMs: { type: 'integer', minimum: 100, maximum: 5000 },
    configWatch: { type: 'boolean' },
    browsers: {
      type: 'object',
      additionalProperties: false,
      properties: {
        chrome: { type: 'string' },
        edge: { type: 'string' },
        comet: { type: 'string' }
      }
    }
  }
};

const tagEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'enabled', 'allowedUrls', 'action'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    enabled: { type: 'boolean' },
    uid: {
      anyOf: [{ type: 'string', pattern: uidPattern }, { type: 'null' }]
    },
    allowedUrls: {
      type: 'array',
      items: { type: 'string', format: 'uri', minLength: 1 }
    },
    allowedUrlPrefixes: {
      type: 'array',
      items: { type: 'string', minLength: 1 }
    },
    action: { type: 'string', enum: ['open_browser'] },
    browser: { type: 'string', enum: ['default', 'chrome', 'edge', 'comet'] },
    requireConfirmation: { type: 'boolean' },
    notes: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' }
  }
};

const allowedTagsSchema = {
  $id: 'allowed-tags.json',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'tags'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    defaults: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requireConfirmation: { type: 'boolean' },
        browser: { type: 'string', enum: ['default', 'chrome', 'edge', 'comet'] },
        cooldownSeconds: { type: 'number', minimum: 0 },
        unknownTagAction: { type: 'string', enum: ['deny'] }
      }
    },
    tags: {
      type: 'array',
      items: tagEntrySchema
    }
  }
};

ajv.addFormat('uri', {
  type: 'string',
  validate(value) {
    try {
      // eslint-disable-next-line no-new
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
});

const validateSettings = ajv.compile(settingsSchema);
const validateAllowedTags = ajv.compile(allowedTagsSchema);

function formatErrors(validateFn) {
  return (validateFn.errors || [])
    .map((e) => `${e.instancePath || '/'} ${e.message}`)
    .join('; ');
}

function assertValidSettings(data) {
  if (!validateSettings(data)) {
    throw new Error(`settings.json невалиден: ${formatErrors(validateSettings)}`);
  }
  return data;
}

function assertValidAllowedTags(data) {
  if (!validateAllowedTags(data)) {
    throw new Error(`allowed-tags.json невалиден: ${formatErrors(validateAllowedTags)}`);
  }
  return data;
}

module.exports = {
  assertValidSettings,
  assertValidAllowedTags
};
