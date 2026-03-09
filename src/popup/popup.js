// Popup Translations
const translations = {
  en: {
    extName: "AI Chat Exporter",
    settingsTitle: "Settings & Configuration",
    exportFormat: "Export Format",
    fmtTxt: "Text", // "Markdown" & "JSON" are universal enough or allow defaults
    exportType: "Export Type",
    typeDialog: "Dialog",
    typeCanvas: "Canvas",
    typeBoth: "Both",
    typeBothHint: "\"Both\" will attempt to download dialogue and canvas content if available.",
    watermarkRemoval: "Image Export",
    watermarkRemovalLabel: "Remove Gemini visible watermark (experimental, Gemini only)",
    watermarkRemovalHint: "When enabled on Gemini, exported generated images will attempt visible watermark removal; if processing fails, original images are downloaded.",
    usageHints: "Usage Hints",
    usageHintsText: "• Scroll to the top of the chat before exporting.<br>• Settings are saved automatically.<br>• Open Gemini or ChatGPT and click the floating <b>Export</b> button on the page.",
    language: "Language",
    settingsSaved: "Settings saved"
  },
  zh: {
    extName: "AI 对话导出助手",
    settingsTitle: "设置与配置",
    exportFormat: "导出格式",
    fmtTxt: "纯文本",
    exportType: "导出类型",
    typeDialog: "仅对话",
    typeCanvas: "仅 Canvas",
    typeBoth: "组合",
    typeBothHint: "“组合”模式将尝试同时下载对话内容和 Canvas 内容(如有)。",
    watermarkRemoval: "图片导出",
    watermarkRemovalLabel: "导出时去除 Gemini 可见水印（实验性，仅 Gemini）",
    watermarkRemovalHint: "在 Gemini 页面开启后，会尝试去除导出生成图中的可见水印；若处理失败将回退为原图下载。",
    usageHints: "使用提示",
    usageHintsText: "• 导出前建议先滚动到对话顶部。<br>• 设置会自动保存。<br>• 打开 Gemini 或 ChatGPT 页面后，点击右侧悬浮的 <b>Export</b> 按钮开始下载。",

    language: "语言",
    settingsSaved: "设置已保存"
  }
};

let lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
let t = translations[lang];

document.addEventListener('DOMContentLoaded', async () => {
  // Defaults
  const defaults = {
    exportFormat: 'md',
    exportType: 'both',
    removeWatermark: true,
    language: lang // Default to browser language
  };

  // Load saved settings
  const data = await chrome.storage.local.get(defaults);

  // Update language based on saved setting
  if (data.language && translations[data.language]) {
    lang = data.language;
    t = translations[lang];
  }

  // Apply Translations
  applyTranslations();

  // Apply to UI
  setRadioValue('exportFormat', data.exportFormat);
  setRadioValue('exportType', data.exportType);
  setRadioValue('language', lang);
  const watermarkToggle = document.getElementById('remove-watermark');
  if (watermarkToggle) {
    watermarkToggle.checked = data.removeWatermark !== false;
  }

  // Add event listeners for auto-save
  setupRadioListeners('exportFormat');
  setupRadioListeners('exportType');
  setupLanguageListeners();
  setupToggleListeners();
});

function setupLanguageListeners() {
  const radios = document.querySelectorAll('input[name="language"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const newLang = e.target.value;
      if (translations[newLang]) {
        lang = newLang;
        t = translations[lang];
        applyTranslations();
        saveSetting('language', newLang);
      }
    });
  });
}

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

function setupToggleListeners() {
  const watermarkToggle = document.getElementById('remove-watermark');
  if (!watermarkToggle) return;
  watermarkToggle.addEventListener('change', (e) => {
    saveSetting('removeWatermark', Boolean(e.target.checked));
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
