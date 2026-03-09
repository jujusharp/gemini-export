(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.GeminiExportConversationExtractor = api;
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

    function resolveDocument(options = {}) {
        return options.document || root.document;
    }

    function resolvePlatform(options = {}) {
        const platforms = getPlatformsApi();
        if (platforms && typeof platforms.resolvePlatform === 'function') {
            return platforms.resolvePlatform(options.platform || options.location || resolveDocument(options)?.location || root.location);
        }
        return { id: 'generic', messageSelectors: {} };
    }

    function getNodeText(node) {
        if (!node) return '';
        return String(node.innerText || node.textContent || '').trim();
    }

    function normalizeText(value) {
        return String(value || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function createTurnInfo(index) {
        return {
            domOrder: index,
            type: 'unknown',
            userText: null,
            thoughtText: null,
            responseText: null
        };
    }

    function updateTurnType(info) {
        if (info.userText && info.responseText && info.thoughtText) info.type = 'model_thought_reply';
        else if (info.userText && info.responseText) info.type = 'model_reply';
        else if (info.userText) info.type = 'user';
        else if (info.responseText && info.thoughtText) info.type = 'model_thought_reply';
        else if (info.responseText) info.type = 'model_reply';
        else if (info.thoughtText) info.type = 'model_thought';
        return info;
    }

    function buildStatusText(options, collectedSize) {
        const updateStatus = typeof options.updateStatus === 'function' ? options.updateStatus : null;
        if (!updateStatus) return;
        const scrollCount = Number(options.scrollCount || 0);
        const maxScrollAttempts = Number(options.maxScrollAttempts || 0);
        const t = options.t || {};
        const statusText = typeof t.statusScrolling === 'function'
            ? t.statusScrolling(scrollCount, maxScrollAttempts, collectedSize)
            : `Scrolling ${scrollCount}/${maxScrollAttempts}... Collected ${collectedSize} items...`;
        updateStatus(statusText);
    }

    function extractDataIncrementalGemini(options = {}) {
        const doc = resolveDocument(options);
        const collectedData = options.collectedData;
        if (!doc || !collectedData || typeof collectedData.get !== 'function' || typeof collectedData.set !== 'function') {
            return false;
        }

        const selectors = options.selectors || {};
        const userContainer = selectors.userContainer || 'user-query';
        const userLine = selectors.userLine || '.query-text-line';
        const userParagraph = selectors.userParagraph || '.query-text p';
        const userText = selectors.userText || '.query-text';
        const modelContent = selectors.modelContent || '.response-container-content, model-response';
        const modelMarkdown = selectors.modelMarkdown || '.model-response-text .markdown';
        const modelThoughts = selectors.modelThoughts || 'model-thoughts';
        const modelThoughtsBody = selectors.modelThoughtsBody || '.thoughts-body, .thoughts-content';

        let newly = 0;
        let updated = false;
        const nodes = doc.querySelectorAll('#chat-history .conversation-container');
        const seenUserTexts = new Set();

        nodes.forEach((container, idx) => {
            const info = collectedData.get(container) || createTurnInfo(idx);
            let changed = false;

            if (!collectedData.has(container)) {
                collectedData.set(container, info);
                newly++;
            }

            if (!info.userText) {
                let userTexts = [];
                const textLines = Array.from(container.querySelectorAll(`${userContainer} ${userLine}`));

                if (textLines.length > 0) {
                    userTexts = textLines.map((el) => normalizeText(getNodeText(el)));
                } else {
                    const paragraphs = Array.from(container.querySelectorAll(`${userContainer} ${userParagraph}`));
                    if (paragraphs.length > 0) {
                        userTexts = paragraphs.map((el) => normalizeText(getNodeText(el)));
                    } else {
                        const userContainerNode = container.querySelector(`${userContainer} ${userText}`);
                        if (userContainerNode) {
                            userTexts = [normalizeText(getNodeText(userContainerNode))];
                        }
                    }
                }

                userTexts = userTexts.filter(Boolean);
                if (userTexts.length > 0) {
                    const combinedUserText = normalizeText(userTexts.join('\n'));
                    if (!seenUserTexts.has(combinedUserText)) {
                        seenUserTexts.add(combinedUserText);
                        info.userText = combinedUserText;
                        changed = true;
                    }
                }
            }

            const modelRoot = container.querySelector(modelContent);
            if (modelRoot) {
                if (!info.responseText) {
                    const markdownNode = modelRoot.querySelector(modelMarkdown);
                    const responseText = normalizeText(getNodeText(markdownNode));
                    if (responseText) {
                        info.responseText = responseText;
                        info.responseHtml = markdownNode;
                        changed = true;
                    }
                }

                if (!info.thoughtText) {
                    const thoughts = modelRoot.querySelector(modelThoughts);
                    if (thoughts) {
                        const body = thoughts.querySelector(modelThoughtsBody);
                        const thoughtText = normalizeText(getNodeText(body));
                        if (thoughtText && !/显示思路/.test(thoughtText)) {
                            info.thoughtText = thoughtText;
                        } else {
                            info.thoughtText = '(思维链未展开)';
                        }
                        changed = true;
                    }
                }
            }

            if (changed) {
                updateTurnType(info);
                collectedData.set(container, info);
                updated = true;
            }
        });

        buildStatusText(options, collectedData.size);
        return newly > 0 || updated;
    }

    function extractDataIncrementalAiStudio(options = {}) {
        const doc = resolveDocument(options);
        const collectedData = options.collectedData;
        if (!doc || !collectedData || typeof collectedData.get !== 'function' || typeof collectedData.set !== 'function') {
            return false;
        }

        const updateStatus = typeof options.updateStatus === 'function' ? options.updateStatus : () => { };
        const t = options.t || {};

        let newlyFoundCount = 0;
        let dataUpdatedInExistingTurn = false;
        const currentTurns = doc.querySelectorAll('ms-chat-turn');
        const seenUserTexts = new Set();

        currentTurns.forEach((turn, index) => {
            const turnContainer = turn.querySelector('.chat-turn-container.user, .chat-turn-container.model');
            if (!turnContainer) return;

            const extractedInfo = collectedData.get(turn) || createTurnInfo(index);
            if (!collectedData.has(turn)) {
                collectedData.set(turn, extractedInfo);
                newlyFoundCount++;
            }

            let dataWasUpdatedThisTime = false;

            if (turnContainer.classList.contains('user')) {
                if (!extractedInfo.userText) {
                    const userNode = turn.querySelector('.turn-content ms-cmark-node');
                    const userText = normalizeText(getNodeText(userNode));
                    if (userText && !seenUserTexts.has(userText)) {
                        seenUserTexts.add(userText);
                        extractedInfo.userText = userText;
                        dataWasUpdatedThisTime = true;
                    }
                }
            } else if (turnContainer.classList.contains('model')) {
                if (!extractedInfo.thoughtText) {
                    const thoughtNode = turn.querySelector('.thought-container .mat-expansion-panel-body');
                    const thoughtText = normalizeText(getNodeText(thoughtNode));
                    if (thoughtText && thoughtText.toLowerCase() !== 'thinking process:') {
                        extractedInfo.thoughtText = thoughtText;
                        dataWasUpdatedThisTime = true;
                    }
                }

                if (!extractedInfo.responseText) {
                    const responseChunks = Array.from(turn.querySelectorAll('.turn-content > ms-prompt-chunk'));
                    const responseElements = responseChunks
                        .filter((chunk) => !chunk.querySelector('.thought-container'))
                        .map((chunk) => chunk.querySelector('ms-cmark-node') || chunk)
                        .filter((el) => normalizeText(getNodeText(el)));

                    const responseTexts = responseElements.map((el) => normalizeText(getNodeText(el))).filter(Boolean);
                    if (responseTexts.length > 0) {
                        extractedInfo.responseText = responseTexts.join('\n\n');
                        extractedInfo.responseHtmlElements = responseElements;
                        dataWasUpdatedThisTime = true;
                    } else if (!extractedInfo.thoughtText) {
                        const turnContent = turn.querySelector('.turn-content');
                        const responseText = normalizeText(getNodeText(turnContent));
                        if (responseText) {
                            extractedInfo.responseText = responseText;
                            extractedInfo.responseHtmlElements = [turnContent];
                            dataWasUpdatedThisTime = true;
                        }
                    }
                }
            }

            if (dataWasUpdatedThisTime) {
                updateTurnType(extractedInfo);
                collectedData.set(turn, extractedInfo);
                dataUpdatedInExistingTurn = true;
            }
        });

        if (currentTurns.length > 0 && collectedData.size === 0) {
            const warningText = t.statusWarnNoData || 'Warning: Turns found but no data extracted. Check selectors.';
            console.warn(warningText);
            updateStatus(warningText);
        } else {
            buildStatusText(options, collectedData.size);
        }

        return newlyFoundCount > 0 || dataUpdatedInExistingTurn;
    }

    function extractDataIncrementalChatGpt(options = {}) {
        const doc = resolveDocument(options);
        const collectedData = options.collectedData;
        if (!doc || !collectedData || typeof collectedData.get !== 'function' || typeof collectedData.set !== 'function') {
            return false;
        }

        const platform = resolvePlatform(options);
        const selectors = {
            ...((platform && platform.messageSelectors) || {}),
            ...(options.selectors || {})
        };
        const turnSelector = selectors.turn || 'article [class*="group/turn-messages"]';
        const userBubbleSelector = selectors.userBubble || '.user-message-bubble-color';
        const assistantTextSelector = selectors.assistantText || '.assistant-content, .markdown, [class*="markdown"], .prose';

        let newly = 0;
        let updated = false;
        const seenUserTexts = new Set();
        const nodes = Array.from(doc.querySelectorAll(turnSelector));

        nodes.forEach((turnNode, index) => {
            const info = collectedData.get(turnNode) || createTurnInfo(index);
            let changed = false;

            if (!collectedData.has(turnNode)) {
                collectedData.set(turnNode, info);
                newly++;
            }

            const userBubble = turnNode.matches(userBubbleSelector)
                ? turnNode
                : turnNode.querySelector(userBubbleSelector);

            if (userBubble) {
                const userText = normalizeText(getNodeText(userBubble));
                if (userText && !seenUserTexts.has(userText)) {
                    seenUserTexts.add(userText);
                    if (info.userText !== userText) {
                        info.userText = userText;
                        changed = true;
                    }
                }
            } else {
                const assistantRoot = turnNode.querySelector(assistantTextSelector) || turnNode;
                const responseText = normalizeText(getNodeText(assistantRoot));
                if (responseText && info.responseText !== responseText) {
                    info.responseText = responseText;
                    info.responseHtml = assistantRoot;
                    changed = true;
                }
            }

            if (changed) {
                updateTurnType(info);
                collectedData.set(turnNode, info);
                updated = true;
            }
        });

        buildStatusText(options, collectedData.size);
        return newly > 0 || updated;
    }

    function extractDataIncrementalDispatch(options = {}) {
        const platform = resolvePlatform(options);
        if (platform.id === 'gemini') return extractDataIncrementalGemini(options);
        if (platform.id === 'chatgpt') return extractDataIncrementalChatGpt(options);
        return extractDataIncrementalAiStudio(options);
    }

    return {
        extractDataIncrementalGemini,
        extractDataIncrementalAiStudio,
        extractDataIncrementalChatGpt,
        extractDataIncrementalDispatch
    };
});
