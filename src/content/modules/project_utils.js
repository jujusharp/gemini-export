(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.GeminiExportProjectUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    function getPlatformsApi() {
        if (root.GeminiExportPlatforms) return root.GeminiExportPlatforms;
        if (typeof require === 'function') {
            try {
                return require('./platforms.js');
            } catch (_) { }
        }
        return null;
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

    function resolvePlatform(options = {}) {
        const platforms = getPlatformsApi();
        if (platforms && typeof platforms.resolvePlatform === 'function') {
            return platforms.resolvePlatform(options.platform || options.document?.location || root.location);
        }
        return { id: 'generic', label: 'Chat', defaultProjectName: 'AIChat', genericTitles: [] };
    }

    function getNodeText(node) {
        if (!node) return '';
        return String(node.innerText || node.textContent || '').trim();
    }

    function sanitizeProjectName(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[\\/:\*\?"<>\|]/g, '_');
    }

    function normalizeTitleText(text) {
        return sanitizeProjectName(
            String(text || '')
                .replace(/\s*-\s*ChatGPT$/i, '')
                .replace(/\s*-\s*Gemini$/i, '')
                .replace(/\s*-\s*Google AI Studio$/i, '')
        );
    }

    function isGenericTitle(text, platform) {
        const normalized = String(text || '').trim();
        const genericTitles = new Set([...(platform.genericTitles || []), 'Untitled']);
        return !normalized || genericTitles.has(normalized);
    }

    function queryFirst(doc, selectors = []) {
        for (const selector of selectors) {
            if (!selector) continue;
            if (selector === 'title') {
                if (doc.title) return { textContent: doc.title };
                continue;
            }
            try {
                const node = doc.querySelector(selector);
                if (node) return node;
            } catch (_) { }
        }
        return null;
    }

    function getFirstUserText(doc, platform, selectors) {
        const candidates = [];

        if (platform.id === 'chatgpt') {
            const turnSelector = selectors.turn || 'article [class*="group/turn-messages"]';
            const userBubble = selectors.userBubble || '.user-message-bubble-color';
            candidates.push(`${turnSelector} ${userBubble}`, userBubble);
        } else if (platform.id === 'gemini') {
            const userContainer = selectors.userContainer || 'user-query';
            const userText = selectors.userText || '.query-text';
            const userLine = selectors.userLine || '.query-text-line';
            const userParagraph = selectors.userParagraph || '.query-text p';
            candidates.push(
                `#chat-history ${userContainer} ${userText}`,
                `#chat-history ${userContainer} ${userLine}`,
                `#chat-history ${userContainer} ${userParagraph}`
            );
        } else {
            candidates.push(
                'ms-chat-turn .chat-turn-container.user .turn-content ms-cmark-node',
                'ms-chat-turn .chat-turn-container.user .turn-content'
            );
        }

        const node = queryFirst(doc, candidates);
        return sanitizeProjectName(getNodeText(node));
    }

    function getProjectName(options = {}) {
        const doc = options.document || root.document;
        if (!doc) return 'AIChat';

        const platform = resolvePlatform(options);
        const selectors = {
            ...((platform && platform.messageSelectors) || {}),
            ...(options.selectors || {})
        };

        try {
            const titleNode = queryFirst(doc, platform.titleSelectors || []);
            const titleText = normalizeTitleText(getNodeText(titleNode));
            if (!isGenericTitle(titleText, platform)) {
                return titleText;
            }

            const firstUserText = getFirstUserText(doc, platform, selectors);
            if (firstUserText) {
                return `${platform.label}_${firstUserText.slice(0, 24)}`;
            }
        } catch (error) {
            console.warn('Chat export: 项目名提取失败，回退默认值', error);
        }

        const documentTitle = normalizeTitleText(doc.title || '');
        if (!isGenericTitle(documentTitle, platform)) {
            return documentTitle;
        }

        return platform.defaultProjectName || 'AIChat';
    }

    return {
        getCurrentTimestamp,
        getProjectName,
        sanitizeProjectName
    };
});
