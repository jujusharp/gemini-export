# Multi-Platform Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-class ChatGPT export support without further coupling Gemini-specific DOM logic into the shared export pipeline.

**Architecture:** Introduce a platform registry that centralizes URL detection, platform capabilities, DOM selectors, and title extraction. Keep the export/download pipeline generic, and move site-specific extraction, scroller hints, and anchor configuration behind platform-aware helpers.

**Tech Stack:** Chrome Extension (Manifest V3), plain JavaScript, Node test runner, JSDOM

---

### Task 1: Lock platform detection with tests

**Files:**
- Create: `tests/platforms.test.js`
- Create: `src/content/modules/platforms.js`

**Step 1: Write the failing test**

Assert that ChatGPT, Gemini, and AI Studio URLs resolve to distinct platform IDs and labels.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `platforms.js` does not exist yet.

**Step 3: Write minimal implementation**

Create a shared registry with `detectPlatformFromLocation` and `getPlatformConfig`.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: Platform detection test passes.

### Task 2: Lock ChatGPT turn extraction with tests

**Files:**
- Create: `tests/conversation_extractor.test.js`
- Modify: `src/content/modules/conversation_extractor.js`

**Step 1: Write the failing test**

Assert that ChatGPT message DOM is normalized into one user turn and one assistant turn.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because ChatGPT extraction is not implemented.

**Step 3: Write minimal implementation**

Add a platform-aware extractor entry point and a ChatGPT extractor that uses the provided selectors.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: ChatGPT extraction test passes.

### Task 3: Refactor shared runtime wiring

**Files:**
- Modify: `src/content/content_script.js`
- Modify: `src/content/modules/project_utils.js`
- Modify: `src/content/modules/scroller.js`
- Modify: `src/content/modules/anchor_panel.js`

**Step 1: Pass platform config through runtime**

Resolve current platform once and inject it into helpers.

**Step 2: Remove duplicated DOM guesses**

Replace Gemini-only selectors and title logic with platform-aware helpers.

**Step 3: Preserve Gemini behavior**

Keep existing Gemini and AI Studio extraction behavior intact.

**Step 4: Verify manually**

Check Gemini pages still render the floating export button and anchor panel.

### Task 4: Enable ChatGPT injection and update copy

**Files:**
- Modify: `manifest.json`
- Modify: `README.md`
- Modify: `src/popup/popup.js`

**Step 1: Expand host permissions/content script matches**

Allow injection on `https://chatgpt.com/*`.

**Step 2: Update user-facing naming**

Change extension copy from Gemini-only wording to multi-platform wording where appropriate.

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass.
