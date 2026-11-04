# Keyword Text Inserter (Thunderbird extension)

A Thunderbird MailExtension that manages keyword → text-passage pairs and uses
them while writing emails.

## Features

1. **Configuration dialog** — open the add-on's options page
   (Add-on Manager → Keyword Text Inserter → Preferences, or click
   "Configure keywords…" in the compose popup) to add, edit, and delete
   keyword/text-passage pairs. Saved automatically to `storage.local`.
2. **Replace button in the email window** — the compose-window toolbar button
   opens a popup with a "Replace keywords in this email" button. Clicking it
   scans the draft body and replaces every occurrence of each defined keyword
   with its associated text passage.
3. **Keyword dropdown in the email window** — the same popup contains a
   dropdown listing only the keywords. Selecting one inserts the associated
   text passage at the current cursor position in the draft (falling back to
   the end of the body if the cursor is not in the text).

## How it works

- `manifest.json` registers a `compose_action` (toolbar button in every
  compose window) with `popup/popup.html`, and an `options_ui` page.
- `background.js` registers a `composeScripts` content script
  (`compose/compose-script.js`) that is injected into every compose window
  and performs the text replacement / cursor insertion directly in the
  editable message document.
- `popup/popup.js` reads the pairs from storage and sends them to the compose
  script via `browser.runtime.sendMessage()`. As a fallback (e.g. compose
  window opened before the add-on was loaded) it locates the compose tab via
  the windows/tabs APIs and injects the code with `browser.tabs.executeScript()`
  (allowed by the `compose` permission).
- `options/options.js` provides the CRUD UI for the pairs.
- `background.js` seeds a few example entries on first install.

## Install (development)

1. Open Thunderbird → ☰ → Add-ons and Themes → gear icon → "Debug Add-ons"
   (or `about:debugging` → "This Thunderbird" → "Load Temporary Add-on…").
2. Select `manifest.json` from this folder.

To package: zip the folder contents into `keyword-text-inserter.xpi` and
install it via Add-ons and Themes → "Install Add-on From File…".

## Requirements

Thunderbird 115 or newer (uses the `compose` permission for
`tabs.executeScript` in compose windows).
