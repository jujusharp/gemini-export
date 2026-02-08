(function () {
    'use strict';

    function createExportPipeline(options = {}) {
        const t = options.t || {};
        const htmlToMarkdown = typeof options.htmlToMarkdown === 'function'
            ? options.htmlToMarkdown
            : (element) => String(element?.innerText || '').trim();
        const getProjectName = typeof options.getProjectName === 'function'
            ? options.getProjectName
            : () => 'GeminiChat';
        const getCurrentTimestamp = typeof options.getCurrentTimestamp === 'function'
            ? options.getCurrentTimestamp
            : () => new Date().toISOString().replace(/[:.]/g, '-');
        const getExportMode = typeof options.getExportMode === 'function'
            ? options.getExportMode
            : () => String(window.__GEMINI_EXPORT_FORMAT || 'txt').toLowerCase();

        function escapeMd(text) {
            return String(text || '').replace(/`/g, '\u0060').replace(/</g, '&lt;');
        }

        function deduplicateTurnData(data) {
            if (!data || !Array.isArray(data)) return [];

            const seen = new Set();
            const deduplicated = [];

            data.forEach((item) => {
                const contentKey = [
                    item.userText || '',
                    item.thoughtText || '',
                    item.responseText || ''
                ].join('|||').substring(0, 200);

                if (!seen.has(contentKey)) {
                    seen.add(contentKey);
                    deduplicated.push(item);
                }
            });

            return deduplicated;
        }

        function extractCanvasContent() {
            console.log(t.logExtractingCanvas || 'Extracting Canvas content...');
            const canvasData = [];
            const seenContents = new Set();

            const codeBlocks = document.querySelectorAll('code-block, pre code, .code-block');
            codeBlocks.forEach((block) => {
                const codeContent = block.textContent || block.innerText;
                if (!codeContent || !codeContent.trim()) return;

                const trimmedContent = codeContent.trim();
                const contentKey = trimmedContent.substring(0, 100);
                if (seenContents.has(contentKey)) return;

                seenContents.add(contentKey);
                canvasData.push({
                    type: 'code',
                    index: canvasData.length + 1,
                    content: trimmedContent,
                    language: block.querySelector('[data-lang]')?.getAttribute('data-lang') || 'unknown',
                    htmlElement: block
                });
            });

            const responseElements = document.querySelectorAll('response-element, .model-response-text, .markdown');
            responseElements.forEach((element) => {
                if (element.closest('code-block') || element.querySelector('code-block')) return;

                const textContent = element.textContent || element.innerText;
                if (!textContent || !textContent.trim()) return;

                const trimmedContent = textContent.trim();
                const contentKey = trimmedContent.substring(0, 100);
                if (seenContents.has(contentKey)) return;

                seenContents.add(contentKey);
                canvasData.push({
                    type: 'text',
                    index: canvasData.length + 1,
                    content: trimmedContent,
                    htmlElement: element
                });
            });

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
                                content: trimmedContent,
                                htmlElement: chatContainer
                            });
                        }
                    }
                }
            }

            const logMessage = typeof t.logCanvasExtracted === 'function'
                ? t.logCanvasExtracted(canvasData.length)
                : `Canvas content extraction complete. Found ${canvasData.length} items.`;
            console.log(logMessage);
            return canvasData;
        }

        function formatCanvasDataForExport(canvasData) {
            const mode = getExportMode();
            const projectName = getProjectName();
            const ts = getCurrentTimestamp();
            const base = projectName;

            if (mode === 'txt') {
                let body = `${t.txtCombinedHeader}\n=========================================\n\n`;
                canvasData.forEach((item) => {
                    if (item.type === 'code') {
                        body += `${t.txtCodeBlock(item.index, item.language)}\n${item.content}\n\n`;
                    } else if (item.type === 'text') {
                        body += `${t.txtTextBlock(item.index)}\n${item.content}\n\n`;
                    } else {
                        body += `${t.txtFullContent}\n${item.content}\n\n`;
                    }
                    body += '------------------------------\n\n';
                });
                body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
                return {
                    blob: new Blob([body], { type: 'text/plain;charset=utf-8' }),
                    filename: `${base}.txt`
                };
            }

            if (mode === 'json') {
                const jsonData = {
                    exportType: 'canvas',
                    timestamp: ts,
                    projectName,
                    content: canvasData
                };
                return {
                    blob: new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' }),
                    filename: `${base}.json`
                };
            }

            if (mode === 'md') {
                let md = `${t.mdHeaderCanvas(projectName)}\n\n`;
                md += `${t.mdExportTime(ts)}\n\n`;
                canvasData.forEach((item, idx) => {
                    md += `${t.mdContentBlock(idx + 1)}\n\n`;
                    if (item.type === 'code') {
                        md += `${t.mdCodeBlock(item.language)}\n\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
                    } else if (item.type === 'text') {
                        if (item.htmlElement) {
                            const convertedMd = htmlToMarkdown(item.htmlElement);
                            md += `${t.mdTextBlock}\n\n${convertedMd}\n\n`;
                        } else {
                            md += `${t.mdTextBlock}\n\n${escapeMd(item.content)}\n\n`;
                        }
                    } else if (item.htmlElement) {
                        const convertedMd = htmlToMarkdown(item.htmlElement);
                        md += `${t.mdFullContent}\n\n${convertedMd}\n\n`;
                    } else {
                        md += `${t.mdFullContent}\n\n${escapeMd(item.content)}\n\n`;
                    }
                    md += '---\n\n';
                });
                return {
                    blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
                    filename: `${base}.md`
                };
            }

            const body = canvasData.map((item) => item.content || '').join('\n\n');
            return {
                blob: new Blob([body], { type: 'text/plain;charset=utf-8' }),
                filename: `${base}.txt`
            };
        }

        function formatCombinedDataForExport(scrollData, canvasData) {
            const mode = getExportMode();
            const projectName = getProjectName();
            const ts = getCurrentTimestamp();
            const base = projectName;
            const deduplicatedScrollData = deduplicateTurnData(scrollData);

            if (mode === 'txt') {
                let body = `${t.txtCombinedHeader}
=========================================

`;

                if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                    body += `${t.txtDialogSection}

`;
                    deduplicatedScrollData.forEach((item) => {
                        let block = '';
                        if (item.userText) block += `${t.txtUser}\n${item.userText}\n\n`;
                        if (item.thoughtText) block += `${t.txtAIThought}\n${item.thoughtText}\n\n`;
                        if (item.responseText) block += `${t.txtAIResponse}\n${item.responseText}\n\n`;
                        body += `${block.trim()}\n\n------------------------------\n\n`;
                    });
                }

                if (canvasData && canvasData.length > 0) {
                    body += `\n\n${t.txtCanvasSection}\n\n`;
                    canvasData.forEach((item) => {
                        if (item.type === 'code') {
                            body += `${t.txtCodeBlock(item.index, item.language)}\n${item.content}\n\n`;
                        } else if (item.type === 'text') {
                            body += `${t.txtTextBlock(item.index)}\n${item.content}\n\n`;
                        } else {
                            body += `${t.txtFullContent}\n${item.content}\n\n`;
                        }
                        body += '------------------------------\n\n';
                    });
                }

                body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
                return {
                    blob: new Blob([body], { type: 'text/plain;charset=utf-8' }),
                    filename: `${base}.txt`
                };
            }

            if (mode === 'json') {
                const jsonData = {
                    exportType: 'combined',
                    timestamp: ts,
                    projectName,
                    dialogue: [],
                    canvas: canvasData || []
                };

                if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                    deduplicatedScrollData.forEach((item) => {
                        if (item.userText) jsonData.dialogue.push({ role: 'user', content: item.userText, id: `${item.domOrder}-user` });
                        if (item.thoughtText) jsonData.dialogue.push({ role: 'thought', content: item.thoughtText, id: `${item.domOrder}-thought` });
                        if (item.responseText) jsonData.dialogue.push({ role: 'assistant', content: item.responseText, id: `${item.domOrder}-assistant` });
                    });
                }

                return {
                    blob: new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' }),
                    filename: `${base}.json`
                };
            }

            if (mode === 'md') {
                let md = `${t.mdHeaderCombined(projectName)}\n\n${t.mdExportTime(ts)}\n\n`;

                if (deduplicatedScrollData && deduplicatedScrollData.length > 0) {
                    md += `## ${t.txtDialogSection.replace(/=== /g, '')}\n\n`;
                    deduplicatedScrollData.forEach((item, idx) => {
                        md += `${t.mdTurn(idx + 1)}\n\n`;
                        if (item.userText) md += `${t.mdUser}\n\n${escapeMd(item.userText)}\n\n`;
                        if (item.thoughtText) md += `<details><summary>${t.mdAIThought}</summary>\n\n${escapeMd(item.thoughtText)}\n\n</details>\n\n`;

                        if (item.responseHtml) {
                            const responseMd = htmlToMarkdown(item.responseHtml);
                            md += `${t.mdAIResponse}\n\n${responseMd}\n\n`;
                        } else if (item.responseHtmlElements && item.responseHtmlElements.length > 0) {
                            const responseMd = item.responseHtmlElements.map((el) => htmlToMarkdown(el)).join('\n\n');
                            md += `${t.mdAIResponse}\n\n${responseMd}\n\n`;
                        } else if (item.responseText) {
                            md += `${t.mdAIResponse}\n\n${escapeMd(item.responseText)}\n\n`;
                        }

                        md += '---\n\n';
                    });
                }

                if (canvasData && canvasData.length > 0) {
                    md += `## ${t.txtCanvasSection.replace(/=== /g, '')}\n\n`;
                    canvasData.forEach((item, idx) => {
                        md += `${t.mdContentBlock(idx + 1)}\n\n`;
                        if (item.type === 'code') {
                            md += `${t.mdCodeBlock(item.language)}\n\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
                        } else if (item.type === 'text') {
                            if (item.htmlElement) {
                                const convertedMd = htmlToMarkdown(item.htmlElement);
                                md += `${t.mdTextBlock}\n\n${convertedMd}\n\n`;
                            } else {
                                md += `${t.mdTextBlock}\n\n${escapeMd(item.content)}\n\n`;
                            }
                        } else if (item.htmlElement) {
                            const convertedMd = htmlToMarkdown(item.htmlElement);
                            md += `${t.mdFullContent}\n\n${convertedMd}\n\n`;
                        } else {
                            md += `${t.mdFullContent}\n\n${escapeMd(item.content)}\n\n`;
                        }
                        md += '---\n\n';
                    });
                }

                return {
                    blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
                    filename: `${base}.md`
                };
            }

            const body = deduplicatedScrollData.map((item) => item.responseText || item.userText || '').join('\n\n');
            return {
                blob: new Blob([body], { type: 'text/plain;charset=utf-8' }),
                filename: `${base}.txt`
            };
        }

        function formatScrollDataForExport(sortedData, context) {
            const mode = getExportMode();
            const projectName = getProjectName();
            const ts = getCurrentTimestamp();
            const base = projectName;
            const deduplicatedData = deduplicateTurnData(sortedData);

            if (mode === 'txt') {
                const header = context === 'scroll' ? t.txtHeaderScroll : t.txtHeaderSDK;
                let body = `${header}\n=========================================\n\n`;
                deduplicatedData.forEach((item) => {
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
                    body += `${block.trim()}\n\n------------------------------\n\n`;
                });
                body = body.replace(/\n\n------------------------------\n\n$/, '\n').trim();
                return {
                    blob: new Blob([body], { type: 'text/plain;charset=utf-8' }),
                    filename: `${base}.txt`
                };
            }

            if (mode === 'json') {
                const arr = [];
                deduplicatedData.forEach((item) => {
                    if (item.userText) arr.push({ role: 'user', content: item.userText, id: `${item.domOrder}-user` });
                    if (item.thoughtText) arr.push({ role: 'thought', content: item.thoughtText, id: `${item.domOrder}-thought` });
                    if (item.responseText) arr.push({ role: 'assistant', content: item.responseText, id: `${item.domOrder}-assistant` });
                });
                return {
                    blob: new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json;charset=utf-8' }),
                    filename: `${base}.json`
                };
            }

            if (mode === 'md') {
                let md = `${t.mdHeaderScroll(projectName, context)}\n\n`;
                md += `${t.mdExportTime(ts)}\n\n`;
                deduplicatedData.forEach((item, idx) => {
                    md += `${t.mdTurn(idx + 1)}\n\n`;
                    if (item.userText) md += `${t.mdUser}\n\n${escapeMd(item.userText)}\n\n`;
                    if (item.thoughtText) md += `<details><summary>${t.mdAIThought}</summary>\n\n${escapeMd(item.thoughtText)}\n\n</details>\n\n`;

                    if (item.responseHtml) {
                        const responseMd = htmlToMarkdown(item.responseHtml);
                        md += `${t.mdAIResponse}\n\n${responseMd}\n\n`;
                    } else if (item.responseHtmlElements && item.responseHtmlElements.length > 0) {
                        const responseMd = item.responseHtmlElements.map((el) => htmlToMarkdown(el)).join('\n\n');
                        md += `${t.mdAIResponse}\n\n${responseMd}\n\n`;
                    } else if (item.responseText) {
                        md += `${t.mdAIResponse}\n\n${escapeMd(item.responseText)}\n\n`;
                    }

                    md += '---\n\n';
                });
                return {
                    blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }),
                    filename: `${base}.md`
                };
            }

            const body = deduplicatedData.map((item) => item.responseText || item.userText || '').join('\n\n');
            return {
                blob: new Blob([body], { type: 'text/plain;charset=utf-8' }),
                filename: `${base}.txt`
            };
        }

        function collectSortedData(collectedData) {
            const sorted = [];
            if (!collectedData || typeof collectedData.has !== 'function') return sorted;

            if (document.querySelector('#chat-history .conversation-container')) {
                const containers = document.querySelectorAll('#chat-history .conversation-container');
                containers.forEach((container) => {
                    if (collectedData.has(container)) sorted.push(collectedData.get(container));
                });
                return sorted;
            }

            const turns = document.querySelectorAll('ms-chat-turn');
            turns.forEach((turn) => {
                if (collectedData.has(turn)) sorted.push(collectedData.get(turn));
            });
            return sorted;
        }

        function triggerBlobDownload(pack) {
            if (!pack || !pack.blob || !pack.filename) {
                throw new Error('Invalid export package.');
            }

            const link = document.createElement('a');
            const url = URL.createObjectURL(pack.blob);
            link.href = url;
            link.download = pack.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        return {
            extractCanvasContent,
            formatCanvasDataForExport,
            formatCombinedDataForExport,
            formatScrollDataForExport,
            collectSortedData,
            triggerBlobDownload
        };
    }

    window.GeminiExportPipeline = {
        createExportPipeline
    };
})();
