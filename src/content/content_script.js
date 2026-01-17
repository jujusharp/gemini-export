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

    // --- 全局配置常量 ---
    // UPDATED: 支持隐藏格式钩子 window.__GEMINI_EXPORT_FORMAT = 'txt'|'json'|'md'
    const buttonTextStartScroll = "滚动导出对话";
    const buttonTextStopScroll = "停止滚动";
    const buttonTextProcessingScroll = "处理滚动数据...";
    const successTextScroll = "滚动导出对话成功!";
    const errorTextScroll = "滚动导出失败";

    // Canvas 导出相关常量
    const buttonTextCanvasExport = "导出Canvas";
    const buttonTextCanvasProcessing = "处理Canvas数据...";
    const successTextCanvas = "Canvas 导出成功!";
    const errorTextCanvas = "Canvas 导出失败";

    // 组合导出相关常量
    const buttonTextCombinedExport = "一键导出对话+Canvas";
    const buttonTextCombinedProcessing = "处理组合数据...";
    const successTextCombined = "组合导出成功!";
    const errorTextCombined = "组合导出失败";

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
    let captureButtonScroll = null;
    let stopButtonScroll = null;
    let captureButtonCanvas = null;
    let captureButtonCombined = null;
    let statusDiv = null;
    let hideButton = null;
    let buttonContainer = null;
    let sidePanel = null;
    let toggleButton = null;
    let formatSelector = null;

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


    function getMainScrollerElement_AiStudio() {
        console.log("尝试查找滚动容器 (用于滚动导出)...");
        let scroller = document.querySelector('.chat-scrollable-container');
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

    // Gemini 新增滚动容器获取与解析逻辑
    function getMainScrollerElement_Gemini() {
        return document.querySelector('#chat-history') || document.documentElement;
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
        console.log("开始创建 UI 元素...");

        // 创建右侧折叠按钮
        toggleButton = document.createElement('div');
        toggleButton.id = 'gemini-export-toggle';
        toggleButton.innerHTML = '<';
        toggleButton.style.cssText = `
			position: fixed;
			top: 50%;
			right: 0;
			width: 40px;
			height: 60px;
			background: var(--ge-primary);
			color: var(--ge-on-primary);
			border: none;
			border-radius: 20px 0 0 20px;
			cursor: pointer;
			z-index: 10001;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 18px;
			font-weight: bold;
			box-shadow: none;
			transition: all 0.3s ease;
			transform: translateY(-50%);
		`;
        document.body.appendChild(toggleButton);

        // 创建右侧面板
        sidePanel = document.createElement('div');
        sidePanel.id = 'gemini-export-panel';
        sidePanel.style.cssText = `
			position: fixed;
			top: 0;
			right: -400px;
			width: 400px;
			height: 100vh;
			background: var(--ge-panel-bg);
			z-index: 10000;
			transition: right 0.3s ease;
			box-shadow: none;
			overflow-y: auto;
		`;
        document.body.appendChild(sidePanel);



        // 面板内容
        sidePanel.innerHTML = `
			<div style="padding: 20px; color: var(--ge-panel-text); font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">
				<div style="display: flex; align-items: center; margin-bottom: 16px;">
					<div style="width: 4px; height: 18px; background: var(--ge-success); margin-right: 10px; border-radius: 2px;"></div>
					<h2 style="margin: 0; font-size: 16px; font-weight: 600;">Gemini 导出助手</h2>
				</div>
				<p style="margin: 0 0 16px 0; font-size: 12px; color: var(--ge-text-muted); line-height: 1.5;">一键导出聊天记录与 Canvas 内容</p>

				<div style="background: var(--ge-surface); border: 1px solid var(--ge-border); border-radius: 10px; padding: 12px; margin-bottom: 16px;">
					<h3 style="margin: 0 0 8px 0; font-size: 13px; color: var(--ge-panel-text);">使用提示</h3>
					<div style="font-size: 12px; color: var(--ge-text-muted); line-height: 1.6;">
						<div style="margin-bottom: 6px;">导出前建议先滚动到对话顶部，避免缺失</div>
						<div>如页面结构更新导致无法识别，请更新选择器</div>
					</div>
				</div>

				<div style="margin-bottom: 16px;">
					<h3 style="margin: 0 0 10px 0; font-size: 13px; color: var(--ge-panel-text);">导出格式</h3>
					<div id="format-selector" style="display: flex; gap: 8px;">
						<div class="format-option" data-format="txt" style="flex: 1; padding: 10px; background: var(--ge-surface); border-radius: 8px; text-align: center; cursor: pointer; font-size: 12px; border: 1px solid var(--ge-border); position: relative;">
							<div style="font-weight: 600; margin-bottom: 2px;">TXT</div>
							<div style="color: var(--ge-text-muted-2); font-size: 10px;">纯文本</div>
						</div>
						<div class="format-option" data-format="json" style="flex: 1; padding: 10px; background: var(--ge-surface); border-radius: 8px; text-align: center; cursor: pointer; font-size: 12px; border: 1px solid var(--ge-border); position: relative;">
							<div style="font-weight: 600; margin-bottom: 2px;">JSON</div>
							<div style="color: var(--ge-text-muted-2); font-size: 10px;">结构化</div>
						</div>
						<div class="format-option" data-format="md" style="flex: 1; padding: 10px; background: var(--ge-surface); border-radius: 8px; text-align: center; cursor: pointer; font-size: 12px; border: 1px solid var(--ge-border); position: relative;">
							<div style="font-weight: 600; margin-bottom: 2px;">MD</div>
							<div style="color: var(--ge-text-muted-2); font-size: 10px;">Markdown</div>
						</div>
					</div>
				</div>

				<!-- 功能按钮区域 -->
				<div id="button-container" style="display: flex; flex-direction: column; gap: 12px;">
					<!-- 滚动导出按钮 -->
					<button id="capture-chat-scroll-button" style="
						width: 100%;
						padding: 12px;
						background: var(--ge-primary);
						color: var(--ge-on-primary);
						border: 1px solid var(--ge-primary-border);
						border-radius: 10px;
						cursor: pointer;
						font-size: 13px;
						font-weight: 600;
						transition: all 0.2s ease;
					">${buttonTextStartScroll}</button>

					<!-- Canvas导出按钮 -->
					<button id="capture-canvas-button" style="
						width: 100%;
						padding: 12px;
						background: var(--ge-success);
						color: var(--ge-on-primary);
						border: 1px solid var(--ge-success-border);
						border-radius: 10px;
						cursor: pointer;
						font-size: 13px;
						font-weight: 600;
						transition: all 0.2s ease;
					">${buttonTextCanvasExport}</button>

					<!-- 组合导出按钮 -->
					<button id="capture-combined-button" style="
						width: 100%;
						padding: 12px;
						background: var(--ge-neutral);
						color: var(--ge-on-primary);
						border: 1px solid var(--ge-neutral-border);
						border-radius: 10px;
						cursor: pointer;
						font-size: 13px;
						font-weight: 600;
						transition: all 0.2s ease;
					">${buttonTextCombinedExport}</button>


                    <!-- 停止按钮 -->
                    <button id="stop-scrolling-button" style="
                        width: 100%;
                        padding: 12px;
                        background: var(--ge-danger);
                        color: var(--ge-on-primary);
                        border: 1px solid var(--ge-danger-border);
                        border-radius: 10px;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        display: none;
                    ">${buttonTextStopScroll}</button>

                    <div style="height: 1px; background: var(--ge-border); margin: 8px 0;"></div>

                    <!-- 修复选择器按钮 -->
                     <button id="fix-selectors-button" style="
                        width: 100%;
                        padding: 8px;
                        background: transparent;
                        color: var(--ge-text-muted);
                        border: 1px dashed var(--ge-border);
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.2s ease;
                    ">🛠 修复选择器 (页面结构更新时使用)</button>
                </div>

                <!-- 状态信息 -->
                <div id="extract-status-div" style="
                    margin-top: 16px;
                    padding: 10px;
                    background: var(--ge-surface);
                    border: 1px solid var(--ge-border);
                    border-radius: 8px;
                    font-size: 12px;
                    line-height: 1.5;
                    display: none;
                    color: var(--ge-text-muted);
                "></div>

                <!-- 版权信息 -->
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--ge-border); text-align: center; font-size: 11px; color: var(--ge-text-muted-2);">
                    v0.0.1 | zhushao © 2026
                </div>
            </div>
        `;

        // 获取元素引用
        captureButtonScroll = document.getElementById('capture-chat-scroll-button');
        captureButtonCanvas = document.getElementById('capture-canvas-button');
        captureButtonCombined = document.getElementById('capture-combined-button');
        stopButtonScroll = document.getElementById('stop-scrolling-button');
        statusDiv = document.getElementById('extract-status-div');
        formatSelector = document.getElementById('format-selector');

        // 初始化格式选择器
        initFormatSelector();

        // 添加事件监听器
        captureButtonScroll.addEventListener('click', handleScrollExtraction);
        captureButtonCanvas.addEventListener('click', handleCanvasExtraction);
        captureButtonCombined.addEventListener('click', handleCombinedExtraction);
        document.getElementById('fix-selectors-button').addEventListener('click', startSelectorPickerFlow);
        stopButtonScroll.addEventListener('click', () => {
            if (isScrolling) {
                updateStatus('手动停止滚动信号已发送..');
                isScrolling = false;
                stopButtonScroll.disabled = true;
                stopButtonScroll.textContent = '正在停止...';
            }
        });

        // 折叠按钮点击事件
        toggleButton.addEventListener('click', togglePanel);



        // 添加样式
        GM_addStyle(`
			#capture-chat-scroll-button:hover,
			#capture-canvas-button:hover,
			#capture-combined-button:hover,
			#stop-scrolling-button:hover {
				filter: brightness(1.05);
				transform: translateY(-1px);
			}

			#capture-chat-scroll-button:active,
			#capture-canvas-button:active,
			#capture-combined-button:active,
			#stop-scrolling-button:active {
				transform: translateY(0);
			}

			#capture-chat-scroll-button:disabled,
			#capture-canvas-button:disabled,
			#capture-combined-button:disabled,
			#stop-scrolling-button:disabled {
				opacity: 0.6;
				cursor: not-allowed;
				transform: none !important;
				background: var(--ge-neutral) !important;
				border-color: var(--ge-neutral-border) !important;
			}

			.success {
				background: var(--ge-success) !important;
				border-color: var(--ge-success-border) !important;
			}
			.error {
				background: var(--ge-danger) !important;
				border-color: var(--ge-danger-border) !important;
			}

			.format-option:hover {
				border-color: var(--ge-border-hover) !important;
			}
			.format-option.selected {
				border-color: var(--ge-success) !important;
			}

			#gemini-export-toggle:hover {
				right: 8px;
				transform: translateY(-50%) scale(1.06);
				background: var(--ge-primary-hover);
			}

			#gemini-export-panel::-webkit-scrollbar {
				width: 6px;
			}
			#gemini-export-panel::-webkit-scrollbar-track {
				background: var(--ge-panel-bg);
			}
			#gemini-export-panel::-webkit-scrollbar-thumb {
				background: var(--ge-scroll-thumb);
				border-radius: 3px;
			}
			#gemini-export-panel::-webkit-scrollbar-thumb:hover {
				background: var(--ge-scroll-thumb-hover);
			}


		`);



        console.log("UI 元素创建完成");
    }

    // 格式选择器初始化
    function initFormatSelector() {
        const options = formatSelector.querySelectorAll('.format-option');
        const currentFormat = window.__GEMINI_EXPORT_FORMAT || 'md';

        // 设置初始选中状态
        options.forEach(option => {
            if (option.dataset.format === currentFormat) {
                option.classList.add('selected');
            }

            // 添加点击事件
            option.addEventListener('click', () => {
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                window.__GEMINI_EXPORT_FORMAT = option.dataset.format;
                updateStatus(`导出格式已切换为: ${option.dataset.format.toUpperCase()}`);

                // 2秒后清除状态信息
                setTimeout(() => {
                    if (statusDiv.textContent.includes('导出格式已切换')) {
                        updateStatus('');
                    }
                }, 2000);
            });
        });
    }

    // 折叠面板切换
    function togglePanel() {
        const isOpen = sidePanel.style.right === '0px';

        if (isOpen) {
            // 关闭面板
            sidePanel.style.right = '-420px';
            toggleButton.innerHTML = '<';
            toggleButton.style.right = '0';
        } else {
            // 打开面板
            sidePanel.style.right = '0px';
            toggleButton.innerHTML = '>';
            toggleButton.style.right = '420px';
        }



    }

    function updateStatus(message) {
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.style.display = message ? 'block' : 'none';
        }
        console.log(`[Status] ${message}`);
    }


    // --- 核心业务逻辑 (滚动导出) ---


    // --- 动态选择器修复逻辑 ---

    function startSelectorPickerFlow() {
        togglePanel(); // 关闭面板

        // 步骤 1: 选择用户消息容器
        showPickerOverlay("步骤 1/2: 请点击一条【用户提问】的文字气泡", (element) => {
            const selector = generateSelector(element);
            if (confirm(`检测到选择器: ${selector}\n\n是否应用此选择器?`)) {
                // 更新用户相关选择器
                // 假设用户点击的是 .query-text-line 或 .query-text p
                // 我们尝试推导容器和行/段落

                const queryText = element.closest(DEFAULT_SELECTORS.userText) || element;
                const userQuery = queryText.closest('user-query');

                let newSelectors = {};

                if (userQuery && queryText) {
                    // 如果能找到标准结构
                    newSelectors.userContainer = generateSelector(userQuery);
                    newSelectors.userText = generateSelector(queryText).replace(newSelectors.userContainer + ' ', '');
                } else {
                    // 无法完全匹配标准结构，仅更新 container fallback
                    newSelectors.userText = selector;
                }

                // 简化起见，我们主要更新 userText 和 userLine/Paragraph 如果点击的是特定行
                if (element.tagName === 'P' || element.classList.contains('query-text-line')) {
                    newSelectors.userParagraph = selector; // 作为主要文本选择器
                }

                saveSelectors(newSelectors);

                // 步骤 2: 选择模型回复
                setTimeout(() => {
                    showPickerOverlay("步骤 2/2: 请点击一条【模型回答】的文本区域", (elementModel) => {
                        const selectorModel = generateSelector(elementModel);
                        if (confirm(`检测到选择器: ${selectorModel}\n\n是否应用此选择器?`)) {
                            // 简单更新 markdown 选择器
                            saveSelectors({ modelMarkdown: selectorModel });
                            alert('选择器已更新! 请尝试重新导出。');
                            togglePanel();
                        }
                    });
                }, 500);
            }
        });
    }

    function showPickerOverlay(text, onPick) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.2); 
            z-index: 20000; 
            pointer-events: none; /* 关键：允许点击穿透 */
            display: flex; justify-content: center; padding-top: 100px;
        `;
        const banner = document.createElement('div');
        banner.style.cssText = `
            background: white; padding: 20px; border-radius: 8px; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); 
            pointer-events: auto; /* Banner 仍可交互(可选) */
            height: fit-content;
            color: #333;
        `;
        banner.textContent = text;
        overlay.appendChild(banner);
        document.body.appendChild(overlay);

        // 设置全局光标
        const originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';

        const highlighter = document.createElement('div');
        highlighter.style.cssText = `
            position: fixed; border: 2px solid #ef4444; background: rgba(239, 68, 68, 0.1);
            pointer-events: none; z-index: 19999; transition: all 0.1s;
        `;
        document.body.appendChild(highlighter);

        const moveHandler = (e) => {
            const target = e.target;
            if (target === overlay || target === banner || target === highlighter) return;
            const rect = target.getBoundingClientRect();
            highlighter.style.top = rect.top + 'px';
            highlighter.style.left = rect.left + 'px';
            highlighter.style.width = rect.width + 'px';
            highlighter.style.height = rect.height + 'px';
        };

        const clickHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const target = e.target;
            // 忽略 banner 的点击，但如果点击了 banner 不应该触发 onPick
            if (banner.contains(target)) return;

            // Cleanup
            document.body.removeChild(overlay);
            document.body.removeChild(highlighter);
            document.body.style.cursor = originalCursor; // 恢复光标
            document.removeEventListener('mousemove', moveHandler, true);
            document.removeEventListener('click', clickHandler, true);

            onPick(target);
        };

        document.addEventListener('mousemove', moveHandler, true);
        document.addEventListener('click', clickHandler, true);
    }

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
        console.log('Gemini Export: Updated selectors', SELECTORS);
    }

    // Canvas 内容提取和导出逻辑
    function extractCanvasContent() {
        console.log("开始提取 Canvas 内容...");
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

        console.log(`Canvas 内容提取完成，共找到 ${canvasData.length} 个内容块（已去重）`);
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
            let body = `Gemini Canvas 内容导出\n=========================================\n\n`;
            canvasData.forEach(item => {
                if (item.type === 'code') {
                    body += `--- 代码块 ${item.index} (${item.language}) ---\n${item.content}\n\n`;
                } else if (item.type === 'text') {
                    body += `--- 文本内容 ${item.index} ---\n${item.content}\n\n`;
                } else {
                    body += `--- 完整内容 ---\n${item.content}\n\n`;
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
            let md = `# ${projectName} Canvas 内容导出\n\n`;
            md += `导出时间：${ts}\n\n`;
            canvasData.forEach((item, idx) => {
                md += `## 内容块 ${idx + 1}\n\n`;
                if (item.type === 'code') {
                    md += `**代码块** (语言: ${item.language}):\n\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
                } else if (item.type === 'text') {
                    md += `**文本内容**:\n\n${escapeMd(item.content)}\n\n`;
                } else {
                    md += `**完整内容**:\n\n${escapeMd(item.content)}\n\n`;
                }
                md += `---\n\n`;
            });
            return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
        }
    }

    async function handleCanvasExtraction() {
        console.log("开始 Canvas 导出流程...");
        captureButtonCanvas.disabled = true;
        captureButtonCanvas.textContent = buttonTextCanvasProcessing;

        try {
            updateStatus('正在提取 Canvas 内容...');
            const canvasData = extractCanvasContent();

            if (canvasData.length === 0) {
                alert('未能找到任何 Canvas 内容，请确保页面上有代码块或文档内容。');
                captureButtonCanvas.textContent = `${errorTextCanvas}: 无内容`;
                captureButtonCanvas.classList.add('error');
            } else {
                updateStatus(`正在格式化 ${canvasData.length} 个内容块...`);
                const exportData = formatCanvasDataForExport(canvasData, 'export');

                // 创建下载
                const a = document.createElement('a');
                const url = URL.createObjectURL(exportData.blob);
                a.href = url;
                a.download = exportData.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                captureButtonCanvas.textContent = successTextCanvas;
                captureButtonCanvas.classList.add('success');
                updateStatus(`Canvas 导出成功: ${exportData.filename}`);
            }
        } catch (error) {
            console.error('Canvas 导出过程中发生错误:', error);
            updateStatus(`错误 (Canvas 导出): ${error.message}`);
            alert(`Canvas 导出过程中发生错误: ${error.message}`);
            captureButtonCanvas.textContent = `${errorTextCanvas}: 处理出错`;
            captureButtonCanvas.classList.add('error');
        } finally {
            // 3秒后重置按钮状态
            setTimeout(() => {
                captureButtonCanvas.textContent = buttonTextCanvasExport;
                captureButtonCanvas.disabled = false;
                captureButtonCanvas.classList.remove('success', 'error');
                updateStatus('');
            }, exportTimeout);
        }
    }

    // 组合导出功能：同时导出对话和Canvas内容
    async function handleCombinedExtraction() {
        console.log("开始组合导出流程...");
        captureButtonCombined.disabled = true;
        captureButtonCombined.textContent = buttonTextCombinedProcessing;

        try {
            // 第一步：提取Canvas内容
            updateStatus('步骤 1/3: 提取 Canvas 内容...');
            const canvasData = extractCanvasContent();

            // 第二步：滚动获取对话内容
            updateStatus('步骤 2/3: 开始滚动获取对话内容...');

            // 清空之前的数据
            collectedData.clear();
            isScrolling = true;
            scrollCount = 0;
            noChangeCounter = 0;

            // 显示停止按钮
            stopButtonScroll.style.display = 'block';
            stopButtonScroll.disabled = false;
            stopButtonScroll.textContent = buttonTextStopScroll;

            // 先滚动到顶部
            const scroller = getMainScrollerElement_AiStudio();
            if (scroller) {
                updateStatus('步骤 2/3: 滚动到顶部...');
                const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
                if (isWindowScroller) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    scroller.scrollTo({ top: 0, behavior: 'smooth' });
                }
                await delay(1500);
            }

            // 执行滚动导出
            const scrollSuccess = await autoScrollDown_AiStudio();
            if (scrollSuccess !== false) {
                updateStatus('步骤 2/3: 处理滚动数据...');
                await delay(500);
                extractDataIncremental_AiStudio();
                await delay(200);
            } else {
                throw new Error('滚动获取对话内容失败');
            }

            // 第三步：合并数据并导出
            updateStatus('步骤 3/3: 合并数据并生成文件...');

            // 获取滚动数据
            let scrollData = [];
            if (document.querySelector('#chat-history .conversation-container')) {
                const cs = document.querySelectorAll('#chat-history .conversation-container');
                cs.forEach(c => { if (collectedData.has(c)) scrollData.push(collectedData.get(c)); });
            } else {
                const turns = document.querySelectorAll('ms-chat-turn');
                turns.forEach(t => { if (collectedData.has(t)) scrollData.push(collectedData.get(t)); });
            }

            // 组合数据并导出
            const combinedData = formatCombinedDataForExport(scrollData, canvasData);

            // 创建下载
            const a = document.createElement('a');
            const url = URL.createObjectURL(combinedData.blob);
            a.href = url;
            a.download = combinedData.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            captureButtonCombined.textContent = successTextCombined;
            captureButtonCombined.classList.add('success');
            updateStatus(`组合导出成功: ${combinedData.filename}`);

        } catch (error) {
            console.error('组合导出过程中发生错误:', error);
            updateStatus(`错误 (组合导出): ${error.message}`);
            alert(`组合导出过程中发生错误: ${error.message}`);
            captureButtonCombined.textContent = `${errorTextCombined}: 处理出错`;
            captureButtonCombined.classList.add('error');
        } finally {
            // 隐藏停止按钮
            stopButtonScroll.style.display = 'none';
            isScrolling = false;

            // 3秒后重置按钮状态
            setTimeout(() => {
                captureButtonCombined.textContent = buttonTextCombinedExport;
                captureButtonCombined.disabled = false;
                captureButtonCombined.classList.remove('success', 'error');
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
            let body = `Gemini 组合导出 (对话 + Canvas)
=========================================

`;

            // 添加对话内容
            if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                body += `=== 对话内容 ===

`;
                deduplicatedScrollData.forEach(item => {
                    let block = '';
                    if (item.userText) block += `--- 用户 ---\n${item.userText}\n\n`;
                    if (item.thoughtText) block += `--- AI 思维链 ---\n${item.thoughtText}\n\n`;
                    if (item.responseText) block += `--- AI 回答 ---\n${item.responseText}\n\n`;
                    body += block.trim() + "\n\n------------------------------\n\n";
                });
            }

            // 添加Canvas内容
            if (canvasData && canvasData.length > 0) {
                body += `\n\n=== Canvas 内容 ===\n\n`;
                canvasData.forEach(item => {
                    if (item.type === 'code') {
                        body += `--- 代码块 ${item.index} (${item.language}) ---\n${item.content}\n\n`;
                    } else if (item.type === 'text') {
                        body += `--- 文本内容 ${item.index} ---\n${item.content}\n\n`;
                    } else {
                        body += `--- 完整内容 ---\n${item.content}\n\n`;
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
            let md = `# ${projectName} 组合导出

导出时间：${ts}

`;

            // 添加对话内容
            if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                md += `## 对话内容

`;
                deduplicatedScrollData.forEach((item, idx) => {
                    md += `### 回合 ${idx + 1}

`;
                    if (item.userText) md += `**用户**:

${escapeMd(item.userText)}

`;
                    if (item.thoughtText) md += `<details><summary>AI 思维链</summary>

${escapeMd(item.thoughtText)}

</details>

`;
                    if (item.responseText) md += `**AI 回答**:

${escapeMd(item.responseText)}

`;
                    md += `---

`;
                });
            }

            // 添加Canvas内容
            if (canvasData && canvasData.length > 0) {
                md += `## Canvas 内容

`;
                canvasData.forEach((item, idx) => {
                    md += `### 内容块 ${idx + 1}

`;
                    if (item.type === 'code') {
                        md += `**代码块** (语言: ${item.language}):

\`\`\`${item.language}
${item.content}
\`\`\`

`;
                    } else if (item.type === 'text') {
                        md += `**文本内容**:

${escapeMd(item.content)}

`;
                    } else {
                        md += `**完整内容**:

${escapeMd(item.content)}

`;
                    }
                    md += `---

`;
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
            console.warn("警告(滚动导出): 页面上存在聊天回合(ms-chat-turn)，但未能提取任何数据。CSS选择器可能已完全失效，请按F12检查并更新 extractDataIncremental_Gemini 函数中的选择器。");
            updateStatus(`警告: 无法从聊天记录中提取数据，请检查脚本！`);
        } else {
            updateStatus(`滚动 ${scrollCount}/${MAX_SCROLL_ATTEMPTS}... 已收集 ${collectedData.size} 条记录。`);
        }


        return newlyFoundCount > 0 || dataUpdatedInExistingTurn;
    }

    async function autoScrollDown_AiStudio() {
        console.log("启动自动滚动 (滚动导出)...");
        isScrolling = true; collectedData.clear(); scrollCount = 0; noChangeCounter = 0;
        const scroller = getMainScrollerElement_AiStudio();
        if (!scroller) {
            updateStatus('错误 (滚动): 找不到滚动区域');
            alert('未能找到聊天记录的滚动区域，无法自动滚动。请检查脚本中的选择器。');
            isScrolling = false; return false;
        }
        console.log('使用的滚动元素(滚动导出):', scroller);
        const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
        const getScrollTop = () => isWindowScroller ? window.scrollY : scroller.scrollTop;
        const getScrollHeight = () => isWindowScroller ? document.documentElement.scrollHeight : scroller.scrollHeight;
        const getClientHeight = () => isWindowScroller ? window.innerHeight : scroller.clientHeight;
        updateStatus(`开始增量滚动(最多 ${MAX_SCROLL_ATTEMPTS} 次)...`);
        let lastScrollHeight = -1;

        while (scrollCount < MAX_SCROLL_ATTEMPTS && isScrolling) {
            const currentScrollTop = getScrollTop(); const currentScrollHeight = getScrollHeight(); const currentClientHeight = getClientHeight();
            if (currentScrollHeight === lastScrollHeight) { noChangeCounter++; } else { noChangeCounter = 0; }
            lastScrollHeight = currentScrollHeight;
            if (noChangeCounter >= SCROLL_STABILITY_CHECKS && currentScrollTop + currentClientHeight >= currentScrollHeight - 20) {
                console.log("滚动条疑似触底(滚动导出)，停止滚动。");
                updateStatus(`滚动完成 (疑似触底)。`);
                break;
            }
            if (currentScrollTop === 0 && scrollCount > 10) {
                console.log("滚动条返回顶部(滚动导出)，停止滚动。");
                updateStatus(`滚动完成 (返回顶部)。`);
                break;
            }
            const targetScrollTop = currentScrollTop + (currentClientHeight * SCROLL_INCREMENT_FACTOR);
            if (isWindowScroller) { window.scrollTo({ top: targetScrollTop, behavior: 'smooth' }); } else { scroller.scrollTo({ top: targetScrollTop, behavior: 'smooth' }); }
            scrollCount++;
            updateStatus(`滚动 ${scrollCount}/${MAX_SCROLL_ATTEMPTS}... 等待 ${SCROLL_DELAY_MS}ms... (已收集 ${collectedData.size} 条记录。)`);
            await delay(SCROLL_DELAY_MS);
            // 使用统一调度：优先 Gemini 结构，其次 AI Studio
            try { extractDataIncremental_Dispatch(); } catch (e) { console.warn('调度提取失败，回退 AI Studio 提取', e); try { extractDataIncremental_AiStudio(); } catch (_) { } }
            if (!isScrolling) {
                console.log("检测到手动停止信号 (滚动导出)，退出滚动循环。"); break;
            }
        }

        if (!isScrolling && scrollCount < MAX_SCROLL_ATTEMPTS) {
            updateStatus(`滚动已手动停止 (已滚动 ${scrollCount} 次)。`);
        } else if (scrollCount >= MAX_SCROLL_ATTEMPTS) {
            updateStatus(`滚动停止: 已达到最大尝试次数 (${MAX_SCROLL_ATTEMPTS})。`);
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
            let header = context === 'scroll' ? 'Gemini 聊天记录 (滚动采集)' : 'Gemini 对话记录 (SDK 代码)';
            let body = `${header}\n=========================================\n\n`;
            deduplicatedData.forEach(item => {
                let block = '';
                if (item.userText) block += `--- 用户 ---\n${item.userText}\n\n`;
                if (item.thoughtText) block += `--- AI 思维链 ---\n${item.thoughtText}\n\n`;
                if (item.responseText) block += `--- AI 回答 ---\n${item.responseText}\n\n`;
                if (!block) {
                    block = '--- 回合 (内容提取不完整或失败) ---\n';
                    if (item.thoughtText) block += `思维链(可能不全): ${item.thoughtText}\n`;
                    if (item.responseText) block += `回答(可能不全): ${item.responseText}\n`;
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
            let md = `# ${projectName} 对话导出 (${context})\n\n`;
            md += `导出时间：${ts}\n\n`;
            deduplicatedData.forEach((item, idx) => {
                md += `## 回合 ${idx + 1}\n\n`;
                if (item.userText) md += `**用户**:\n\n${escapeMd(item.userText)}\n\n`;
                if (item.thoughtText) md += `<details><summary>AI 思维链</summary>\n\n${escapeMd(item.thoughtText)}\n\n</details>\n\n`;
                if (item.responseText) md += `**AI 回答**:\n\n${escapeMd(item.responseText)}\n\n`;
                md += `---\n\n`;
            });
            return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename: `${base}.md` };
        }
    }
    function formatAndTriggerDownloadScroll() { // 统一调度 Gemini/AI Studio
        updateStatus(`处理 ${collectedData.size} 条滚动记录并生成文件...`);
        let sorted = [];
        if (document.querySelector('#chat-history .conversation-container')) {
            const cs = document.querySelectorAll('#chat-history .conversation-container');
            cs.forEach(c => { if (collectedData.has(c)) sorted.push(collectedData.get(c)); });
        } else {
            const turns = document.querySelectorAll('ms-chat-turn');
            turns.forEach(t => { if (collectedData.has(t)) sorted.push(collectedData.get(t)); });
        }
        if (!sorted.length) {
            updateStatus('没有收集到任何有效滚动记录。');
            alert('滚动结束后未能收集到任何聊天记录，无法导出。');
            captureButtonScroll.textContent = buttonTextStartScroll; captureButtonScroll.disabled = false; captureButtonScroll.classList.remove('success', 'error'); updateStatus('');
            return;
        }
        try {
            const pack = formatAndExport(sorted, 'scroll');
            const a = document.createElement('a');
            const url = URL.createObjectURL(pack.blob);
            a.href = url; a.download = pack.filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            captureButtonScroll.textContent = successTextScroll; captureButtonScroll.classList.add('success');
        } catch (e) {
            console.error('滚动导出文件失败:', e);
            captureButtonScroll.textContent = `${errorTextScroll}: 创建失败`; captureButtonScroll.classList.add('error'); alert('创建滚动下载文件时出错: ' + e.message);
        }
        setTimeout(() => { captureButtonScroll.textContent = buttonTextStartScroll; captureButtonScroll.disabled = false; captureButtonScroll.classList.remove('success', 'error'); updateStatus(''); }, exportTimeout);
    }

    // TODO 2025-09-08: 后续可实现自动展开 Gemini 隐藏思维链（需要模拟点击“显示思路”按钮），当前以占位符标记
    // TODO 2025-09-08: Markdown 正式格式化尚未实现，当前仅输出占位头部，保持向后兼容

    async function handleScrollExtraction() {
        if (isScrolling) return;
        captureButtonScroll.disabled = true;
        captureButtonScroll.textContent = '滚动中..';
        stopButtonScroll.style.display = 'block';
        stopButtonScroll.disabled = false;
        stopButtonScroll.textContent = buttonTextStopScroll;

        // 在开始前先滚动到页面顶部
        const scroller = getMainScrollerElement_AiStudio();
        if (scroller) {
            updateStatus('正在滚动到顶部..');
            const isWindowScroller = (scroller === document.documentElement || scroller === document.body);
            if (isWindowScroller) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                scroller.scrollTo({ top: 0, behavior: 'smooth' });
            }
            await delay(1500); // 等待滚动动画完成
        }

        updateStatus('初始化滚动(滚动导出)...');

        try {
            const scrollSuccess = await autoScrollDown_AiStudio();
            if (scrollSuccess !== false) {
                captureButtonScroll.textContent = buttonTextProcessingScroll;
                updateStatus('滚动结束，准备最终处理..');
                await delay(500);
                extractDataIncremental_AiStudio();
                await delay(200);
                formatAndTriggerDownloadScroll();
            } else {
                captureButtonScroll.textContent = `${errorTextScroll}: 滚动失败`;
                captureButtonScroll.classList.add('error');
                setTimeout(() => {
                    captureButtonScroll.textContent = buttonTextStartScroll;
                    captureButtonScroll.disabled = false;
                    captureButtonScroll.classList.remove('error');
                    updateStatus('');
                }, exportTimeout);
            }
        } catch (error) {
            console.error('滚动处理过程中发生错误', error);
            updateStatus(`错误 (滚动导出): ${error.message}`);
            alert(`滚动处理过程中发生错误: ${error.message}`);
            captureButtonScroll.textContent = `${errorTextScroll}: 处理出错`;
            captureButtonScroll.classList.add('error');
            setTimeout(() => {
                captureButtonScroll.textContent = buttonTextStartScroll;
                captureButtonScroll.disabled = false;
                captureButtonScroll.classList.remove('error');
                updateStatus('');
            }, exportTimeout);
            isScrolling = false;
        } finally {
            stopButtonScroll.style.display = 'none';
            isScrolling = false;
        }
    }

    // --- 脚本初始化入口 ---
    console.log("Gemini_Chat_Export 导出脚本 (v1.0.7): 等待页面加载 (2.5秒)...");
    startThemeSync();
    setTimeout(createUI, 2500);

})();