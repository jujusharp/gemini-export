(function () {
    'use strict';

    function getPlatformConfig(options = {}) {
        const platforms = window.GeminiExportPlatforms;
        if (platforms && typeof platforms.resolvePlatform === 'function') {
            return platforms.resolvePlatform(options.platform || window.location);
        }
        return { id: 'generic', scroller: {}, messageSelectors: {} };
    }

    function containsChatMarkers(element, options = {}) {
        if (!element || typeof element.querySelector !== 'function') return false;
        const platform = getPlatformConfig(options);
        const selectorPool = [
            '#chat-history',
            '.chat-history-scroll-container',
            'chat-history',
            'infinite-scroller',
            '[data-test-id="chat-history-container"]',
            'user-query',
            'model-response',
            'ms-chat-turn',
            '.conversation-container',
            ...((platform.scroller && platform.scroller.messageNodeSelectors) || [])
        ].filter(Boolean);

        return Boolean(element.querySelector(selectorPool.join(', ')));
    }

    function isMapRelatedElement(element) {
        if (!element || typeof element.matches !== 'function') return false;
        if (element.matches('maps, .map, .gm-style, .gm-style-moc, .gm-style-cc, .gmnoprint')) return true;
        return Boolean(element.closest('maps, .gm-style, .gm-style-moc, .gm-style-cc, .gmnoprint'));
    }

    function isUsableScrollerElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (isMapRelatedElement(element)) return false;

        if (element === document.documentElement || element === document.body) {
            const root = document.scrollingElement || document.documentElement;
            return root.scrollHeight > root.clientHeight + 20;
        }

        let style;
        try {
            style = window.getComputedStyle(element);
        } catch (_) {
            return false;
        }

        if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
        if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) return false;
        if (element.scrollHeight <= element.clientHeight + 20) return false;

        const rect = element.getBoundingClientRect();
        if (!rect || rect.height < 120 || rect.width < 120) return false;

        return true;
    }

    function getScrollerCandidateScore(element, options = {}) {
        if (!isUsableScrollerElement(element)) return Number.NEGATIVE_INFINITY;

        let score = Math.max(0, element.scrollHeight - element.clientHeight);
        const rect = element.getBoundingClientRect();
        const markerBonus = containsChatMarkers(element, options) ? 5000 : 0;

        if (rect.height >= window.innerHeight * 0.5) score += 1400;
        if (rect.width >= window.innerWidth * 0.35) score += 400;
        if (markerBonus) score += markerBonus;

        if (element.matches('.chat-scrollable-container, .chat-history-scroll-container, chat-history-scroll-container, mat-sidenav-content, infinite-scroller, [data-test-id="chat-history-container"]')) {
            score += 1200;
        }

        if (element.id === 'chat-history' || element.closest('#chat-history')) {
            score += 700;
        }

        return score;
    }

    function findBestScrollerFromCandidates(candidates, strategyLabel, options = {}) {
        const unique = [];
        const seen = new Set();

        candidates.forEach((candidate) => {
            if (!candidate || seen.has(candidate)) return;
            seen.add(candidate);
            unique.push(candidate);
        });

        let bestElement = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        unique.forEach((candidate) => {
            const score = getScrollerCandidateScore(candidate, options);
            if (score > bestScore) {
                bestScore = score;
                bestElement = candidate;
            }
        });

        if (bestElement) {
            console.log(`找到滚动容器 (${strategyLabel}):`, bestElement);
            return bestElement;
        }

        return null;
    }

    function getMainScrollerElement(options = {}) {
        const platform = getPlatformConfig(options);
        console.log("尝试查找滚动容器 (用于滚动导出)...");

        const directCandidates = [];
        const directSelectors = (platform.scroller && platform.scroller.directSelectors) || [
            '.chat-scrollable-container',
            '.chat-history-scroll-container',
            'chat-history-scroll-container',
            'infinite-scroller',
            '[data-test-id="chat-history-container"]',
            '.chat-history',
            'mat-sidenav-content',
            '#chat-history',
            'chat-history',
            'main'
        ];

        directSelectors.forEach((selector) => {
            try {
                document.querySelectorAll(selector).forEach((el) => directCandidates.push(el));
            } catch (_) { }
        });

        let scroller = findBestScrollerFromCandidates(directCandidates, '策略 1: 常见容器', options);
        if (scroller) return scroller;

        const messageSelectorList = ((platform.scroller && platform.scroller.messageNodeSelectors) || [
            '#chat-history user-query',
            '#chat-history model-response',
            '#chat-history ms-chat-turn',
            '#chat-history .conversation-container',
            'user-query',
            'model-response',
            'ms-chat-turn'
        ]).filter(Boolean);

        const messageNodes = messageSelectorList.length
            ? Array.from(document.querySelectorAll(messageSelectorList.join(', '))).slice(0, 80)
            : [];

        if (messageNodes.length > 0) {
            const ancestorCandidates = [];
            messageNodes.forEach((node) => {
                let current = node;
                let depth = 0;
                while (current && depth < 14) {
                    ancestorCandidates.push(current);
                    current = current.parentElement;
                    depth++;
                }
            });

            scroller = findBestScrollerFromCandidates(ancestorCandidates, '策略 2: 消息节点向上查找', options);
            if (scroller) return scroller;
        }

        const broadCandidates = [];
        [
            '[class*="chat"]',
            '[class*="Chat"]',
            '[class*="history"]',
            '[class*="History"]',
            '[class*="conversation"]',
            '[class*="Conversation"]',
            '[class*="scroll"]',
            '[class*="Scrollable"]',
            '[data-test-id*="chat"]',
            '[data-test-id*="history"]',
            '[style*="overflow"]'
        ].forEach((selector) => {
            try {
                document.querySelectorAll(selector).forEach((el) => broadCandidates.push(el));
            } catch (_) { }
        });

        scroller = findBestScrollerFromCandidates(broadCandidates, '策略 3: 宽松扫描', options);
        if (scroller) return scroller;

        const rootCandidates = [document.scrollingElement, document.documentElement, document.body];
        scroller = findBestScrollerFromCandidates(rootCandidates, '策略 4: document 根容器', options);
        if (scroller) return scroller;

        console.warn("警告 (滚动导出): 未能精确定位聊天滚动容器，回退到 document.scrollingElement。如仍无法滚动，请提供当前会话 DOM 结构。");
        return document.scrollingElement || document.documentElement || document.body;
    }

    function getAnchorScrollHost(options = {}) {
        const platform = getPlatformConfig(options);
        const selectors = (platform.scroller && platform.scroller.anchorHostSelectors) || [];
        const scroller = selectors
            .map((selector) => {
                try {
                    return document.querySelector(selector);
                } catch (_) {
                    return null;
                }
            })
            .find(Boolean);

        if (scroller && scroller.scrollHeight > scroller.clientHeight) return scroller;
        return window;
    }

    window.GeminiExportScroller = {
        getMainScrollerElement,
        getAnchorScrollHost
    };
})();
