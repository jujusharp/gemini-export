(function () {
    'use strict';

    function extractDataIncrementalGemini(options = {}) {
        const collectedData = options.collectedData;
        if (!collectedData || typeof collectedData.get !== 'function' || typeof collectedData.set !== 'function') {
            return false;
        }

        const selectors = options.selectors || {};
        const updateStatus = typeof options.updateStatus === 'function' ? options.updateStatus : () => { };
        const scrollCount = Number(options.scrollCount || 0);
        const maxScrollAttempts = Number(options.maxScrollAttempts || 0);

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
        const nodes = document.querySelectorAll('#chat-history .conversation-container');
        const seenUserTexts = new Set();

        nodes.forEach((container, idx) => {
            const info = collectedData.get(container) || {
                domOrder: idx,
                type: 'unknown',
                userText: null,
                thoughtText: null,
                responseText: null
            };
            let changed = false;

            if (!collectedData.has(container)) {
                collectedData.set(container, info);
                newly++;
            }

            if (!info.userText) {
                let userTexts = [];

                const textLines = Array.from(container.querySelectorAll(`${userContainer} ${userLine}`));
                if (textLines.length > 0) {
                    userTexts = textLines.map((el) => el.innerText.trim());
                } else {
                    const paragraphs = Array.from(container.querySelectorAll(`${userContainer} ${userParagraph}`));
                    if (paragraphs.length > 0) {
                        userTexts = paragraphs.map((el) => el.innerText.trim());
                    } else {
                        const userContainerNode = container.querySelector(`${userContainer} ${userText}`);
                        if (userContainerNode) {
                            userTexts = [userContainerNode.innerText.trim()];
                        }
                    }
                }

                userTexts = userTexts.filter(Boolean);

                if (userTexts.length > 0) {
                    const combinedUserText = userTexts.join('\n');
                    if (!seenUserTexts.has(combinedUserText)) {
                        seenUserTexts.add(combinedUserText);
                        info.userText = combinedUserText;
                        changed = true;
                        if (info.type === 'unknown') info.type = 'user';
                    }
                }
            }

            const modelRoot = container.querySelector(modelContent);
            if (modelRoot) {
                if (!info.responseText) {
                    const markdownNode = modelRoot.querySelector(modelMarkdown);
                    if (markdownNode && markdownNode.innerText.trim()) {
                        info.responseText = markdownNode.innerText.trim();
                        info.responseHtml = markdownNode;
                        changed = true;
                    }
                }

                if (!info.thoughtText) {
                    const thoughts = modelRoot.querySelector(modelThoughts);
                    if (thoughts) {
                        let thoughtText = '';
                        const body = thoughts.querySelector(modelThoughtsBody);
                        if (body && body.innerText.trim() && !/显示思路/.test(body.innerText.trim())) {
                            thoughtText = body.innerText.trim();
                        }
                        info.thoughtText = thoughtText || '(思维链未展开)';
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
                collectedData.set(container, info);
                updated = true;
            }
        });

        updateStatus(`滚动 ${scrollCount}/${maxScrollAttempts}... 已收集 ${collectedData.size} 条记录..`);
        return newly > 0 || updated;
    }

    function extractDataIncrementalAiStudio(options = {}) {
        const collectedData = options.collectedData;
        if (!collectedData || typeof collectedData.get !== 'function' || typeof collectedData.set !== 'function') {
            return false;
        }

        const updateStatus = typeof options.updateStatus === 'function' ? options.updateStatus : () => { };
        const scrollCount = Number(options.scrollCount || 0);
        const maxScrollAttempts = Number(options.maxScrollAttempts || 0);
        const t = options.t || {};

        let newlyFoundCount = 0;
        let dataUpdatedInExistingTurn = false;
        const currentTurns = document.querySelectorAll('ms-chat-turn');
        const seenUserTexts = new Set();

        currentTurns.forEach((turn, index) => {
            const turnContainer = turn.querySelector('.chat-turn-container.user, .chat-turn-container.model');
            if (!turnContainer) return;

            const turnKey = turn;
            const isNewTurn = !collectedData.has(turnKey);
            const extractedInfo = collectedData.get(turnKey) || {
                domOrder: index,
                type: 'unknown',
                userText: null,
                thoughtText: null,
                responseText: null
            };

            if (isNewTurn) {
                collectedData.set(turnKey, extractedInfo);
                newlyFoundCount++;
            }

            let dataWasUpdatedThisTime = false;

            if (turnContainer.classList.contains('user')) {
                if (extractedInfo.type === 'unknown') extractedInfo.type = 'user';
                if (!extractedInfo.userText) {
                    const userNode = turn.querySelector('.turn-content ms-cmark-node');
                    const userText = userNode ? userNode.innerText.trim() : null;
                    if (userText && !seenUserTexts.has(userText)) {
                        seenUserTexts.add(userText);
                        extractedInfo.userText = userText;
                        dataWasUpdatedThisTime = true;
                    }
                }
            } else if (turnContainer.classList.contains('model')) {
                if (extractedInfo.type === 'unknown') extractedInfo.type = 'model';

                if (!extractedInfo.thoughtText) {
                    const thoughtNode = turn.querySelector('.thought-container .mat-expansion-panel-body');
                    if (thoughtNode) {
                        const thoughtText = thoughtNode.textContent.trim();
                        if (thoughtText && thoughtText.toLowerCase() !== 'thinking process:') {
                            extractedInfo.thoughtText = thoughtText;
                            dataWasUpdatedThisTime = true;
                        }
                    }
                }

                if (!extractedInfo.responseText) {
                    const responseChunks = Array.from(turn.querySelectorAll('.turn-content > ms-prompt-chunk'));
                    const responseElements = responseChunks
                        .filter((chunk) => !chunk.querySelector('.thought-container'))
                        .map((chunk) => chunk.querySelector('ms-cmark-node') || chunk)
                        .filter((el) => el && el.innerText?.trim());

                    const responseTexts = responseElements.map((el) => el.innerText.trim());

                    if (responseTexts.length > 0) {
                        extractedInfo.responseText = responseTexts.join('\n\n');
                        extractedInfo.responseHtmlElements = responseElements;
                        dataWasUpdatedThisTime = true;
                    } else if (!extractedInfo.thoughtText) {
                        const turnContent = turn.querySelector('.turn-content');
                        if (turnContent) {
                            extractedInfo.responseText = turnContent.innerText.trim();
                            extractedInfo.responseHtmlElements = [turnContent];
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
            const warningText = t.statusWarnNoData || 'Warning: Turns found but no data extracted. Check selectors.';
            console.warn(warningText);
            updateStatus(warningText);
        } else {
            const statusText = typeof t.statusScrolling === 'function'
                ? t.statusScrolling(scrollCount, maxScrollAttempts, collectedData.size)
                : `Scrolling ${scrollCount}/${maxScrollAttempts}... Collected ${collectedData.size} items...`;
            updateStatus(statusText);
        }

        return newlyFoundCount > 0 || dataUpdatedInExistingTurn;
    }

    function extractDataIncrementalDispatch(options = {}) {
        if (document.querySelector('#chat-history .conversation-container')) {
            return extractDataIncrementalGemini(options);
        }
        return extractDataIncrementalAiStudio(options);
    }

    window.GeminiExportConversationExtractor = {
        extractDataIncrementalGemini,
        extractDataIncrementalAiStudio,
        extractDataIncrementalDispatch
    };
})();
