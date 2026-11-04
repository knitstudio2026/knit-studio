i<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Service Unavailable</title>
    <style>
        :root,
        [data-trae-theme="dark"] {
            --trae-bg-page: #1e1e1e;
            --trae-bg-overlay-l2: rgba(255, 255, 255, 0.08);
            --trae-bg-overlay-l3: rgba(255, 255, 255, 0.12);
            --trae-text-secondary: rgba(245, 249, 254, 0.5);
            --trae-text-tertiary: rgba(245, 249, 254, 0.4);
            --trae-icon-secondary: rgba(245, 249, 254, 0.5);
        }
        [data-trae-theme="light"] {
            --trae-bg-page: #ffffff;
            --trae-bg-overlay-l2: rgba(0, 0, 0, 0.06);
            --trae-bg-overlay-l3: rgba(0, 0, 0, 0.08);
            --trae-text-secondary: rgba(31, 35, 40, 0.5);
            --trae-text-tertiary: rgba(31, 35, 40, 0.4);
            --trae-icon-secondary: rgba(31, 35, 40, 0.5);
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: var(--trae-bg-page);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .error-panel {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            padding: 16px;
        }
        .content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            max-width: 300px;
        }
        .icon {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--trae-icon-secondary);
        }
        .text-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            width: 100%;
        }
        .title {
            font-size: 13px;
            font-weight: 400;
            line-height: 20px;
            color: var(--trae-text-secondary);
            text-align: center;
        }
        .description {
            font-size: 12px;
            font-weight: 400;
            line-height: 18px;
            color: var(--trae-text-tertiary);
            text-align: center;
        }
        .action {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 4px;
        }
        .retry-btn {
            padding: 6px 16px;
            font-size: 13px;
            font-weight: 500;
            color: var(--trae-text-secondary);
            background: var(--trae-bg-overlay-l2);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .retry-btn:hover {
            background: var(--trae-bg-overlay-l3);
        }
        .retry-btn:active {
            background: var(--trae-bg-overlay-l3);
        }
    </style>
    <script src="https://lf3-static.bytednsdoc.com/obj/eden-cn/lkpkbvsj/ljhwZthlaukjlkulzlp/previewer-tools/previewer-tools.20260827.umd.js"></script>
    <script>
        var isInIframe = window !== window.parent;
        var hasPreviewerTools = !!window.PreviewerTools;
        if (isInIframe && hasPreviewerTools) {
            window.PreviewerTools.notifyServiceUnavailable();
        }
    </script>
</head>
<body>
    <div class="error-panel">
        <div class="content">
            <div class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="18.5" stroke="currentColor" stroke-width="3.2"/>
                    <path d="M18.3438 30.8431C21.4679 27.719 26.5333 27.719 29.6575 30.8431" stroke="currentColor" stroke-width="3.2" stroke-linecap="square" stroke-linejoin="round"/>
                    <path d="M16.7002 17.6992L20.3002 21.2992M20.3002 17.6992L16.7002 21.2992" stroke="currentColor" stroke-width="3.2" stroke-linecap="square"/>
                    <path d="M27.7002 17.6992L31.3002 21.2992M31.3002 17.6992L27.7002 21.2992" stroke="currentColor" stroke-width="3.2" stroke-linecap="square"/>
                </svg>
            </div>
            <div class="text-content">
                <div class="title" data-i18n="serverNotAvailableTitle">Service not running</div>
                <div class="description" data-i18n="serverNotAvailableDescription">The service has stopped or hasn't been started yet.</div>
            </div>
            <div class="action">
                <button class="retry-btn" data-i18n="retry" onclick="location.reload()">Retry</button>
            </div>
        </div>
    </div>
</body>
</html>
