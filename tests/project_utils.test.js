const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { getProjectName } = require('../src/content/modules/project_utils.js');
const { getPlatformConfig } = require('../src/content/modules/platforms.js');

test('getProjectName prefers document.title for chatgpt conversations', () => {
  const dom = new JSDOM(`
    <html>
      <head><title>Quarterly planning thread - ChatGPT</title></head>
      <body>
        <main>
          <h1>DOM heading should not win</h1>
          <article>
            <div class="group/turn-messages">
              <div class="user-message-bubble-color">first prompt</div>
            </div>
          </article>
        </main>
      </body>
    </html>
  `);

  const projectName = getProjectName({
    document: dom.window.document,
    platform: getPlatformConfig('chatgpt')
  });

  assert.equal(projectName, 'Quarterly planning thread');
});
