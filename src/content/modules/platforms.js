(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.GeminiExportPlatforms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PLATFORM_CONFIGS = {
        gemini: {
            id: 'gemini',
            label: 'Gemini',
            defaultProjectName: 'GeminiChat',
            genericTitles: ['Gemini', 'New chat'],
            capabilities: {
                canvas: true,
                thoughts: true
            },
            messageSelectors: {
                userContainer: 'user-query',
                modelContainer: 'model-response',
                userLine: '.query-text-line',
                userParagraph: '.query-text p',
                userText: '.query-text',
                modelContent: '.response-container-content, model-response',
                modelMarkdown: '.model-response-text .markdown',
                modelThoughts: 'model-thoughts',
                modelThoughtsBody: '.thoughts-body, .thoughts-content'
            },
            titleSelectors: [
                '.top-bar-actions .conversation-title',
                '.selected .conversation-title',
                'h1'
            ],
            scroller: {
                directSelectors: [
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
                ],
                anchorHostSelectors: [
                    '.chat-scrollable-container',
                    '.chat-history-scroll-container',
                    'chat-history-scroll-container',
                    'infinite-scroller',
                    '[data-test-id="chat-history-container"]',
                    'mat-sidenav-content'
                ],
                messageNodeSelectors: [
                    '#chat-history user-query',
                    '#chat-history model-response',
                    '#chat-history .conversation-container',
                    'user-query',
                    'model-response'
                ]
            }
        },
        aistudio: {
            id: 'aistudio',
            label: 'AI Studio',
            defaultProjectName: 'AIStudioChat',
            genericTitles: ['Google AI Studio', 'New chat'],
            capabilities: {
                canvas: false,
                thoughts: true
            },
            messageSelectors: {
                turn: 'ms-chat-turn'
            },
            titleSelectors: [
                'h1',
                'title'
            ],
            scroller: {
                directSelectors: [
                    'main',
                    'mat-sidenav-content',
                    '[class*="scroll"]'
                ],
                anchorHostSelectors: [
                    'mat-sidenav-content'
                ],
                messageNodeSelectors: [
                    'ms-chat-turn'
                ]
            }
        },
        chatgpt: {
            id: 'chatgpt',
            label: 'ChatGPT',
            defaultProjectName: 'ChatGPTChat',
            genericTitles: ['ChatGPT', 'New chat'],
            capabilities: {
                canvas: false,
                thoughts: false
            },
            messageSelectors: {
                turn: 'article [class*="group/turn-messages"]',
                userBubble: '.user-message-bubble-color',
                assistantText: '.assistant-content, .markdown, [class*="markdown"], .prose'
            },
            titleSelectors: [
                'title',
                'main h1',
                'nav h3',
                '[data-testid="conversation-title"]'
            ],
            scroller: {
                directSelectors: [
                    'main'
                ],
                anchorHostSelectors: [],
                messageNodeSelectors: [
                    'article [class*="group/turn-messages"]'
                ]
            }
        },
        generic: {
            id: 'generic',
            label: 'Chat',
            defaultProjectName: 'AIChat',
            genericTitles: ['Chat'],
            capabilities: {
                canvas: false,
                thoughts: false
            },
            messageSelectors: {},
            titleSelectors: ['h1', 'title'],
            scroller: {
                directSelectors: ['main'],
                anchorHostSelectors: [],
                messageNodeSelectors: []
            }
        }
    };

    function cloneConfig(config) {
        return JSON.parse(JSON.stringify(config));
    }

    function toUrlString(locationLike) {
        if (!locationLike) return '';
        if (typeof locationLike === 'string') return locationLike;
        if (typeof locationLike.href === 'string') return locationLike.href;
        return String(locationLike);
    }

    function detectPlatformIdFromLocation(locationLike) {
        const url = toUrlString(locationLike).toLowerCase();
        if (!url) return 'generic';
        if (url.includes('chatgpt.com/')) return 'chatgpt';
        if (url.includes('gemini.google.com/')) return 'gemini';
        if (url.includes('aistudio.google.com/')) return 'aistudio';
        return 'generic';
    }

    function getPlatformConfig(platformId) {
        return cloneConfig(PLATFORM_CONFIGS[platformId] || PLATFORM_CONFIGS.generic);
    }

    function detectPlatformFromLocation(locationLike) {
        return getPlatformConfig(detectPlatformIdFromLocation(locationLike));
    }

    function resolvePlatform(input) {
        if (!input) {
            return detectPlatformFromLocation(root.location);
        }
        if (typeof input === 'string') {
            if (PLATFORM_CONFIGS[input]) return getPlatformConfig(input);
            return detectPlatformFromLocation(input);
        }
        if (input.id && PLATFORM_CONFIGS[input.id]) {
            return {
                ...getPlatformConfig(input.id),
                ...input
            };
        }
        return detectPlatformFromLocation(input);
    }

    return {
        PLATFORM_CONFIGS: cloneConfig(PLATFORM_CONFIGS),
        detectPlatformFromLocation,
        detectPlatformIdFromLocation,
        getPlatformConfig,
        resolvePlatform
    };
});
