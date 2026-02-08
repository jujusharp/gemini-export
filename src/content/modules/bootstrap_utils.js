(function () {
    'use strict';

    function setupTrustedTypes() {
        if (!(window.trustedTypes && window.trustedTypes.createPolicy)) return;

        try {
            if (!window.trustedTypes.defaultPolicy) {
                window.trustedTypes.createPolicy('default', {
                    createHTML: (string) => string,
                    createScript: (string) => string,
                    createScriptURL: (string) => string
                });
            }
        } catch (error) {
            try {
                window.trustedTypes.createPolicy('userscript-fallback', {
                    createHTML: (string) => string,
                    createScript: (string) => string,
                    createScriptURL: (string) => string
                });
            } catch (fallbackError) {
                console.warn('TrustedTypes 策略创建失败，但脚本将继续运行', fallbackError);
            }
        }
    }

    function loadSelectorConfig(defaultSelectors = {}, options = {}) {
        const storageKey = options.storageKey || 'gemini_export_selectors';
        const loadedLog = options.loadedLog || 'Gemini Export: 已加载自定义选择器';
        const failedLog = options.failedLog || 'Gemini Export: 加载自定义选择器失败';

        let selectors = { ...defaultSelectors };
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                selectors = { ...selectors, ...parsed };
                console.log(loadedLog, selectors);
            }
        } catch (error) {
            console.warn(failedLog, error);
        }

        return selectors;
    }

    window.GeminiExportBootstrap = {
        setupTrustedTypes,
        loadSelectorConfig
    };
})();
