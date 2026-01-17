# Project Tasks & Road Map

## Phase 1: Setup & Configuration
- [ ] **Project Initialization**: Set up directory structure and Git repository.
- [ ] **Manifest V3**: Create `manifest.json` with necessary permissions (`activeTab`, `scripting`, `downloads`, `storage`).
- [ ] **Assets**: Create/Add icons for the extension.

## Phase 2: Core Logic (Data Extraction)
- [ ] **Chat List Retrieval**: Reverse engineer the Gemini API or DOM to find the list of past conversations.
- [ ] **Chat Content Retrieval**: Implement logic to fetch the full content of a conversation given its ID.
- [ ] **Rate Limiting**: Implement delays between fetches to avoid rate-limiting/blocking by Google.

## Phase 3: Data Processing
- [ ] **Markdown Formatter**: Convert the internal chat representation into clean Markdown (preserving headers, code blocks, etc.).
- [ ] **JSON Formatter**: Structure the chat data into a standardized JSON schema.

## Phase 4: User Interface (Popup)
- [ ] **Popup UI**: Design a simple popup with:
    - "Export All" button.
    - Checkboxes for "Markdown" and "JSON".
    - Progress bar (e.g., "Exporting 5/20 chats...").
    - Cancel button.

## Phase 5: Export Handling
- [ ] **Zip Generation**: Use `JSZip` (or similar) to bundle all files.
- [ ] **Download Trigger**: Use the `chrome.downloads` API to save the generated zip file.

## Phase 6: Testing & Compiling
- [ ] **Manual Testing**: Test with various chat types (text only, code blocks, images).
- [ ] **Packaging**: Pack the extension for installation (`.crx` or zip for Developer Mode).
