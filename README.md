# Simulator Script Editor Enhancer

Minimal browser extension for Simulator.Company script editor.

## Structure

```
browser-extension/
├── manifest.json    # Extension manifest
├── content.js       # Content script
└── README.md        # Documentation
```

## Installation (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

## Target Pages

- `*://*.simulator.company/script/*/edit/*`
