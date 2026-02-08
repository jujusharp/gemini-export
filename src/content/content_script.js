(function () {
    'use strict';

    // Added for Chrome Extension compatibility
    const GM_addStyle = (css) => {
        const style = document.createElement('style');
        style.innerText = css;
        document.head.appendChild(style);
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

    window.GeminiExportBootstrap?.setupTrustedTypes?.();

    // --- HTML to Markdown 转换 ---
    let markdownConverter = null;

    function getMarkdownConverter() {
        if (markdownConverter) return markdownConverter;

        const factory = window.GeminiExportMarkdown?.createMarkdownConverter;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: markdown converter module not loaded.');
            return null;
        }

        markdownConverter = factory();
        return markdownConverter;
    }

    function cleanupMarkdown(text) {
        const converter = getMarkdownConverter();
        if (converter && typeof converter.cleanupMarkdown === 'function') {
            return converter.cleanupMarkdown(text);
        }
        if (!text) return '';
        return String(text).trim();
    }

    function htmlToMarkdown(element) {
        if (!element) return '';

        const converter = getMarkdownConverter();
        if (converter && typeof converter.htmlToMarkdown === 'function') {
            return converter.htmlToMarkdown(element);
        }

        return cleanupMarkdown(element.innerText?.trim() || '');
    }

    // --- Language & Translations ---
    const t = window.GeminiExportI18n?.getTranslations
        ? window.GeminiExportI18n.getTranslations({ language: navigator.language })
        : {};

    const exportTimeout = 3000;
    const SCROLL_DELAY_MS = 1000;
    const MAX_SCROLL_ATTEMPTS = 300;
    const SCROLL_INCREMENT_FACTOR = 0.85;
    const SCROLL_STABILITY_CHECKS = 3;

    if (!window.__GEMINI_EXPORT_FORMAT) { window.__GEMINI_EXPORT_FORMAT = 'md'; }

    // --- 动态选择器配置 ---
    const DEFAULT_SELECTORS = {
        userContainer: 'user-query',
        modelContainer: 'model-response',
        userLine: '.query-text-line',
        userParagraph: '.query-text p',
        userText: '.query-text',
        modelContent: '.response-container-content, model-response',
        modelMarkdown: '.model-response-text .markdown',
        modelThoughts: 'model-thoughts',
        modelThoughtsBody: '.thoughts-body, .thoughts-content'
    };

    const loadSelectorConfig = window.GeminiExportBootstrap?.loadSelectorConfig;
    let SELECTORS = typeof loadSelectorConfig === 'function'
        ? loadSelectorConfig(DEFAULT_SELECTORS, {
            storageKey: 'gemini_export_selectors',
            loadedLog: 'Gemini Export: 已加载自定义选择器',
            failedLog: 'Gemini Export: 加载自定义选择器失败'
        })
        : { ...DEFAULT_SELECTORS };

    // --- 脚本内部状态变量 ---
    let isScrolling = false;
    let collectedData = new Map();
    let scrollCount = 0;
    let noChangeCounter = 0;

    // --- UI 界面元素变量 ---
    let uiController = null;
    let anchorPanelController = null;
    let imageExporter = null;
    let exportPipeline = null;
    let exportHandlers = null;
    let exportDispatcher = null;
    let scrollEngine = null;
    let themeSyncController = null;

    // Previous panel vars removed

    // --- 辅助工具函数 ---
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function startThemeSync() {
        if (!themeSyncController) {
            const factory = window.GeminiExportThemeSync?.createThemeSyncController;
            if (typeof factory !== 'function') {
                console.warn('Gemini Export: theme sync module not loaded.');
                return;
            }
            themeSyncController = factory();
        }

        if (typeof themeSyncController.startThemeSync === 'function') {
            themeSyncController.startThemeSync();
        }
    }

    function getCurrentTimestamp() {
        const getter = window.GeminiExportProjectUtils?.getCurrentTimestamp;
        if (typeof getter === 'function') {
            return getter();
        }
        return new Date().toISOString().replace(/[:.]/g, '-');
    }

    /**
     * 用于从页面获取项目名称
     * @returns {string} - 清理后的项目名称，或一个默认名称
     */
    function getProjectName() {
        const getter = window.GeminiExportProjectUtils?.getProjectName;
        if (typeof getter === 'function') {
            return getter();
        }
        return 'GeminiChat';
    }


    function getMainScrollerElement() {
        const resolver = window.GeminiExportScroller?.getMainScrollerElement;
        if (typeof resolver === 'function') {
            return resolver();
        }
        console.warn('Gemini Export: scroller module not loaded, fallback to document root scroller.');
        return document.scrollingElement || document.documentElement || document.body;
    }

    function extractDataIncremental_Gemini() {
        const extractor = window.GeminiExportConversationExtractor;
        if (!extractor || typeof extractor.extractDataIncrementalGemini !== 'function') {
            console.warn('Gemini Export: conversation extractor module not loaded.');
            return false;
        }

        return extractor.extractDataIncrementalGemini({
            collectedData,
            selectors: SELECTORS,
            updateStatus,
            scrollCount,
            maxScrollAttempts: MAX_SCROLL_ATTEMPTS
        });
    }

    function extractDataIncremental_Dispatch() {
        const extractor = window.GeminiExportConversationExtractor;
        if (!extractor || typeof extractor.extractDataIncrementalDispatch !== 'function') {
            if (document.querySelector('#chat-history .conversation-container')) return extractDataIncremental_Gemini();
            return extractDataIncremental_AiStudio();
        }

        return extractor.extractDataIncrementalDispatch({
            collectedData,
            selectors: SELECTORS,
            updateStatus,
            scrollCount,
            maxScrollAttempts: MAX_SCROLL_ATTEMPTS,
            t
        });
    }

    function togglePanel() {
        if (!anchorPanelController) {
            startAnchorSync();
        }
        if (anchorPanelController && typeof anchorPanelController.togglePanel === 'function') {
            anchorPanelController.togglePanel();
        }
    }

    function startAnchorSync() {
        if (anchorPanelController) {
            anchorPanelController.start();
            return;
        }

        const factory = window.GeminiExportAnchorPanel?.createAnchorPanelController;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: anchor panel module not loaded.');
            return;
        }

        anchorPanelController = factory({
            t,
            cleanupMarkdown,
            GM_addStyle,
            getSelectors: () => SELECTORS,
            getScrollHost: () => {
                const hostGetter = window.GeminiExportScroller?.getAnchorScrollHost;
                if (typeof hostGetter === 'function') {
                    return hostGetter();
                }
                const fallbackScroller = getMainScrollerElement();
                if (!fallbackScroller || fallbackScroller === document.documentElement || fallbackScroller === document.body || fallbackScroller === document.scrollingElement) {
                    return window;
                }
                return fallbackScroller;
            }
        });
        anchorPanelController.start();
    }

    function getUiController() {
        if (uiController) return uiController;

        const factory = window.GeminiExportUiController?.createUiController;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: UI controller module not loaded.');
            return null;
        }

        uiController = factory({
            t,
            onExportClick: handleExportClick,
            onReady: startAnchorSync
        });

        return uiController;
    }

    function getExportButton() {
        const controller = getUiController();
        if (!controller || typeof controller.getExportButton !== 'function') {
            return null;
        }
        return controller.getExportButton();
    }



    // --- UI 界面创建与更新 ---
    function createUI() {
        const controller = getUiController();
        if (!controller || typeof controller.init !== 'function') {
            console.warn('Gemini Export: failed to initialize UI controller.');
            return;
        }
        controller.init();
    }

    async function handleExportClick() {
        const dispatcher = getExportDispatcher();
        if (!dispatcher || typeof dispatcher.handleExportClick !== 'function') {
            console.warn('Gemini Export: export dispatcher module not loaded.');
            return;
        }
        await dispatcher.handleExportClick();
    }




    function updateStatus(message) {
        const controller = getUiController();
        if (controller && typeof controller.updateStatus === 'function') {
            controller.updateStatus(message);
            return;
        }
        console.log(`[Status] ${message}`);
    }

    function getImageExporter() {
        if (imageExporter) return imageExporter;

        const factory = window.GeminiExportImageExporter?.createImageExporter;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: image exporter module not loaded.');
            return null;
        }

        imageExporter = factory({
            cleanupMarkdown,
            updateStatus,
            getCurrentTimestamp,
            t
        });

        return imageExporter;
    }

    function getExportPipeline() {
        if (exportPipeline) return exportPipeline;

        const factory = window.GeminiExportPipeline?.createExportPipeline;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: export pipeline module not loaded.');
            return null;
        }

        exportPipeline = factory({
            t,
            htmlToMarkdown,
            getProjectName,
            getCurrentTimestamp,
            getExportMode: () => (window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase()
        });

        return exportPipeline;
    }

    function collectScrollDataForExport() {
        const pipeline = getExportPipeline();
        if (pipeline && typeof pipeline.collectSortedData === 'function') {
            return pipeline.collectSortedData(collectedData);
        }

        const sorted = [];
        if (document.querySelector('#chat-history .conversation-container')) {
            const cs = document.querySelectorAll('#chat-history .conversation-container');
            cs.forEach((c) => { if (collectedData.has(c)) sorted.push(collectedData.get(c)); });
        } else {
            const turns = document.querySelectorAll('ms-chat-turn');
            turns.forEach((turn) => { if (collectedData.has(turn)) sorted.push(collectedData.get(turn)); });
        }
        return sorted;
    }

    function getExportDispatcher() {
        if (exportDispatcher) return exportDispatcher;

        const factory = window.GeminiExportDispatcher?.createExportDispatcher;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: export dispatcher module not loaded.');
            return null;
        }

        exportDispatcher = factory({
            t,
            getIsScrolling: () => isScrolling,
            setIsScrolling: (value) => { isScrolling = Boolean(value); },
            getExportButton,
            updateStatus,
            onDialog: handleScrollExtraction,
            onCanvas: handleCanvasExtraction,
            onBoth: handleCombinedExtraction
        });

        return exportDispatcher;
    }

    function getScrollEngine() {
        if (scrollEngine) return scrollEngine;

        const factory = window.GeminiExportScrollEngine?.createScrollEngine;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: scroll engine module not loaded.');
            return null;
        }

        scrollEngine = factory({
            t,
            maxScrollAttempts: MAX_SCROLL_ATTEMPTS,
            scrollDelayMs: SCROLL_DELAY_MS,
            scrollIncrementFactor: SCROLL_INCREMENT_FACTOR,
            scrollStabilityChecks: SCROLL_STABILITY_CHECKS,
            delay,
            getMainScrollerElement,
            updateStatus,
            extractDataIncrementalDispatch: extractDataIncremental_Dispatch,
            extractDataIncrementalAiStudio: extractDataIncremental_AiStudio,
            alertFn: (message) => alert(message),
            getIsScrolling: () => isScrolling,
            setIsScrolling: (value) => { isScrolling = Boolean(value); },
            resetCollectionAndCounters: () => {
                collectedData.clear();
                scrollCount = 0;
                noChangeCounter = 0;
            },
            getScrollCount: () => scrollCount,
            setScrollCount: (value) => { scrollCount = Number(value) || 0; },
            getNoChangeCounter: () => noChangeCounter,
            setNoChangeCounter: (value) => { noChangeCounter = Number(value) || 0; },
            getCollectedSize: () => collectedData.size
        });

        return scrollEngine;
    }

    function getExportHandlers() {
        if (exportHandlers) return exportHandlers;

        const factory = window.GeminiExportHandlers?.createExportHandlers;
        if (typeof factory !== 'function') {
            console.warn('Gemini Export: export handlers module not loaded.');
            return null;
        }

        exportHandlers = factory({
            t,
            exportTimeout,
            getExportButton,
            updateStatus,
            delay,
            getProjectName,
            extractCanvasContent,
            formatCanvasDataForExport,
            triggerExportDownload,
            exportGeneratedImages,
            getMainScrollerElement,
            getIsScrolling: () => isScrolling,
            setIsScrolling: (value) => { isScrolling = Boolean(value); },
            clearScrollCollection: () => { collectedData.clear(); },
            resetScrollCounters: () => {
                scrollCount = 0;
                noChangeCounter = 0;
            },
            autoScrollDown: autoScrollDown_AiStudio,
            extractDataIncrementalAiStudio: extractDataIncremental_AiStudio,
            collectScrollData: collectScrollDataForExport,
            formatCombinedDataForExport,
            formatAndExport,
            getCollectedDataSize: () => collectedData.size,
            alertFn: (message) => alert(message)
        });

        return exportHandlers;
    }

    async function exportGeneratedImages(projectName) {
        const exporter = getImageExporter();
        if (!exporter || typeof exporter.exportGeneratedImages !== 'function') {
            return { downloaded: 0, failed: 0, total: 0 };
        }
        return exporter.exportGeneratedImages(projectName);
    }


    // --- 核心业务逻辑 (滚动导出) ---


    // --- 动态选择器修复逻辑 ---


    // Canvas 内容提取和导出逻辑
    function extractCanvasContent() {
        const pipeline = getExportPipeline();
        if (!pipeline || typeof pipeline.extractCanvasContent !== 'function') {
            console.warn('Gemini Export: export pipeline unavailable, skip canvas extraction.');
            return [];
        }
        return pipeline.extractCanvasContent();
    }

    function formatCanvasDataForExport(canvasData, context) {
        const pipeline = getExportPipeline();
        if (!pipeline || typeof pipeline.formatCanvasDataForExport !== 'function') {
            const fallback = {
                exportType: 'canvas',
                timestamp: getCurrentTimestamp(),
                projectName: getProjectName(),
                content: canvasData || []
            };
            return {
                blob: new Blob([JSON.stringify(fallback, null, 2)], { type: 'application/json;charset=utf-8' }),
                filename: `${getProjectName()}.json`
            };
        }
        return pipeline.formatCanvasDataForExport(canvasData, context);
    }

    function triggerExportDownload(pack) {
        const pipeline = getExportPipeline();
        if (pipeline && typeof pipeline.triggerBlobDownload === 'function') {
            pipeline.triggerBlobDownload(pack);
            return;
        }

        const a = document.createElement('a');
        const url = URL.createObjectURL(pack.blob);
        a.href = url;
        a.download = pack.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function handleCanvasExtraction() {
        const handlers = getExportHandlers();
        if (!handlers || typeof handlers.handleCanvasExtraction !== 'function') {
            console.warn('Gemini Export: canvas export handler unavailable.');
            return;
        }
        await handlers.handleCanvasExtraction();
    }

    // 组合导出功能：同时导出对话和Canvas内容
    async function handleCombinedExtraction() {
        const handlers = getExportHandlers();
        if (!handlers || typeof handlers.handleCombinedExtraction !== 'function') {
            console.warn('Gemini Export: combined export handler unavailable.');
            return;
        }
        await handlers.handleCombinedExtraction();
    }

    // 组合数据格式化和导出函数
    function formatCombinedDataForExport(scrollData, canvasData) {
        const pipeline = getExportPipeline();
        if (!pipeline || typeof pipeline.formatCombinedDataForExport !== 'function') {
            const fallback = {
                exportType: 'combined',
                timestamp: getCurrentTimestamp(),
                projectName: getProjectName(),
                dialogue: scrollData || [],
                canvas: canvasData || []
            };
            return {
                blob: new Blob([JSON.stringify(fallback, null, 2)], { type: 'application/json;charset=utf-8' }),
                filename: `${getProjectName()}.json`
            };
        }
        return pipeline.formatCombinedDataForExport(scrollData, canvasData);
    }
    function extractDataIncremental_AiStudio() {
        const extractor = window.GeminiExportConversationExtractor;
        if (!extractor || typeof extractor.extractDataIncrementalAiStudio !== 'function') {
            console.warn('Gemini Export: conversation extractor module not loaded.');
            return false;
        }

        return extractor.extractDataIncrementalAiStudio({
            collectedData,
            updateStatus,
            scrollCount,
            maxScrollAttempts: MAX_SCROLL_ATTEMPTS,
            t
        });
    }

    async function autoScrollDown_AiStudio() {
        const engine = getScrollEngine();
        if (!engine || typeof engine.autoScrollDown !== 'function') {
            console.warn('Gemini Export: auto scroll engine unavailable.');
            return false;
        }
        return engine.autoScrollDown();
    }

    function formatAndExport(sortedData, context) { // 多格式骨架
        const pipeline = getExportPipeline();
        if (!pipeline || typeof pipeline.formatScrollDataForExport !== 'function') {
            const fallback = sortedData || [];
            return {
                blob: new Blob([JSON.stringify(fallback, null, 2)], { type: 'application/json;charset=utf-8' }),
                filename: `${getProjectName()}.json`
            };
        }
        return pipeline.formatScrollDataForExport(sortedData, context);
    }
    async function formatAndTriggerDownloadScroll() {
        const handlers = getExportHandlers();
        if (!handlers || typeof handlers.formatAndTriggerDownloadScroll !== 'function') {
            console.warn('Gemini Export: scroll export download handler unavailable.');
            return;
        }
        await handlers.formatAndTriggerDownloadScroll();
    }

    // TODO 2025-09-08: 后续可实现自动展开 Gemini 隐藏思维链（需要模拟点击“显示思路”按钮），当前以占位符标记
    // TODO 2025-09-08: Markdown 正式格式化尚未实现，当前仅输出占位头部，保持向后兼容

    async function handleScrollExtraction() {
        const handlers = getExportHandlers();
        if (!handlers || typeof handlers.handleScrollExtraction !== 'function') {
            console.warn('Gemini Export: scroll extraction handler unavailable.');
            return;
        }
        await handlers.handleScrollExtraction();
    }

    // --- 脚本初始化入口 ---
    console.log("Gemini_Chat_Export 导出脚本 (v1.0.7): 等待页面加载 (2.5秒)...");
    startThemeSync();
    setTimeout(createUI, 2500);

})();
