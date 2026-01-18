// Popup Translations
const translations = {
  en: {
    extName: "Gemini Exporter",
    settingsTitle: "Settings & Configuration",
    exportFormat: "Export Format",
    fmtTxt: "Text", // "Markdown" & "JSON" are universal enough or allow defaults
    exportType: "Export Type",
    typeDialog: "Dialog",
    typeCanvas: "Canvas",
    typeBoth: "Both",
    typeBothHint: "\"Both\" will attempt to download dialogue and canvas content if available.",
    usageHints: "Usage Hints",
    usageHintsText: "• Scroll to the top of the chat before exporting.<br>• Settings are saved automatically.<br>• Click the floating <b>Export</b> button on the page to specific download.",
    settingsSaved: "Settings saved"
  },
  zh: {
    extName: "Gemini 导出助手",
    settingsTitle: "设置与配置",
    exportFormat: "导出格式",
    fmtTxt: "纯文本",
    exportType: "导出类型",
    typeDialog: "仅对话",
    typeCanvas: "仅 Canvas",
    typeBoth: "组合 (对话+Canvas)",
    typeBothHint: "“组合”模式将尝试同时下载对话内容和 Canvas 内容(如有)。",
    usageHints: "使用提示",
    usageHintsText: "• 导出前建议先滚动到对话顶部。<br>• 设置会自动保存。<br>• 点击页面右侧悬浮的 <b>Export</b> 按钮开始下载。",
    settingsSaved: "设置已保存"
  }
};

const lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
const t = translations[lang];

document.addEventListener('DOMContentLoaded', async () => {
  // Apply Translations
  applyTranslations();

  // Defaults
  const defaults = {
    exportFormat: 'md',
    exportType: 'both' // Default to Both
  };

  // Load saved settings
  const data = await chrome.storage.local.get(defaults);

  // Apply to UI
  setRadioValue('exportFormat', data.exportFormat);
  setRadioValue('exportType', data.exportType);

  // Add event listeners for auto-save
  setupRadioListeners('exportFormat');
  setupRadioListeners('exportType');
});

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      el.innerHTML = t[key];
    }
  });
}

function setRadioValue(name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function setupRadioListeners(name) {
  const radios = document.querySelectorAll(`input[name="${name}"]`);
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      saveSetting(name, e.target.value);
    });
  });
}

function saveSetting(key, value) {
  chrome.storage.local.set({ [key]: value }, () => {
    showStatus(t.settingsSaved);
    // Optional: Notify content script if real-time update is needed, 
    // but content script will read storage on click, so technically not strictly required 
    // unless we want to update the button text or something.
  });
}

function showStatus(msg) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = msg;
  statusEl.classList.add('show');
  setTimeout(() => {
    statusEl.classList.remove('show');
  }, 2000);
}
