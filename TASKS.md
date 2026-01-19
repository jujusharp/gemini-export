# Project Tasks & Roadmap

## Phase 1: Core Setup & Infrastructure [Completed]
- [x] **Project Initialization**: Directory structure, Git, and basic configuration.
- [x] **Manifest V3**: Configuration for `activeTab`, `scripting`, `downloads`, `storage`.
- [x] **Asset Management**: Icons and static resources.
- [x] **Build System**: Basic file structure for `src/` (background, content, popup, lib).

## Phase 2: Data Extraction & DOM Interaction [Completed]
- [x] **Chat Retrieval**: Logic to identify and traverse `conversation-container`.
- [x] **Scroll Handling**: Automated scrolling to load full chat history `handleScrollExtraction`.
- [x] **Canvas Support**: Extraction of "Canvas" content (separate code/artifact windows).
- [x] **Dynamic Selectors**: System to handle DOM class name changes (`SELECTORS` config).

## Phase 3: Data Processing & Formatting [Completed]
- [x] **Markdown Engine**: Integration of `turndown` and `gfm` plugin for high-quality Markdown.
- [x] **Format options**: Support for Markdown (`.md`), JSON (`.json`), and Text (`.txt`).
- [x] **Content Parsing**:
    - [x] Code blocks with language detection.
    - [x] Tables and lists.
    - [x] Model "Thoughts" (Chain of Thought) extraction.
    - [x] User queries and Model responses.

## Phase 4: User Interface & Experience [Completed]
- [x] **Popup UI**:
    - [x] Language Switcher (English / Chinese).
    - [x] Export Format Selection (MD / JSON / TXT).
    - [x] Export Scope (Dialog / Canvas / Both).
- [x] **In-Page UI**: Floating "Export" button injected into Gemini page.
- [x] **Feedback System**: Toast notifications for progress (Scanning, Processing, Success/Error).
- [x] **Theming**: Auto-detection of Light/Dark mode.

## Phase 5: Export Handling [Completed]
- [x] **File Bundling**: `JSZip` integration for zipping multiple files (Dialog + Canvas).
- [x] **Filename Generation**: Intelligent naming based on conversation title or timestamp.
- [x] **Download Manager**: Triggering browser downloads via `chrome.downloads`.

## Phase 6: Maintenance & Future Improvements [In Progress]
- [ ] **Selector Robustness**: Improve the "Dynamic Selector" mechanism to better adapt to silent Gemini A/B tests.
- [ ] **Performance Optimization**: Optimize memory usage for extremely long conversations (virtualized scrolling handling).
- [ ] **Rich Media**: Better handling of images or file attachments in chat exports.
- [ ] **Code Cleanup**: Refactor `content_script.js` to split logic into smaller modules (ES modules if possible in content scripts).
