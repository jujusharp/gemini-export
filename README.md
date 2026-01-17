# Gemini Export Chrome Extension

A Chrome Extension that allows users to export their entire Gemini chat history to local storage. Supports exporting as Markdown and JSON formats, with each conversation saved as a separate file.

## Features

- **Bulk Export**: Export all historical chats in one click.
- **Multiple Formats**: Support for Markdown (`.md`) and JSON (`.json`).
- **Organized Output**: Downloads a `.zip` file containing all chats, named by their title or date.
- **Privacy Focused**: Runs entirely locally in your browser. No data is sent to external servers.

## Installation

1. Clone this repository or download the source code.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked**.
5. Select the directory where you downloaded this project.

## Usage

1. Open [Gemini](https://gemini.google.com/).
2. Click the extension icon in the toolbar.
3. Select your desired formats (Markdown, JSON).
4. Click **Export**.
5. Wait for the process to finish and the ZIP file will automatically download.

## Project Structure

```
gemini-export/
├── manifests.json      # Extension configuration
├── assets/             # Icons and images
├── src/
│   ├── background/     # Service worker (orchestration)
│   ├── content/        # Content scripts (DOM interaction)
│   ├── popup/          # UI for the extension
│   ├── lib/            # Utilities (formatting, zipping)
│   └── utils/          # Shared helpers
└── README.md           # This file
```

## Tech Stack

- **HTML/CSS/JS**: Core technologies.
- **Manifest V3**: The latest Chrome Extension standard.
- **JSZip**: For bundling files into a single download.

## Development

1. Make changes to the code in `src/`.
2. Go to `chrome://extensions/` and click the refresh icon on the Gemini Export card.
3. Test the changes on the Gemini website.
