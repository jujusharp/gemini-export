(function () {
    'use strict';

    // Added for Chrome Extension compatibility
    const GM_addStyle = (css) => {
        const style = document.createElement('style');
        style.innerText = css;
        document.head.appendChild(style);
    };

    const GM_setClipboard = (text) => {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy to clipboard', err);
        });
    };

    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'TOGGLE_PANEL') {
            // Need to ensure UI is created first, though it should be by the timeout
            if (typeof togglePanel === 'function') {
                togglePanel();
                sendResponse({ status: 'success' });
            } else {
                console.warn('togglePanel function not found or UI not ready');
                sendResponse({ status: 'error', message: 'UI not ready' });
            }
        }
        // Return true if we want to sendResponse asynchronously, but here we are synchronous
    });

    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
            // 尝试创建默认策略
            if (!window.trustedTypes.defaultPolicy) {
                window.trustedTypes.createPolicy('default', {
                    createHTML: (string) => string,
                    createScript: (string) => string,
                    createScriptURL: (string) => string
                });
            }
        } catch (e) {
            // 如果默认策略已存在，创建备用策略
            try {
                window.trustedTypes.createPolicy('userscript-fallback', {
                    createHTML: (string) => string,
                    createScript: (string) => string,
                    createScriptURL: (string) => string
                });
            } catch (e2) {
                console.warn('TrustedTypes 策略创建失败，但脚本将继续运行', e2);
            }
        }
    }

    // 额外的DOM操作安全包装
    const safeSetInnerHTML = (element, html) => {
        try {
            if (window.trustedTypes && window.trustedTypes.createPolicy) {
                const policy = window.trustedTypes.defaultPolicy ||
                    window.trustedTypes.createPolicy('temp-policy', {
                        createHTML: (string) => string
                    });
                element.innerHTML = policy.createHTML(html);
            } else {
                element.innerHTML = html;
            }
        } catch (e) {
            // 回退到textContent
            element.textContent = html.replace(/<[^>]*>/g, '');
        }
    };

    // --- Language & Translations ---
    const lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
    const t = {
        en: {
            btnExport: "Export",
            btnStop: "Stop Scanning",
            btnProcessing: "Processing...",
            btnFailed: "Failed",
            btnSuccess: "Success!",
            btnError: "Error",
            statusStarting: "Starting export...",
            statusScanning: "Scanning...",
            statusStop: "Stopping...",
            statusReset: "Resetting scroll position...",
            statusStep1: "Step 1/3: Canvas Content...",
            statusStep2: "Step 2/3: Dialog Content (Scrolling)...",
            statusStep3: "Step 3/3: Merging & Exporting...",
            statusProcessing: (count) => `Processing Data (${count})...`,
            statusNoCanvas: "No Canvas content found.",
            statusNoDialog: "No chat content collected.",
            statusSuccess: (item) => `Export Success: ${item}`,
            statusError: (msg) => `Error: ${msg}`,
            logStartingExport: (type, format) => `Starting export.. Type: ${type}, Format: ${format}`,
            statusFormatChanged: "Export format changed",
            btnToggleOpen: "<",
            btnToggleClose: ">",
            logSelectorsUpdated: "Gemini Export: Updated selectors",
            logExtractingCanvas: "Extracting Canvas content...",
            logCanvasExtracted: (count) => `Canvas content extraction complete. Found ${count} items.`,
            txtCombinedHeader: "Gemini Combined Export (Dialog + Canvas)",
            txtDialogSection: "=== Dialog Content ===",
            txtUser: "--- User ---",
            txtAIThought: "--- AI Thought Chain ---",
            txtAIResponse: "--- AI Response ---",
            txtCanvasSection: "=== Canvas Content ===",
            txtCodeBlock: (index, lang) => `--- Code Block ${index} (${lang}) ---`,
            txtTextBlock: (index) => `--- Text Block ${index} ---`,
            txtFullContent: "--- Full Content ---",
            mdHeaderCanvas: (projectName) => `# ${projectName} Canvas Content Export`,
            mdExportTime: (ts) => `Export Time: ${ts}`,
            mdContentBlock: (idx) => `### Content Block ${idx}`,
            mdCodeBlock: (lang) => `**Code Block** (Language: ${lang}):`,
            mdTextBlock: "**Text Content**:",
            mdFullContent: "**Full Content**:",
            mdHeaderCombined: (projectName) => `# ${projectName} Combined Export`,
            mdTurn: (idx) => `### Turn ${idx}`,
            mdUser: "**User**:",
            mdAIThought: "AI Thought Chain",
            mdAIResponse: "**AI Response**:",
            statusWarnNoData: "Warning: Turns found but no data extracted. Check selectors.",
            statusScrolling: (count, max, collected) => `Scrolling ${count}/${max}... Collected ${collected} items...`,
            logFindingScroller: "Starting auto-scroll...",
            statusScrollError: "Error (Scroll): Scroller not found",
            statusScrollNotFoundAlert: "Could not find scrollable area.",
            statusScrollCompleteBottom: "Scroll complete (Bottom reached).",
            statusScrollCompleteTop: "Scroll complete (Returned to top).",
            statusScrollManualStop: (count) => `Scroll stopped manually (Scrolled ${count} times).`,
            statusScrollMaxAttempts: (max) => `Scroll stopped: Max attempts reached (${max}).`,
            txtHeaderScroll: "Gemini Chat History (Scroll Export)",
            txtHeaderSDK: "Gemini Chat History (SDK)",
            txtIncompleteTurn: "--- Turn (Incomplete) ---",
            txtThoughtIncomplete: "Thought (Incomplete):",
            txtResponseIncomplete: "Response (Incomplete):",
            mdHeaderScroll: (projectName, context) => `# ${projectName} Chat Export (${context})`,
            logGeneratingFile: (count) => `Generating file from ${count} items...`,
            logUICreated: "UI Created"
        },
        zh: {
            btnExport: "导出",
            btnStop: "停止扫描",
            btnProcessing: "处理中...",
            btnFailed: "失败",
            btnSuccess: "成功!",
            btnError: "错误",
            statusStarting: "开始导出...",
            statusScanning: "扫描中...",
            statusStop: "正在停止...",
            statusReset: "重置滚动位置...",
            statusStep1: "步骤 1/3: 提取 Canvas 内容...",
            statusStep2: "步骤 2/3: 滚动获取对话内容...",
            statusStep3: "步骤 3/3: 合并数据并导出...",
            statusProcessing: (count) => `处理数据 (${count})...`,
            statusNoCanvas: "未找到 Canvas 内容。",
            statusNoDialog: "未收集到对话内容。",
            statusSuccess: (item) => `导出成功: ${item}`,
            statusError: (msg) => `错误: ${msg}`,
            logStartingExport: (type, format) => `开始导出.. 类型: ${type}, 格式: ${format}`,
            statusFormatChanged: "导出格式已切换",
            btnToggleOpen: "<",
            btnToggleClose: ">",
            logSelectorsUpdated: "Gemini Export: 选择器已更新",
            logExtractingCanvas: "开始提取 Canvas 内容...",
            logCanvasExtracted: (count) => `Canvas 内容提取完成，共找到 ${count} 个内容块（已去重）`,
            txtCombinedHeader: "Gemini 组合导出 (对话 + Canvas)",
            txtDialogSection: "=== 对话内容 ===",
            txtUser: "--- 用户 ---",
            txtAIThought: "--- AI 思维链 ---",
            txtAIResponse: "--- AI 回答 ---",
            txtCanvasSection: "=== Canvas 内容 ===",
            txtCodeBlock: (index, lang) => `--- 代码块 ${index} (${lang}) ---`,
            txtTextBlock: (index) => `--- 文本内容 ${index} ---`,
            txtFullContent: "--- 完整内容 ---",
            mdHeaderCanvas: (projectName) => `# ${projectName} Canvas 内容导出`,
            mdExportTime: (ts) => `导出时间：${ts}`,
            mdContentBlock: (idx) => `### 内容块 ${idx}`,
            mdCodeBlock: (lang) => `**代码块** (语言: ${lang}):`,
            mdTextBlock: "**文本内容**:",
            mdFullContent: "**完整内容**:",
            mdHeaderCombined: (projectName) => `# ${projectName} 组合导出`,
            mdTurn: (idx) => `### 回合 ${idx}`,
            mdUser: "**用户**:",
            mdAIThought: "AI 思维链",
            mdAIResponse: "**AI 回答**:",
            statusWarnNoData: "警告: 发现聊天回合但未能提取数据，请检查选择器。",
            statusScrolling: (count, max, collected) => `滚动 ${count}/${max}... 已收集 ${collected} 条记录...`,
            logFindingScroller: "启动自动滚动...",
            statusScrollError: "错误 (滚动): 找不到滚动区域",
            statusScrollNotFoundAlert: "未能找到聊天记录的滚动区域。",
            statusScrollCompleteBottom: "滚动完成 (疑似触底)。",
            statusScrollCompleteTop: "滚动完成 (返回顶部)。",
            statusScrollManualStop: (count) => `滚动已手动停止 (已滚动 ${count} 次)。`,
            statusScrollMaxAttempts: (max) => `滚动停止: 已达到最大尝试次数 (${max})。`,
            txtHeaderScroll: "Gemini 聊天记录 (滚动采集)",
            txtHeaderSDK: "Gemini 对话记录 (SDK 代码)",
            txtIncompleteTurn: "--- 回合 (内容提取不完整或失败) ---",
            txtThoughtIncomplete: "思维链(可能不全):",
            txtResponseIncomplete: "回答(可能不全):",
            mdHeaderScroll: (projectName, context) => `# ${projectName} 对话导出 (${context})`,
            logGeneratingFile: (count) => `正在处理 ${count} 条记录并生成文件...`,
            logUICreated: "UI 已创建"
        }
    }[lang];

    const exportTimeout = 3000;
    const SCROLL_DELAY_MS = 1000;
    const MAX_SCROLL_ATTEMPTS = 300;
    const SCROLL_INCREMENT_FACTOR = 0.85;
    const SCROLL_STABILITY_CHECKS = 3;

    if (!window.__GEMINI_EXPORT_FORMAT) { window.__GEMINI_EXPORT_FORMAT = 'md'; }

    // --- 动态选择器配置 ---
    const DEFAULT_SELECTORS = {
        userContainer: 'user-query',
        userLine: '.query-text-line',
        userParagraph: '.query-text p',
        userText: '.query-text',
        modelContent: '.response-container-content, model-response',
        modelMarkdown: '.model-response-text .markdown',
        modelThoughts: 'model-thoughts',
        modelThoughtsBody: '.thoughts-body, .thoughts-content'
    };

    let SELECTORS = { ...DEFAULT_SELECTORS };

    // 从 LocalStorage 加载自定义选择器
    try {
        const saved = localStorage.getItem('gemini_export_selectors');
        if (saved) {
            const parsed = JSON.parse(saved);
            SELECTORS = { ...SELECTORS, ...parsed };
            console.log('Gemini Export: 已加载自定义选择器', SELECTORS);
        }
    } catch (e) {
        console.warn('Gemini Export: 加载自定义选择器失败', e);
    }

    // --- 脚本内部状态变量 ---
    let isScrolling = false;
    let collectedData = new Map();
    let scrollCount = 0;
    let noChangeCounter = 0;

    // --- UI 界面元素变量 ---
    let exportButton = null;
    let stopButtonScroll = null; // We might still need this if we want to show a stop button dynamically, or we can integrate it into the main button state
    let statusDiv = null; // Maybe keep a small status toast

    // Previous panel vars removed


    // 主题同步：跟随 Gemini 页面深浅色主题
    let themeObserver = null;
    let themeUpdateTimer = null;
    let currentThemeMode = null;

    // --- 辅助工具函数 ---
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function parseRgbColor(colorString) {
        if (!colorString) return null;
        const m = colorString.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (!m) return null;
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    }

    function getPageBackgroundColor() {
        try {
            const bodyBg = window.getComputedStyle(document.body).backgroundColor;
            if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') return bodyBg;
        } catch (_) { }
        try {
            return window.getComputedStyle(document.documentElement).backgroundColor;
        } catch (_) { }
        return '';
    }

    function detectPageThemeMode() {
        try {
            const scheme = window.getComputedStyle(document.documentElement).colorScheme;
            if (scheme && scheme.includes('dark')) return 'dark';
            if (scheme && scheme.includes('light')) return 'light';
        } catch (_) { }

        const rgb = parseRgbColor(getPageBackgroundColor());
        if (rgb) {
            const luminance = (0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b);
            return luminance < 128 ? 'dark' : 'light';
        }

        try {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } catch (_) { }
        return 'dark';
    }

    function applyThemeVariables(mode) {
        const darkVars = {
            '--ge-panel-bg': '#111827',
            '--ge-panel-text': '#F9FAFB',
            '--ge-text-muted': '#D1D5DB',
            '--ge-text-muted-2': '#9CA3AF',
            '--ge-border': '#374151',
            '--ge-border-hover': '#6B7280',
            '--ge-surface': '#1F2937',
            '--ge-surface-2': '#111827',
            '--ge-surface-hover': '#1F2937',
            '--ge-divider': '#1F2937',
            '--ge-primary': '#1E40AF',
            '--ge-primary-hover': '#1D4ED8',
            '--ge-primary-border': '#1D4ED8',
            '--ge-on-primary': '#F9FAFB',
            '--ge-success': '#059669',
            '--ge-success-border': '#047857',
            '--ge-danger': '#DC2626',
            '--ge-danger-border': '#B91C1C',
            '--ge-neutral': '#374151',
            '--ge-neutral-border': '#4B5563',
            '--ge-scroll-thumb': '#374151',
            '--ge-scroll-thumb-hover': '#4B5563'
        };
        const lightVars = {
            '--ge-panel-bg': '#F9FAFB',
            '--ge-panel-text': '#111827',
            '--ge-text-muted': '#374151',
            '--ge-text-muted-2': '#6B7280',
            '--ge-border': '#E5E7EB',
            '--ge-border-hover': '#9CA3AF',
            '--ge-surface': '#FFFFFF',
            '--ge-surface-2': '#F3F4F6',
            '--ge-surface-hover': '#F3F4F6',
            '--ge-divider': '#E5E7EB',
            '--ge-primary': '#1E40AF',
            '--ge-primary-hover': '#1D4ED8',
            '--ge-primary-border': '#1D4ED8',
            '--ge-on-primary': '#F9FAFB',
            '--ge-success': '#059669',
            '--ge-success-border': '#047857',
            '--ge-danger': '#DC2626',
            '--ge-danger-border': '#B91C1C',
            '--ge-neutral': '#374151',
            '--ge-neutral-border': '#4B5563',
            '--ge-scroll-thumb': '#D1D5DB',
            '--ge-scroll-thumb-hover': '#9CA3AF'
        };

        const vars = mode === 'light' ? lightVars : darkVars;
        Object.entries(vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });
        currentThemeMode = mode;
    }

    function refreshThemeIfNeeded() {
        const nextMode = detectPageThemeMode();
        if (nextMode === currentThemeMode) return;
        applyThemeVariables(nextMode);
    }

    function scheduleThemeRefresh(delayMs = 120) {
        if (themeUpdateTimer) window.clearTimeout(themeUpdateTimer);
        themeUpdateTimer = window.setTimeout(() => {
            themeUpdateTimer = null;
            refreshThemeIfNeeded();
        }, delayMs);
    }

    function startThemeSync() {
        applyThemeVariables(detectPageThemeMode());

        if (themeObserver) themeObserver.disconnect();
        themeObserver = new MutationObserver(() => scheduleThemeRefresh(120));
        try {
            themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'color-scheme']
            });
        } catch (_) { }
        try {
            themeObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        } catch (_) { }

        try {
            const media = window.matchMedia('(prefers-color-scheme: dark)');
            if (media && media.addEventListener) media.addEventListener('change', () => scheduleThemeRefresh(120));
            else if (media && media.addListener) media.addListener(() => scheduleThemeRefresh(120));
        } catch (_) { }
    }

    function getCurrentTimestamp() {
        const n = new Date();
        const YYYY = n.getFullYear();
        const MM = (n.getMonth() + 1).toString().padStart(2, '0');
        const DD = n.getDate().toString().padStart(2, '0');
        const hh = n.getHours().toString().padStart(2, '0');
        const mm = n.getMinutes().toString().padStart(2, '0');
        const ss = n.getSeconds().toString().padStart(2, '0');
        return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
    }

    /**
     * 用于从页面获取项目名称
     * @returns {string} - 清理后的项目名称，或一个默认名称
     */
    function getProjectName() {
        try {
            // Updated to prioritize conversation title as requested
            const titleElement = document.querySelector('.conversation-title');
            if (titleElement && titleElement.textContent && titleElement.textContent.trim()) {
                const cleanName = titleElement.textContent.trim().replace(/[\\/:\*\?"<>\|]/g, '_');
                if (cleanName) return cleanName;
            }

            const firstUser = document.querySelector('#chat-history user-query .query-text, #chat-history user-query .query-text-line, #chat-history user-query .query-text p');
            if (firstUser && firstUser.textContent && firstUser.textContent.trim()) {
                const raw = firstUser.textContent.trim().replace(/\s+/g, ' ');
                const clean = raw.substring(0, 20).replace(/[\\/:\*\?"<>\|]/g, '_');
                if (clean) return `Gemini_${clean}`;
            }
        } catch (e) { console.warn('Gemini 项目名提取失败，回退 XPath', e); }
        const xpath = "/html/body/app-root/ms-app/div/div/div/div/span/ms-prompt-switcher/ms-chunk-editor/section/ms-toolbar/div/div[1]/div/div/h1";
        const defaultName = "GeminiChat";
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const titleElement = result.singleNodeValue;
            if (titleElement && titleElement.textContent) {
                const cleanName = titleElement.textContent.trim().replace(/[\\/:\*\?"<>\|]/g, '_');
                return cleanName || defaultName;
            }
        } catch (e) { }
        return defaultName;
    }


    function getMainScrollerElement() {
        console.log("尝试查找滚动容器 (用于滚动导出)...");
        let scroller = document.querySelector('.chat-scrollable-container');
        if (!scroller) {
            scroller = document.querySelector('chat-history-scroll-container');
        }
        if (scroller && scroller.scrollHeight > scroller.clientHeight) {
            console.log("找到滚动容器 (策略 1: .chat-scrollable-container):", scroller);
            return scroller;
        }
        scroller = document.querySelector('mat-sidenav-content');
        if (scroller && scroller.scrollHeight > scroller.clientHeight) {
            console.log("找到滚动容器 (策略 2: mat-sidenav-content):", scroller);
            return scroller;
        }
        const chatTurnsContainer = document.querySelector('ms-chat-turn')?.parentElement;
        if (chatTurnsContainer) {
            let parent = chatTurnsContainer;
            for (let i = 0; i < 5 && parent; i++) {
                if (parent.scrollHeight > parent.clientHeight + 10 &&
                    (window.getComputedStyle(parent).overflowY === 'auto' || window.getComputedStyle(parent).overflowY === 'scroll')) {
                    console.log("找到滚动容器 (策略 3: 向上查找父元素):", parent);
                    return parent;
                }
                parent = parent.parentElement;
            }
        }
        console.warn("警告 (滚动导出): 未能通过特定选择器精确找到 AI Studio 滚动区域，将尝试使用 document.documentElement。如果滚动不工作，请按F12检查聊天区域的HTML结构，并更新此函数内的选择器。");
        return document.documentElement;
    }

    function extractDataIncremental_Gemini() {
        let newly = 0, updated = false;
        const nodes = document.querySelectorAll('#chat-history .conversation-container');
        const seenUserTexts = new Set(); // 用于去重用户消息

        nodes.forEach((c, idx) => {
            let info = collectedData.get(c) || { domOrder: idx, type: 'unknown', userText: null, thoughtText: null, responseText: null };
            let changed = false;
            if (!collectedData.has(c)) { collectedData.set(c, info); newly++; }
            if (!info.userText) {
                // 优先顺序策略，防止重复提取
                let userTexts = [];
                // 1. 尝试提取多行格式
                const textLines = Array.from(c.querySelectorAll(`${SELECTORS.userContainer} ${SELECTORS.userLine}`));
                if (textLines.length > 0) {
                    userTexts = textLines.map(el => el.innerText.trim());
                } else {
                    // 2. 尝试提取段落
                    const paragraphs = Array.from(c.querySelectorAll(`${SELECTORS.userContainer} ${SELECTORS.userParagraph}`));
                    if (paragraphs.length > 0) {
                        userTexts = paragraphs.map(el => el.innerText.trim());
                    } else {
                        // 3. 回退到整个容器
                        const container = c.querySelector(`${SELECTORS.userContainer} ${SELECTORS.userText}`);
                        if (container) {
                            userTexts = [container.innerText.trim()];
                        }
                    }
                }

                userTexts = userTexts.filter(Boolean);

                if (userTexts.length) {
                    const combinedUserText = userTexts.join('\n');
                    // 检查是否已经存在相同的用户消息
                    if (!seenUserTexts.has(combinedUserText)) {
                        seenUserTexts.add(combinedUserText);
                        info.userText = combinedUserText;
                        changed = true;
                        if (info.type === 'unknown') info.type = 'user';
                    }
                }
            }
            const modelRoot = c.querySelector(SELECTORS.modelContent);
            if (modelRoot) {
                if (!info.responseText) {
                    const md = modelRoot.querySelector(SELECTORS.modelMarkdown);
                    if (md && md.innerText.trim()) { info.responseText = md.innerText.trim(); changed = true; }
                }
                if (!info.thoughtText) {
                    const thoughts = modelRoot.querySelector(SELECTORS.modelThoughts);
                    if (thoughts) {
                        let textReal = '';
                        const body = thoughts.querySelector(SELECTORS.modelThoughtsBody);
                        if (body && body.innerText.trim() && !/显示思路/.test(body.innerText.trim())) textReal = body.innerText.trim();
                        info.thoughtText = textReal || '(思维链未展开)'; // 占位策略 A
                        changed = true;
                    }
                }
            }
            if (changed) {
                if (info.userText && info.responseText && info.thoughtText) info.type = 'model_thought_reply';
                else if (info.userText && info.responseText) info.type = 'model_reply';
                else if (info.userText) info.type = 'user';
                else if (info.responseText && info.thoughtText) info.type = 'model_thought_reply';
                else if (info.responseText) info.type = 'model_reply';
                else if (info.thoughtText) info.type = 'model_thought';
                collectedData.set(c, info); updated = true;
            }
        });
        updateStatus(`滚动 ${scrollCount}/${MAX_SCROLL_ATTEMPTS}... 已收集 ${collectedData.size} 条记录..`);

        return newly > 0 || updated;
    }

    function extractDataIncremental_Dispatch() {
        if (document.querySelector('#chat-history .conversation-container')) return extractDataIncremental_Gemini();
        return extractDataIncremental_AiStudio();
    }




    // --- UI 界面创建与更新 ---
    function createUI() {
        console.log("Creating Export Button...");

        // Create Floating Export Button
        exportButton = document.createElement('button');
        exportButton.id = 'gemini-quick-export-btn';
        exportButton.title = t.btnExport; // Tooltip shows text
        exportButton.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 46px;
            height: 46px;
            padding: 0;
            background: var(--ge-primary, #1a73e8);
            color: #fff;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            z-index: 10000;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Icon only (Download Icon)
        exportButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

        exportButton.addEventListener('click', handleExportClick);
        exportButton.addEventListener('mouseenter', () => exportButton.style.transform = 'translateY(-2px) scale(1.05)');
        exportButton.addEventListener('mouseleave', () => exportButton.style.transform = 'translateY(0) scale(1)');

        document.body.appendChild(exportButton);

        // Toast status container
        statusDiv = document.createElement('div');
        statusDiv.id = 'ge-status-toast';
        statusDiv.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 30px;
            padding: 10px 16px;
            background: #333;
            color: #fff;
            border-radius: 8px;
            font-size: 13px;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            font-family: system-ui;
        `;
        document.body.appendChild(statusDiv);

        console.log(t.logUICreated);
    }

    async function handleExportClick() {
        if (isScrolling) {
            updateStatus(t.statusStop);
            isScrolling = false;
            exportButton.title = t.statusStop;
            exportButton.disabled = true;
            return;
        }

        // Read settings from storage
        const settings = await chrome.storage.local.get(['exportFormat', 'exportType']);
        const format = settings.exportFormat || 'md';
        const type = settings.exportType || 'both'; // Default to Both as requested

        // Update global format var for existing logic compatibility
        window.__GEMINI_EXPORT_FORMAT = format;

        console.log(t.logStartingExport(type, format));
        updateStatus(`${t.statusStarting} (${type}, ${format})`);

        if (type === 'dialog') {
            handleScrollExtraction();
        } else if (type === 'canvas') {
            handleCanvasExtraction();
        } else if (type === 'both') {
            handleCombinedExtraction();
        }
    }




    function updateStatus(message) {
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.style.opacity = message ? '1' : '0';
        }
        console.log(`[Status] ${message}`);
    }


    // --- 核心业务逻辑 (滚动导出) ---


    // --- 动态选择器修复逻辑 ---


    function generateSelector(el) {
        if (!el) return '';
        let tagName = el.tagName.toLowerCase();
        let classes = Array.from(el.classList).join('.');
        if (classes) return `${tagName}.${classes}`;
        if (el.id) return `#${el.id}`;

        // Fallback to hierarchy if no class/id
        let path = [tagName];
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
            let tag = parent.tagName.toLowerCase();
            if (parent.id) {
                path.unshift(`#${parent.id}`);
                break; // Stop at ID
            }
            if (parent.classList.length > 0) {
                path.unshift(`${tag}.${Array.from(parent.classList)[0]}`);
            } else {
                path.unshift(tag);
            }
            parent = parent.parentElement;
        }
        // Limit path length to avoid overly specific selectors
        return path.slice(-3).join(' > ');
    }

    function saveSelectors(newSelectors) {
        SELECTORS = { ...SELECTORS, ...newSelectors };
        localStorage.setItem('gemini_export_selectors', JSON.stringify(SELECTORS));
        console.log(t.logSelectorsUpdated, SELECTORS);
    }

    // Canvas 内容提取和导出逻辑
    function extractCanvasContent() {
        console.log(t.logExtractingCanvas);
        const canvasData = [];
        const seenContents = new Set(); // 用于去重

        // 提取当前页面显示的代码块
        const codeBlocks = document.querySelectorAll('code-block, pre code, .code-block');

        codeBlocks.forEach((block, index) => {
            const codeContent = block.textContent || block.innerText;
            if (codeContent && codeContent.trim()) {
                const trimmedContent = codeContent.trim();
                // 使用内容的前100个字符作为唯一性检查
                const contentKey = trimmedContent.substring(0, 100);
                if (!seenContents.has(contentKey)) {
                    seenContents.add(contentKey);
                    canvasData.push({
                        type: 'code',
                        index: canvasData.length + 1,
                        content: trimmedContent,
                        language: block.querySelector('[data-lang]')?.getAttribute('data-lang') || 'unknown'
                    });
                }
            }
        });

        // 提取响应内容中的文本
        const responseElements = document.querySelectorAll('response-element, .model-response-text, .markdown');
        responseElements.forEach((element, index) => {
            // 跳过代码块，避免重复
            if (!element.closest('code-block') && !element.querySelector('code-block')) {
                const textContent = element.textContent || element.innerText;
                if (textContent && textContent.trim()) {
                    const trimmedContent = textContent.trim();
                    // 使用内容的前100个字符作为唯一性检查
                    const contentKey = trimmedContent.substring(0, 100);
                    if (!seenContents.has(contentKey)) {
                        seenContents.add(contentKey);
                        canvasData.push({
                            type: 'text',
                            index: canvasData.length + 1,
                            content: trimmedContent
                        });
                    }
                }
            }
        });

        // 如果没有找到特定元素，尝试从整个聊天容器提取
        if (canvasData.length === 0) {
            const chatContainer = document.querySelector('chat-window-content, .conversation-container, model-response');
            if (chatContainer) {
                const allText = chatContainer.textContent || chatContainer.innerText;
                if (allText && allText.trim()) {
                    const trimmedContent = allText.trim();
                    const contentKey = trimmedContent.substring(0, 100);
                    if (!seenContents.has(contentKey)) {
                        canvasData.push({
                            type: 'full_content',
                            index: 1,
                            content: trimmedContent
                        });
                    }
                }
            }
        }

        console.log(t.logCanvasExtracted(canvasData.length));
        return canvasData;
    }

    function formatCanvasDataForExport(canvasData, context) {
        const mode = (window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase();
        const projectName = getProjectName();
        const ts = getCurrentTimestamp();
        const base = projectName;

        function escapeMd(s) {
            return s.replace(/`/g, '\u0060').replace(/</g, '&lt;');
        }

        if (mode === 'txt') {
            let body = `${t.txtCombinedHeader}\n=========================================\n\n`;
            canvasData.forEach(item => {
                if (item.type === 'code') {
                    body += `${t.txtCodeBlock(item.index, item.language)}\n${item.content}\n\n`;
                } else if (item.type === 'text') {
                    body += `${t.txtTextBlock(item.index)}\n${item.content}\n\n`;
                } else {
                    body += `${t.txtFullContent}\n${item.content}\n\n`;
                }
                body += "------------------------------\n\n";
            });
            body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
            return { blob: new Blob([body], { type: 'text/plain;charset=utf-8' }), filename: `${base}.txt` };
        }

        if (mode === 'json') {
            const jsonData = {
                exportType: 'canvas',
                timestamp: ts,
                projectName: projectName,
                content: canvasData
            };
            return { blob: new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' }), filename: `${base}.json` };
        }

        if (mode === 'md') {
            let md = `${t.mdHeaderCanvas(projectName)}\n\n`;
            md += `${t.mdExportTime(ts)}\n\n`;
            canvasData.forEach((item, idx) => {
                md += `${t.mdContentBlock(idx + 1)}\n\n`;
                if (item.type === 'code') {
                    md += `${t.mdCodeBlock(item.language)}\n\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
                } else if (item.type === 'text') {
                    md += `${t.mdTextBlock}\n\n${escapeMd(item.content)}\n\n`;
                } else {
                    md += `${t.mdFullContent}\n\n${escapeMd(item.content)}\n\n`;
                }
                md += `---\n\n`;
            });
            return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
        }
    }

    async function handleCanvasExtraction() {
        console.log("Starting Canvas Export...");
        exportButton.disabled = true;
        exportButton.title = t.btnProcessing;

        try {
            updateStatus(t.statusStep1);
            const canvasData = extractCanvasContent();

            if (canvasData.length === 0) {
                alert(t.statusNoCanvas);
                updateStatus(`Canvas: ${t.statusNoCanvas}`);
            } else {
                updateStatus(t.statusProcessing(canvasData.length));
                const exportData = formatCanvasDataForExport(canvasData, 'export');

                const a = document.createElement('a');
                const url = URL.createObjectURL(exportData.blob);
                a.href = url;
                a.download = exportData.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                updateStatus(t.statusSuccess(exportData.filename));
            }
        } catch (error) {
            console.error('Canvas Error:', error);
            updateStatus(t.statusError(error.message));
        } finally {
            setTimeout(() => {
                exportButton.title = t.btnExport;
                exportButton.disabled = false;
                updateStatus('');
            }, exportTimeout);
        }
    }

    // 组合导出功能：同时导出对话和Canvas内容
    async function handleCombinedExtraction() {
        console.log("Starting Combined Export...");

        // This is a scrolling operation, allow stop
        exportButton.title = t.btnStop;
        exportButton.disabled = false;

        try {
            updateStatus(t.statusStep1);
            const canvasData = extractCanvasContent();

            updateStatus(t.statusStep2);
            collectedData.clear();
            isScrolling = true;
            scrollCount = 0;
            noChangeCounter = 0;

            const scroller = getMainScrollerElement();
            if (scroller) {
                updateStatus(t.statusReset);
                const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
                if (isWindowScroller) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    scroller.scrollTo({ top: 0, behavior: 'smooth' });
                }
                await delay(1500);
            }

            const scrollSuccess = await autoScrollDown_AiStudio();
            if (scrollSuccess !== false) {
                updateStatus(t.statusProcessing(collectedData.size));
                await delay(500);
                extractDataIncremental_AiStudio();
                await delay(200);
            } else {
                throw new Error('Scroll failed');
            }

            updateStatus(t.statusStep3);
            let scrollData = [];
            if (document.querySelector('#chat-history .conversation-container')) {
                const cs = document.querySelectorAll('#chat-history .conversation-container');
                cs.forEach(c => { if (collectedData.has(c)) scrollData.push(collectedData.get(c)); });
            } else {
                const turns = document.querySelectorAll('ms-chat-turn');
                turns.forEach(t => { if (collectedData.has(t)) scrollData.push(collectedData.get(t)); });
            }

            const combinedData = formatCombinedDataForExport(scrollData, canvasData);

            const a = document.createElement('a');
            const url = URL.createObjectURL(combinedData.blob);
            a.href = url;
            a.download = combinedData.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            updateStatus(t.statusSuccess(combinedData.filename));
            exportButton.title = t.btnSuccess;

        } catch (error) {
            console.error('Combined Export Error:', error);
            updateStatus(t.statusError(error.message));
            exportButton.title = t.btnError;
        } finally {
            isScrolling = false;
            setTimeout(() => {
                exportButton.title = t.btnExport;
                exportButton.disabled = false;
                updateStatus('');
            }, exportTimeout);
        }
    }

    // 组合数据格式化和导出函数
    function formatCombinedDataForExport(scrollData, canvasData) {
        const mode = (window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase();
        const projectName = getProjectName();
        const ts = getCurrentTimestamp();
        const base = projectName;

        function escapeMd(s) {
            return s.replace(/`/g, '\u0060').replace(/</g, '&lt;');
        }

        // 对对话数据进行去重处理
        function deduplicateScrollData(data) {
            if (!data || !Array.isArray(data)) return [];

            const seen = new Set();
            const deduplicated = [];

            data.forEach(item => {
                // 创建内容的唯一标识符
                const contentKey = [
                    item.userText || '',
                    item.thoughtText || '',
                    item.responseText || ''
                ].join('|||').substring(0, 200); // 使用前200个字符作为唯一性标识

                if (!seen.has(contentKey)) {
                    seen.add(contentKey);
                    deduplicated.push(item);
                }
            });

            return deduplicated;
        }

        // 去重处理
        const deduplicatedScrollData = deduplicateScrollData(scrollData);

        if (mode === 'txt') {
            let body = `${t.txtCombinedHeader}
=========================================

`;

            // 添加对话内容
            if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                body += `${t.txtDialogSection}

`;
                deduplicatedScrollData.forEach(item => {
                    let block = '';
                    if (item.userText) block += `${t.txtUser}\n${item.userText}\n\n`;
                    if (item.thoughtText) block += `${t.txtAIThought}\n${item.thoughtText}\n\n`;
                    if (item.responseText) block += `${t.txtAIResponse}\n${item.responseText}\n\n`;
                    body += block.trim() + "\n\n------------------------------\n\n";
                });
            }

            // 添加Canvas内容
            if (canvasData && canvasData.length > 0) {
                body += `\n\n${t.txtCanvasSection}\n\n`;
                canvasData.forEach(item => {
                    if (item.type === 'code') {
                        body += `${t.txtCodeBlock(item.index, item.language)}\n${item.content}\n\n`;
                    } else if (item.type === 'text') {
                        body += `${t.txtTextBlock(item.index)}\n${item.content}\n\n`;
                    } else {
                        body += `${t.txtFullContent}\n${item.content}\n\n`;
                    }
                    body += "------------------------------\n\n";
                });
            }

            body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
            return { blob: new Blob([body], { type: 'text/plain;charset=utf-8' }), filename: `${base}.txt` };
        }

        if (mode === 'json') {
            const jsonData = {
                exportType: 'combined',
                timestamp: ts,
                projectName: projectName,
                dialogue: [],
                canvas: canvasData || []
            };

            // 添加对话数据
            if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                deduplicatedScrollData.forEach(item => {
                    if (item.userText) jsonData.dialogue.push({ role: 'user', content: item.userText, id: `${item.domOrder}-user` });
                    if (item.thoughtText) jsonData.dialogue.push({ role: 'thought', content: item.thoughtText, id: `${item.domOrder}-thought` });
                    if (item.responseText) jsonData.dialogue.push({ role: 'assistant', content: item.responseText, id: `${item.domOrder}-assistant` });
                });
            }

            return { blob: new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' }), filename: `${base}.json` };
        }

        if (mode === 'md') {
            let md = `${t.mdHeaderCombined(projectName)}\n\n${t.mdExportTime(ts)}\n\n`;

            // 添加对话内容
            if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                md += `## ${t.txtDialogSection.replace(/=== /g, '')}\n\n`;
                deduplicatedScrollData.forEach((item, idx) => {
                    md += `${t.mdTurn(idx + 1)}\n\n`;
                    if (item.userText) md += `${t.mdUser}\n\n${escapeMd(item.userText)}\n\n`;
                    if (item.thoughtText) md += `<details><summary>${t.mdAIThought}</summary>\n\n${escapeMd(item.thoughtText)}\n\n</details>\n\n`;
                    if (item.responseText) md += `${t.mdAIResponse}\n\n${escapeMd(item.responseText)}\n\n`;
                    md += `---\n\n`;
                });
            }

            // 添加Canvas内容
            if (canvasData && canvasData.length > 0) {
                md += `## ${t.txtCanvasSection.replace(/=== /g, '')}\n\n`;
                canvasData.forEach((item, idx) => {
                    md += `${t.mdContentBlock(idx + 1)}\n\n`;
                    if (item.type === 'code') {
                        md += `${t.mdCodeBlock(item.language)}\n\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
                    } else if (item.type === 'text') {
                        md += `${t.mdTextBlock}\n\n${escapeMd(item.content)}\n\n`;
                    } else {
                        md += `${t.mdFullContent}\n\n${escapeMd(item.content)}\n\n`;
                    }
                    md += `---\n\n`;
                });
            }

            return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
        }
    }
    function extractDataIncremental_AiStudio() {
        let newlyFoundCount = 0;
        let dataUpdatedInExistingTurn = false;
        const currentTurns = document.querySelectorAll('ms-chat-turn');
        const seenUserTexts = new Set(); // 用于去重用户消息

        currentTurns.forEach((turn, index) => {
            const turnKey = turn;
            const turnContainer = turn.querySelector('.chat-turn-container.user, .chat-turn-container.model');
            if (!turnContainer) {
                return;
            }

            let isNewTurn = !collectedData.has(turnKey);
            let extractedInfo = collectedData.get(turnKey) || {
                domOrder: index, type: 'unknown', userText: null, thoughtText: null, responseText: null
            };
            if (isNewTurn) {
                collectedData.set(turnKey, extractedInfo);
                newlyFoundCount++;
            }

            let dataWasUpdatedThisTime = false;

            if (turnContainer.classList.contains('user')) {
                if (extractedInfo.type === 'unknown') extractedInfo.type = 'user';
                if (!extractedInfo.userText) {
                    let userNode = turn.querySelector('.turn-content ms-cmark-node');
                    let userText = userNode ? userNode.innerText.trim() : null;
                    if (userText) {
                        // 检查是否已经存在相同的用户消息
                        if (!seenUserTexts.has(userText)) {
                            seenUserTexts.add(userText);
                            extractedInfo.userText = userText;
                            dataWasUpdatedThisTime = true;
                        }
                    }
                }
            } else if (turnContainer.classList.contains('model')) {
                if (extractedInfo.type === 'unknown') extractedInfo.type = 'model';

                if (!extractedInfo.thoughtText) {
                    let thoughtNode = turn.querySelector('.thought-container .mat-expansion-panel-body');
                    if (thoughtNode) {
                        let thoughtText = thoughtNode.textContent.trim();
                        if (thoughtText && thoughtText.toLowerCase() !== 'thinking process:') {
                            extractedInfo.thoughtText = thoughtText;
                            dataWasUpdatedThisTime = true;
                        }
                    }
                }

                if (!extractedInfo.responseText) {
                    const responseChunks = Array.from(turn.querySelectorAll('.turn-content > ms-prompt-chunk'));
                    const responseTexts = responseChunks
                        .filter(chunk => !chunk.querySelector('.thought-container'))
                        .map(chunk => {
                            const cmarkNode = chunk.querySelector('ms-cmark-node');
                            return cmarkNode ? cmarkNode.innerText.trim() : chunk.innerText.trim();
                        })
                        .filter(text => text);

                    if (responseTexts.length > 0) {
                        extractedInfo.responseText = responseTexts.join('\n\n');
                        dataWasUpdatedThisTime = true;
                    } else if (!extractedInfo.thoughtText) {
                        const turnContent = turn.querySelector('.turn-content');
                        if (turnContent) {
                            extractedInfo.responseText = turnContent.innerText.trim();
                            dataWasUpdatedThisTime = true;
                        }
                    }
                }

                if (dataWasUpdatedThisTime) {
                    if (extractedInfo.thoughtText && extractedInfo.responseText) extractedInfo.type = 'model_thought_reply';
                    else if (extractedInfo.responseText) extractedInfo.type = 'model_reply';
                    else if (extractedInfo.thoughtText) extractedInfo.type = 'model_thought';
                }
            }

            if (dataWasUpdatedThisTime) {
                collectedData.set(turnKey, extractedInfo);
                dataUpdatedInExistingTurn = true;
            }
        });

        if (currentTurns.length > 0 && collectedData.size === 0) {
            console.warn(t.statusWarnNoData);
            updateStatus(t.statusWarnNoData);
        } else {
            updateStatus(t.statusScrolling(scrollCount, MAX_SCROLL_ATTEMPTS, collectedData.size));
        }


        return newlyFoundCount > 0 || dataUpdatedInExistingTurn;
    }

    async function autoScrollDown_AiStudio() {
        console.log(t.logFindingScroller);
        isScrolling = true; collectedData.clear(); scrollCount = 0; noChangeCounter = 0;
        const scroller = getMainScrollerElement();
        if (!scroller) {
            updateStatus(t.statusScrollError);
            alert(t.statusScrollNotFoundAlert);
            isScrolling = false; return false;
        }
        console.log('使用的滚动元素(滚动导出):', scroller);
        const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
        const getScrollTop = () => isWindowScroller ? window.scrollY : scroller.scrollTop;
        const getScrollHeight = () => isWindowScroller ? document.documentElement.scrollHeight : scroller.scrollHeight;
        const getClientHeight = () => isWindowScroller ? window.innerHeight : scroller.clientHeight;
        updateStatus(t.statusScrolling(0, MAX_SCROLL_ATTEMPTS, 0));
        let lastScrollHeight = -1;

        while (scrollCount < MAX_SCROLL_ATTEMPTS && isScrolling) {
            const currentScrollTop = getScrollTop(); const currentScrollHeight = getScrollHeight(); const currentClientHeight = getClientHeight();
            if (currentScrollHeight === lastScrollHeight) { noChangeCounter++; } else { noChangeCounter = 0; }
            lastScrollHeight = currentScrollHeight;
            if (noChangeCounter >= SCROLL_STABILITY_CHECKS && currentScrollTop + currentClientHeight >= currentScrollHeight - 20) {
                console.log(t.statusScrollCompleteBottom);
                updateStatus(t.statusScrollCompleteBottom);
                break;
            }
            if (currentScrollTop === 0 && scrollCount > 10) {
                console.log(t.statusScrollCompleteTop);
                updateStatus(t.statusScrollCompleteTop);
                break;
            }
            const targetScrollTop = currentScrollTop + (currentClientHeight * SCROLL_INCREMENT_FACTOR);
            if (isWindowScroller) { window.scrollTo({ top: targetScrollTop, behavior: 'smooth' }); } else { scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' }); }
            scrollCount++;
            updateStatus(t.statusScrolling(scrollCount, MAX_SCROLL_ATTEMPTS, collectedData.size));
            await delay(SCROLL_DELAY_MS);
            // 使用统一调度：优先 Gemini 结构，其次 AI Studio
            try { extractDataIncremental_Dispatch(); } catch (e) { console.warn('调度提取失败，回退 AI Studio 提取', e); try { extractDataIncremental_AiStudio(); } catch (_) { } }
            if (!isScrolling) {
                console.log("检测到手动停止信号 (滚动导出)，退出滚动循环。"); break;
            }
        }

        if (!isScrolling && scrollCount < MAX_SCROLL_ATTEMPTS) {
            updateStatus(t.statusScrollManualStop(scrollCount));
        } else if (scrollCount >= MAX_SCROLL_ATTEMPTS) {
            updateStatus(t.statusScrollMaxAttempts(MAX_SCROLL_ATTEMPTS));
        }
        isScrolling = false;
        return true;
    }

    function formatAndExport(sortedData, context) { // 多格式骨架
        const mode = (window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase();
        const projectName = getProjectName();
        const ts = getCurrentTimestamp();
        const base = projectName;

        // 对数据进行去重处理
        function deduplicateData(data) {
            if (!data || !Array.isArray(data)) return [];

            const seen = new Set();
            const deduplicated = [];

            data.forEach(item => {
                // 创建内容的唯一标识符
                const contentKey = [
                    item.userText || '',
                    item.thoughtText || '',
                    item.responseText || ''
                ].join('|||').substring(0, 200); // 使用前200个字符作为唯一性标识

                if (!seen.has(contentKey)) {
                    seen.add(contentKey);
                    deduplicated.push(item);
                }
            });

            return deduplicated;
        }

        // 去重处理
        const deduplicatedData = deduplicateData(sortedData);

        function escapeMd(s) {
            return s.replace(/`/g, '\u0060').replace(/</g, '&lt;');
        }
        if (mode === 'txt') {
            let header = context === 'scroll' ? t.txtHeaderScroll : t.txtHeaderSDK;
            let body = `${header}\n=========================================\n\n`;
            deduplicatedData.forEach(item => {
                let block = '';
                if (item.userText) block += `${t.txtUser}\n${item.userText}\n\n`;
                if (item.thoughtText) block += `${t.txtAIThought}\n${item.thoughtText}\n\n`;
                if (item.responseText) block += `${t.txtAIResponse}\n${item.responseText}\n\n`;
                if (!block) {
                    block = `${t.txtIncompleteTurn}\n`;
                    if (item.thoughtText) block += `${t.txtThoughtIncomplete} ${item.thoughtText}\n`;
                    if (item.responseText) block += `${t.txtResponseIncomplete} ${item.responseText}\n`;
                    block += '\n';
                }
                body += block.trim() + "\n\n------------------------------\n\n";
            });
            body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
            return { blob: new Blob([body], { type: 'text/plain;charset=utf-8' }), filename: `${base}.txt` };
        }
        if (mode === 'json') {
            let arr = [];
            deduplicatedData.forEach(item => {
                if (item.userText) arr.push({ role: 'user', content: item.userText, id: `${item.domOrder}-user` });
                if (item.thoughtText) arr.push({ role: 'thought', content: item.thoughtText, id: `${item.domOrder}-thought` });
                if (item.responseText) arr.push({ role: 'assistant', content: item.responseText, id: `${item.domOrder}-assistant` });
            });
            return { blob: new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json;charset=utf-8' }), filename: `${base}.json` };
        }
        if (mode === 'md') { // 正式 Markdown 格式
            let md = `${t.mdHeaderScroll(projectName, context)}\n\n`;
            md += `${t.mdExportTime(ts)}\n\n`;
            deduplicatedData.forEach((item, idx) => {
                md += `${t.mdTurn(idx + 1)}\n\n`;
                if (item.userText) md += `${t.mdUser}\n\n${escapeMd(item.userText)}\n\n`;
                if (item.thoughtText) md += `<details><summary>${t.mdAIThought}</summary>\n\n${escapeMd(item.thoughtText)}\n\n</details>\n\n`;
                if (item.responseText) md += `${t.mdAIResponse}\n\n${escapeMd(item.responseText)}\n\n`;
                md += `---\n\n`;
            });
            return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
        }
    }
    function formatAndTriggerDownloadScroll() {
        updateStatus(t.logGeneratingFile(collectedData.size));
        let sorted = [];
        if (document.querySelector('#chat-history .conversation-container')) {
            const cs = document.querySelectorAll('#chat-history .conversation-container');
            cs.forEach(c => { if (collectedData.has(c)) sorted.push(collectedData.get(c)); });
        } else {
            const turns = document.querySelectorAll('ms-chat-turn');
            turns.forEach(t => { if (collectedData.has(t)) sorted.push(collectedData.get(t)); });
        }
        if (!sorted.length) {
            updateStatus(t.statusNoDialog);
            alert(t.statusNoDialog);
            exportButton.title = t.btnExport;
            exportButton.disabled = false;
            updateStatus('');
            return;
        }
        try {
            const pack = formatAndExport(sorted, 'scroll');
            const a = document.createElement('a');
            const url = URL.createObjectURL(pack.blob);
            a.href = url; a.download = pack.filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            exportButton.title = t.btnSuccess;
        } catch (e) {
            console.error('File generation failed:', e);
            exportButton.title = t.btnError;
            alert('Error generating file: ' + e.message);
        }
        setTimeout(() => {
            exportButton.title = t.btnExport;
            exportButton.disabled = false;
            updateStatus('');
        }, exportTimeout);
    }

    // TODO 2025-09-08: 后续可实现自动展开 Gemini 隐藏思维链（需要模拟点击“显示思路”按钮），当前以占位符标记
    // TODO 2025-09-08: Markdown 正式格式化尚未实现，当前仅输出占位头部，保持向后兼容

    async function handleScrollExtraction() {
        if (isScrolling) return; // Should catch by handleExportClick earlier, but safety check.

        exportButton.title = t.btnStop;
        exportButton.disabled = false;

        const scroller = getMainScrollerElement();
        if (scroller) {
            updateStatus(t.statusReset);
            const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
            if (isWindowScroller) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                scroller.scrollTo({ top: 0, behavior: 'smooth' });
            }
            await delay(1500);
        }

        updateStatus(t.statusScanning);

        try {
            const scrollSuccess = await autoScrollDown_AiStudio();
            if (scrollSuccess !== false) {
                exportButton.title = t.btnProcessing;
                updateStatus(t.statusProcessing(collectedData.size));
                await delay(500);
                extractDataIncremental_AiStudio();
                await delay(200);
                formatAndTriggerDownloadScroll();
            } else {
                exportButton.title = t.btnFailed;
                setTimeout(() => {
                    exportButton.title = t.btnExport;
                    exportButton.disabled = false;
                    updateStatus('');
                }, exportTimeout);
            }
        } catch (error) {
            console.error('Scroll Error:', error);
            updateStatus(t.statusError(error.message));
            exportButton.title = t.btnError;
            setTimeout(() => {
                exportButton.title = t.btnExport;
                exportButton.disabled = false;
                updateStatus('');
            }, exportTimeout);
            isScrolling = false;
        } finally {
            isScrolling = false;
        }
    }

    // --- 脚本初始化入口 ---
    console.log("Gemini_Chat_Export 导出脚本 (v1.0.7): 等待页面加载 (2.5秒)...");
    startThemeSync();
    setTimeout(createUI, 2500);

})();