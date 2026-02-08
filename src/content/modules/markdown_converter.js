(function () {
    'use strict';

    function createMarkdownConverter() {
        let turndownService = null;

        function cleanupMarkdown(text) {
            if (!text) return '';
            return String(text)
                .replace(/\u00a0/g, ' ')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        function initTurndown() {
            if (turndownService) return turndownService;

            if (typeof TurndownService === 'undefined') {
                console.warn('Turndown library not loaded, falling back to plain text extraction');
                return null;
            }

            turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                emDelimiter: '*',
                bulletListMarker: '-'
            });

            if (typeof turndownPluginGfm !== 'undefined') {
                const gfm = turndownPluginGfm.gfm;
                turndownService.use(gfm);
                console.log('Turndown GFM plugin loaded (tables, strikethrough, tasklists)');
            } else {
                console.warn('Turndown GFM plugin not available, tables may not convert properly');
            }

            turndownService.addRule('geminiCodeBlock', {
                filter: (node) => node.nodeName === 'CODE-BLOCK' ||
                    (node.nodeName === 'PRE' && node.querySelector('code')) ||
                    node.classList?.contains('code-block'),
                replacement: (content, node) => {
                    const codeEl = node.querySelector('code') || node;
                    const language = codeEl.getAttribute('data-lang') ||
                        codeEl.className?.match(/language-(\w+)/)?.[1] || '';
                    const code = codeEl.textContent || content;
                    return `\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n`;
                }
            });

            turndownService.addRule('preCode', {
                filter: ['pre'],
                replacement: (content, node) => {
                    const codeEl = node.querySelector('code');
                    if (codeEl) {
                        const language = codeEl.getAttribute('data-lang') ||
                            codeEl.className?.match(/language-(\w+)/)?.[1] || '';
                        return `\n\`\`\`${language}\n${codeEl.textContent.trim()}\n\`\`\`\n`;
                    }
                    return `\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n`;
                }
            });

            turndownService.addRule('geminiMarkdown', {
                filter: (node) => node.classList?.contains('markdown') ||
                    node.classList?.contains('model-response-text'),
                replacement: (content) => content
            });

            console.log('Turndown initialized with custom Gemini rules');
            return turndownService;
        }

        function htmlToMarkdown(element) {
            if (!element) return '';

            const td = initTurndown();
            if (!td) {
                return cleanupMarkdown(element.innerText?.trim() || '');
            }

            try {
                const html = element.innerHTML || element.outerHTML;
                const markdown = td.turndown(html);
                return cleanupMarkdown(markdown);
            } catch (e) {
                console.warn('HTML to Markdown conversion failed, falling back to innerText:', e);
                return cleanupMarkdown(element.innerText?.trim() || '');
            }
        }

        return {
            cleanupMarkdown,
            htmlToMarkdown
        };
    }

    window.GeminiExportMarkdown = {
        createMarkdownConverter
    };
})();
