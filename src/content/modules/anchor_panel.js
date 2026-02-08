(function () {
    'use strict';

    function createAnchorPanelController(options = {}) {
        const addStyle = typeof options.GM_addStyle === 'function'
            ? options.GM_addStyle
            : (css) => {
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
            };
        const cleanupMarkdown = typeof options.cleanupMarkdown === 'function'
            ? options.cleanupMarkdown
            : (text) => String(text || '').trim();
        const getSelectors = typeof options.getSelectors === 'function'
            ? options.getSelectors
            : () => ({});
        const getScrollHost = typeof options.getScrollHost === 'function'
            ? options.getScrollHost
            : () => window;
        const t = options.t || {};

        let anchorPanel = null;
        let anchorList = null;
        let anchorEmptyState = null;
        let anchorToggleButton = null;
        let anchorObserveTarget = null;
        let anchorObserver = null;
        let anchorRefreshTimer = null;
        let anchorScrollHost = null;
        let anchorScrollRaf = null;
        let anchorEntries = [];
        let activeAnchorIndex = -1;
        let anchorStylesInjected = false;
        let anchorCollapsed = false;
        let anchorSyncStarted = false;

        const defaultText = {
            anchorTitle: 'Thread',
            anchorEmpty: 'No messages yet',
            anchorUserShort: 'Q',
            anchorModelShort: 'A',
            anchorUserFallback: 'User message',
            anchorModelFallback: 'Model response',
            anchorExpand: 'Expand message anchors',
            anchorCollapse: 'Collapse message anchors',
            anchorJumpTo: (index) => `Jump to message ${index}`,
            btnToggleOpen: '<',
            btnToggleClose: '>'
        };

        const onResizeRefresh = () => scheduleAnchorRefresh(120);

        function getTextValue(key) {
            return t[key] || defaultText[key];
        }

        function getJumpTitle(index) {
            const textOrFn = getTextValue('anchorJumpTo');
            if (typeof textOrFn === 'function') return textOrFn(index);
            return `Jump to message ${index}`;
        }

        function getCurrentSelectors() {
            const selectors = getSelectors() || {};
            return {
                userContainer: selectors.userContainer || 'user-query',
                modelContainer: selectors.modelContainer || 'model-response',
                userText: selectors.userText || '.query-text'
            };
        }

        function injectAnchorStyles() {
            if (anchorStylesInjected) return;
            addStyle(`
                #ge-thread-anchor-panel {
                    position: fixed;
                    top: 86px;
                    right: 14px;
                    width: 230px;
                    min-height: 180px;
                    height: calc(100vh - 190px);
                    max-height: 760px;
                    background: var(--ge-panel-bg, #111827);
                    color: var(--ge-panel-text, #F9FAFB);
                    border: 1px solid var(--ge-border, #374151);
                    border-radius: 12px;
                    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
                    z-index: 9998;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
                }
                #ge-thread-anchor-panel .ge-anchor-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 10px 8px 12px;
                    border-bottom: 1px solid var(--ge-divider, #1F2937);
                    gap: 8px;
                }
                #ge-thread-anchor-panel .ge-anchor-title {
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                    color: var(--ge-panel-text, #F9FAFB);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                #ge-thread-anchor-panel .ge-anchor-toggle {
                    width: 24px;
                    height: 24px;
                    border-radius: 6px;
                    border: 1px solid var(--ge-border, #374151);
                    background: var(--ge-surface, #1F2937);
                    color: var(--ge-panel-text, #F9FAFB);
                    cursor: pointer;
                    font-size: 12px;
                    line-height: 1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                }
                #ge-thread-anchor-panel .ge-anchor-toggle:hover {
                    background: var(--ge-surface-hover, #1F2937);
                    border-color: var(--ge-border-hover, #6B7280);
                }
                #ge-thread-anchor-panel .ge-anchor-list-wrap {
                    flex: 1;
                    min-height: 0;
                    overflow: auto;
                    padding: 8px;
                }
                #ge-thread-anchor-panel .ge-anchor-list-wrap::-webkit-scrollbar {
                    width: 8px;
                }
                #ge-thread-anchor-panel .ge-anchor-list-wrap::-webkit-scrollbar-thumb {
                    background: var(--ge-scroll-thumb, #374151);
                    border-radius: 999px;
                }
                #ge-thread-anchor-panel .ge-anchor-list-wrap::-webkit-scrollbar-thumb:hover {
                    background: var(--ge-scroll-thumb-hover, #4B5563);
                }
                #ge-thread-anchor-panel .ge-anchor-empty {
                    font-size: 12px;
                    color: var(--ge-text-muted, #D1D5DB);
                    padding: 8px 6px;
                    line-height: 1.4;
                }
                #ge-thread-anchor-panel .ge-anchor-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                #ge-thread-anchor-panel .ge-anchor-item {
                    width: 100%;
                    border: 1px solid var(--ge-border, #374151);
                    border-radius: 8px;
                    background: var(--ge-surface, #1F2937);
                    color: var(--ge-panel-text, #F9FAFB);
                    padding: 7px 8px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                }
                #ge-thread-anchor-panel .ge-anchor-item:hover {
                    background: var(--ge-surface-hover, #1F2937);
                    border-color: var(--ge-border-hover, #6B7280);
                }
                #ge-thread-anchor-panel .ge-anchor-item.is-active {
                    border-color: var(--ge-primary-border, #1D4ED8);
                    background: rgba(30, 64, 175, 0.22);
                }
                #ge-thread-anchor-panel .ge-anchor-badge {
                    flex: 0 0 auto;
                    min-width: 42px;
                    height: 20px;
                    border-radius: 999px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 0 6px;
                    letter-spacing: 0.02em;
                }
                #ge-thread-anchor-panel .ge-anchor-badge.ge-anchor-user {
                    background: rgba(30, 64, 175, 0.3);
                    color: var(--ge-on-primary, #F9FAFB);
                }
                #ge-thread-anchor-panel .ge-anchor-badge.ge-anchor-model {
                    background: rgba(5, 150, 105, 0.34);
                    color: var(--ge-on-primary, #F9FAFB);
                }
                #ge-thread-anchor-panel .ge-anchor-text {
                    min-width: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                #ge-thread-anchor-panel.ge-collapsed {
                    width: 42px;
                    min-height: 42px;
                    height: 42px;
                    overflow: hidden;
                }
                #ge-thread-anchor-panel.ge-collapsed .ge-anchor-header {
                    padding: 8px;
                    border-bottom: none;
                    justify-content: center;
                }
                #ge-thread-anchor-panel.ge-collapsed .ge-anchor-title,
                #ge-thread-anchor-panel.ge-collapsed .ge-anchor-list-wrap {
                    display: none;
                }
                @media (max-width: 1280px) {
                    #ge-thread-anchor-panel {
                        width: 190px;
                    }
                }
                @media (max-width: 980px) {
                    #ge-thread-anchor-panel {
                        display: none !important;
                    }
                }
            `);
            anchorStylesInjected = true;
        }

        function getThreadRootElement() {
            return document.querySelector('#chat-history') ||
                document.querySelector('chat-history') ||
                document.querySelector('chat-window-content') ||
                document.querySelector('main') ||
                document.body;
        }

        function getThreadMessageNodes() {
            const root = getThreadRootElement();
            if (!root) return [];

            const { userContainer, modelContainer } = getCurrentSelectors();
            const messageNodes = [];
            const messageSelector = `${userContainer}, ${modelContainer}`;

            try {
                const nodes = Array.from(root.querySelectorAll(messageSelector));
                if (nodes.length > 0) {
                    nodes.forEach((node) => {
                        let role = 'model';
                        try {
                            if (userContainer && node.matches(userContainer)) role = 'user';
                        } catch (_) {
                            role = node.tagName?.toLowerCase() === 'user-query' ? 'user' : 'model';
                        }
                        messageNodes.push({ node, role });
                    });
                    return messageNodes;
                }
            } catch (e) {
                console.warn('Gemini Export: 解析消息节点失败，回退到 ms-chat-turn', e);
            }

            const turns = Array.from(root.querySelectorAll('ms-chat-turn'));
            turns.forEach((turn) => {
                const turnContainer = turn.querySelector('.chat-turn-container.user, .chat-turn-container.model');
                if (!turnContainer) return;
                const role = turnContainer.classList.contains('user') ? 'user' : 'model';
                messageNodes.push({ node: turn, role });
            });

            return messageNodes;
        }

        function getMessageAnchorSnippet(node, role) {
            if (!node) return role === 'user' ? getTextValue('anchorUserFallback') : getTextValue('anchorModelFallback');

            const { userText } = getCurrentSelectors();
            let source = node;
            if (role === 'user') {
                source = node.querySelector(userText) ||
                    node.querySelector('.query-text-line, .query-text p') ||
                    node;
            } else {
                source = node.querySelector('.model-response-text .markdown, .model-response-text, .response-container-content, .markdown') ||
                    node;
            }

            let text = source.innerText || source.textContent || '';
            text = cleanupMarkdown(text.replace(/\n+/g, ' '));
            if (!text) text = role === 'user' ? getTextValue('anchorUserFallback') : getTextValue('anchorModelFallback');

            const maxLen = 44;
            return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
        }

        function setAnchorPanelCollapsed(nextCollapsed) {
            anchorCollapsed = Boolean(nextCollapsed);
            if (!anchorPanel || !anchorToggleButton) return;

            anchorPanel.classList.toggle('ge-collapsed', anchorCollapsed);
            anchorToggleButton.textContent = anchorCollapsed ? getTextValue('btnToggleClose') : getTextValue('btnToggleOpen');
            anchorToggleButton.title = anchorCollapsed ? getTextValue('anchorExpand') : getTextValue('anchorCollapse');
        }

        function createAnchorPanel() {
            if (anchorPanel) return;

            injectAnchorStyles();

            anchorPanel = document.createElement('aside');
            anchorPanel.id = 'ge-thread-anchor-panel';

            const header = document.createElement('div');
            header.className = 'ge-anchor-header';

            const title = document.createElement('div');
            title.className = 'ge-anchor-title';
            title.textContent = getTextValue('anchorTitle');

            anchorToggleButton = document.createElement('button');
            anchorToggleButton.type = 'button';
            anchorToggleButton.className = 'ge-anchor-toggle';
            anchorToggleButton.addEventListener('click', togglePanel);

            header.appendChild(title);
            header.appendChild(anchorToggleButton);

            const listWrap = document.createElement('div');
            listWrap.className = 'ge-anchor-list-wrap';

            anchorEmptyState = document.createElement('div');
            anchorEmptyState.className = 'ge-anchor-empty';
            anchorEmptyState.textContent = getTextValue('anchorEmpty');

            anchorList = document.createElement('ul');
            anchorList.className = 'ge-anchor-list';

            listWrap.appendChild(anchorEmptyState);
            listWrap.appendChild(anchorList);
            anchorPanel.appendChild(header);
            anchorPanel.appendChild(listWrap);

            document.body.appendChild(anchorPanel);
            setAnchorPanelCollapsed(true);
        }

        function setActiveAnchorIndex(index) {
            if (activeAnchorIndex === index) return;
            activeAnchorIndex = index;
            if (!anchorList) return;

            anchorList.querySelectorAll('.ge-anchor-item.is-active').forEach((btn) => {
                btn.classList.remove('is-active');
            });

            if (index < 0) return;
            const activeBtn = anchorList.querySelector(`.ge-anchor-item[data-index="${index}"]`);
            if (activeBtn) activeBtn.classList.add('is-active');
        }

        function scrollToAnchor(index) {
            const entry = anchorEntries[index];
            if (!entry || !entry.node || !entry.node.isConnected) {
                scheduleAnchorRefresh(80);
                return;
            }

            setActiveAnchorIndex(index);
            try {
                entry.node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } catch (_) {
                entry.node.scrollIntoView();
            }
        }

        function updateActiveAnchorByViewport() {
            if (!anchorEntries.length) {
                setActiveAnchorIndex(-1);
                return;
            }

            const focusLine = Math.max(90, Math.min(window.innerHeight * 0.34, 250));
            let nextActive = 0;

            for (let i = 0; i < anchorEntries.length; i++) {
                const current = anchorEntries[i];
                if (!current.node || !current.node.isConnected) continue;

                const rect = current.node.getBoundingClientRect();
                if (rect.top <= focusLine) nextActive = i;
                if (rect.top > focusLine) break;
            }

            setActiveAnchorIndex(nextActive);
        }

        function onAnchorHostScroll() {
            if (anchorScrollRaf) return;
            anchorScrollRaf = window.requestAnimationFrame(() => {
                anchorScrollRaf = null;
                updateActiveAnchorByViewport();
            });
        }

        function resolveAnchorScrollHost() {
            const host = getScrollHost();
            if (!host || host === document.documentElement || host === document.body || host === document.scrollingElement) {
                return window;
            }
            return host;
        }

        function bindAnchorScrollHost() {
            const nextHost = resolveAnchorScrollHost();
            if (anchorScrollHost === nextHost) return;

            if (anchorScrollHost) {
                if (anchorScrollHost === window) {
                    window.removeEventListener('scroll', onAnchorHostScroll);
                } else {
                    anchorScrollHost.removeEventListener('scroll', onAnchorHostScroll);
                }
            }

            anchorScrollHost = nextHost;
            if (anchorScrollHost === window) {
                window.addEventListener('scroll', onAnchorHostScroll, { passive: true });
            } else {
                anchorScrollHost.addEventListener('scroll', onAnchorHostScroll, { passive: true });
            }
        }

        function ensureAnchorObserver() {
            const nextTarget = getThreadRootElement();
            if (!nextTarget) return;
            if (anchorObserveTarget === nextTarget && anchorObserver) return;

            if (anchorObserver) anchorObserver.disconnect();
            anchorObserveTarget = nextTarget;
            anchorObserver = new MutationObserver(() => scheduleAnchorRefresh(120));

            try {
                anchorObserver.observe(anchorObserveTarget, { childList: true, subtree: true });
            } catch (e) {
                console.warn('Gemini Export: 锚点观察器挂载失败', e);
            }
        }

        function refreshAnchorList() {
            if (!anchorList || !anchorEmptyState) return;
            ensureAnchorObserver();
            bindAnchorScrollHost();

            anchorEntries = getThreadMessageNodes().map((entry, index) => {
                return {
                    node: entry.node,
                    role: entry.role,
                    index,
                    label: getMessageAnchorSnippet(entry.node, entry.role)
                };
            });

            anchorList.innerHTML = '';
            if (anchorEntries.length === 0) {
                anchorEmptyState.style.display = 'block';
                setActiveAnchorIndex(-1);
                return;
            }

            anchorEmptyState.style.display = 'none';
            anchorEntries.forEach((entry, index) => {
                const li = document.createElement('li');

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'ge-anchor-item';
                button.dataset.index = String(index);
                button.title = getJumpTitle(index + 1);

                const badge = document.createElement('span');
                badge.className = `ge-anchor-badge ${entry.role === 'user' ? 'ge-anchor-user' : 'ge-anchor-model'}`;
                const roleText = entry.role === 'user' ? getTextValue('anchorUserShort') : getTextValue('anchorModelShort');
                badge.textContent = `${roleText}${String(index + 1)}`;

                const text = document.createElement('span');
                text.className = 'ge-anchor-text';
                text.textContent = entry.label;

                button.appendChild(badge);
                button.appendChild(text);
                button.addEventListener('click', () => scrollToAnchor(index));

                li.appendChild(button);
                anchorList.appendChild(li);
            });

            updateActiveAnchorByViewport();
        }

        function scheduleAnchorRefresh(delayMs = 120) {
            if (anchorRefreshTimer) window.clearTimeout(anchorRefreshTimer);
            anchorRefreshTimer = window.setTimeout(() => {
                anchorRefreshTimer = null;
                refreshAnchorList();
            }, delayMs);
        }

        function start() {
            if (anchorSyncStarted) return;
            anchorSyncStarted = true;

            createAnchorPanel();
            window.addEventListener('resize', onAnchorHostScroll, { passive: true });
            window.addEventListener('resize', onResizeRefresh, { passive: true });

            scheduleAnchorRefresh(0);
            window.setTimeout(() => scheduleAnchorRefresh(400), 400);
            window.setTimeout(() => scheduleAnchorRefresh(2000), 2000);
        }

        function togglePanel() {
            if (!anchorSyncStarted) {
                start();
            }
            setAnchorPanelCollapsed(!anchorCollapsed);
        }

        function destroy() {
            if (anchorObserver) {
                anchorObserver.disconnect();
                anchorObserver = null;
            }
            if (anchorRefreshTimer) {
                window.clearTimeout(anchorRefreshTimer);
                anchorRefreshTimer = null;
            }
            if (anchorScrollRaf) {
                window.cancelAnimationFrame(anchorScrollRaf);
                anchorScrollRaf = null;
            }
            if (anchorScrollHost) {
                if (anchorScrollHost === window) {
                    window.removeEventListener('scroll', onAnchorHostScroll);
                } else {
                    anchorScrollHost.removeEventListener('scroll', onAnchorHostScroll);
                }
                anchorScrollHost = null;
            }
            window.removeEventListener('resize', onAnchorHostScroll);
            window.removeEventListener('resize', onResizeRefresh);
            if (anchorPanel && anchorPanel.parentNode) {
                anchorPanel.parentNode.removeChild(anchorPanel);
            }
            anchorPanel = null;
            anchorList = null;
            anchorEmptyState = null;
            anchorToggleButton = null;
            anchorObserveTarget = null;
            anchorEntries = [];
            activeAnchorIndex = -1;
            anchorCollapsed = false;
            anchorSyncStarted = false;
        }

        return {
            start,
            togglePanel,
            destroy
        };
    }

    window.GeminiExportAnchorPanel = {
        createAnchorPanelController
    };
})();
