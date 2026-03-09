const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const {
  extractDataIncrementalChatGpt
} = require('../src/content/modules/conversation_extractor.js');

test('extractDataIncrementalChatGpt collects user and assistant turns', () => {
  const dom = new JSDOM(`
    <main>
      <article>
        <div class="foo group/turn-messages bar">
          <div class="user-message-bubble-color">
            用户问题第一行
            <p>用户问题第二行</p>
          </div>
        </div>
      </article>
      <article>
        <div class="foo group/turn-messages bar">
          <div class="assistant-content">
            <p>助手回答第一段</p>
            <p>助手回答第二段</p>
          </div>
        </div>
      </article>
    </main>
  `);

  const collectedData = new Map();
  const changed = extractDataIncrementalChatGpt({
    document: dom.window.document,
    collectedData,
    scrollCount: 3,
    maxScrollAttempts: 10,
    updateStatus: () => {}
  });

  assert.equal(changed, true);
  assert.equal(collectedData.size, 2);

  const turns = Array.from(collectedData.values()).sort((a, b) => a.domOrder - b.domOrder);
  assert.equal(turns[0].type, 'user');
  assert.match(turns[0].userText, /用户问题第一行/);
  assert.match(turns[0].userText, /用户问题第二行/);
  assert.equal(turns[1].type, 'model_reply');
  assert.match(turns[1].responseText, /助手回答第一段/);
  assert.match(turns[1].responseText, /助手回答第二段/);
});
