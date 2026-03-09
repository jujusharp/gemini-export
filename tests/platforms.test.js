const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectPlatformFromLocation,
  getPlatformConfig
} = require('../src/content/modules/platforms.js');

test('detectPlatformFromLocation resolves known chat platforms', () => {
  assert.equal(detectPlatformFromLocation('https://chatgpt.com/c/698aae14-759c-83ab-8121-fca8ac11d582').id, 'chatgpt');
  assert.equal(detectPlatformFromLocation('https://gemini.google.com/app/abc').id, 'gemini');
  assert.equal(detectPlatformFromLocation('https://aistudio.google.com/prompts/new_chat').id, 'aistudio');
});

test('getPlatformConfig returns chatgpt conversation selectors', () => {
  const config = getPlatformConfig('chatgpt');
  assert.equal(config.id, 'chatgpt');
  assert.match(config.messageSelectors.turn, /group\/turn-messages/);
  assert.equal(config.messageSelectors.userBubble, '.user-message-bubble-color');
});
