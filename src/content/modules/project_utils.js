(function () {
    'use strict';

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

    function getProjectName() {
        try {
            const titleElement = document.querySelector('.top-bar-actions .conversation-title, .selected  .conversation-title');
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
        } catch (error) {
            console.warn('Gemini 项目名提取失败，回退 XPath', error);
        }

        const xpath = '/html/body/app-root/ms-app/div/div/div/div/span/ms-prompt-switcher/ms-chunk-editor/section/ms-toolbar/div/div[1]/div/div/h1';
        const defaultName = 'GeminiChat';
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const titleElement = result.singleNodeValue;
            if (titleElement && titleElement.textContent) {
                const cleanName = titleElement.textContent.trim().replace(/[\\/:\*\?"<>\|]/g, '_');
                return cleanName || defaultName;
            }
        } catch (_) { }

        return defaultName;
    }

    window.GeminiExportProjectUtils = {
        getCurrentTimestamp,
        getProjectName
    };
})();
