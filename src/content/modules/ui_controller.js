(function () {
    'use strict';

    function createUiController(options = {}) {
        const t = options.t || {};
        const onExportClick = typeof options.onExportClick === 'function'
            ? options.onExportClick
            : () => { };
        const onReady = typeof options.onReady === 'function'
            ? options.onReady
            : () => { };

        let exportButton = null;
        let statusDiv = null;

        function init() {
            console.log('Creating Export Button...');

            exportButton = document.createElement('button');
            exportButton.id = 'gemini-quick-export-btn';
            exportButton.title = t.btnExport || 'Export';
            exportButton.style.cssText = `
                position: fixed;
                bottom: 30px;
                right: 30px;
                width: 46px;
                height: 46px;
                padding: 0;
                background: var(--ge-primary, #1a73e8);
                color: #fff;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                z-index: 10000;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            exportButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
            exportButton.addEventListener('click', () => {
                Promise.resolve(onExportClick()).catch((error) => {
                    console.error('Gemini Export: export click handler failed', error);
                });
            });
            exportButton.addEventListener('mouseenter', () => {
                exportButton.style.transform = 'translateY(-2px) scale(1.05)';
            });
            exportButton.addEventListener('mouseleave', () => {
                exportButton.style.transform = 'translateY(0) scale(1)';
            });
            document.body.appendChild(exportButton);

            statusDiv = document.createElement('div');
            statusDiv.id = 'ge-status-toast';
            statusDiv.style.cssText = `
                position: fixed;
                bottom: 90px;
                right: 30px;
                padding: 10px 16px;
                background: #333;
                color: #fff;
                border-radius: 8px;
                font-size: 13px;
                z-index: 10001;
                opacity: 0;
                transition: opacity 0.3s;
                pointer-events: none;
                font-family: system-ui;
            `;
            document.body.appendChild(statusDiv);

            onReady();
            console.log(t.logUICreated || 'UI Created');
        }

        function updateStatus(message) {
            if (statusDiv) {
                statusDiv.textContent = message;
                statusDiv.style.opacity = message ? '1' : '0';
            }
            console.log(`[Status] ${message}`);
        }

        function getExportButton() {
            return exportButton;
        }

        return {
            init,
            updateStatus,
            getExportButton
        };
    }

    window.GeminiExportUiController = {
        createUiController
    };
})();
