# PDF Mailer (Thunderbird extension)

A Thunderbird MailExtension that adds a button to the message reader. Clicking
it:

1. Checks that the displayed email contains **exactly one PDF attachment**
   (otherwise an error notification is shown and nothing else happens).
2. Saves the PDF into a configurable folder inside your Downloads folder.
3. Runs a configurable command line tool on the saved PDF, using `{pdf}` as a
   placeholder for the PDF file path.
4. Opens a new email to a configurable address with a configurable subject,
   with the adapted PDF attached.

## Configuration

Open Add-on Manager → PDF Mailer → Preferences and set:

- **Target email address** — recipient of the new email.
- **Subject of the new email**.
- **Save location** — subfolder of your Downloads folder for the PDF
  (default: `pdf-mailer`).
- **Command line tool** — command executed on the saved PDF;
  `{pdf}` is replaced with the shell-quoted file path
  (e.g. `pdf-stamp {pdf} -o {pdf}`). The file at `{pdf}` after the command
  finishes is used as the adapted PDF.

## How it works

- `manifest.json` registers a `message_display_action`, so the button appears
  in the header area of every message reader tab.
- `background.js` handles the button click (`messageDisplayAction.onClicked`):
  it reads the displayed message (`messageDisplay.getDisplayedMessage`),
  validates the single PDF attachment (`messages.listAttachments`), saves it
  (`messages.getAttachmentFile` + `downloads.download`), executes the command
  through a native messaging host, and opens the compose window
  (`compose.beginNew`) with the adapted PDF as attachment.
- Because MailExtensions cannot spawn processes directly, the command is run
  by the small native messaging host in `host/pdf_tool_host.py`.

## Native messaging host setup

1. Copy `host/pdf_tool_host.py` to e.g. `/usr/local/bin/pdf_tool_host.py` and
   make it executable (`chmod +x`).
2. Copy `host/com.example.pdftool.json` to the Thunderbird native messaging
   hosts directory and adjust `path` to the location of the script:
   - Linux: `~/.mozilla/native-messaging-hosts/com.example.pdftool.json`
   - macOS: `~/Library/Application Support/Mozilla/NativeMessagingHosts/com.example.pdftool.json`
   - Windows: register the key
     `HKEY_CURRENT_USER\SOFTWARE\Mozilla\NativeMessagingHosts\com.example.pdftool`
     with the JSON file path as default value.

The host speaks the standard native messaging protocol: it reads
`{"command": "...", "pdf": "/abs/path.pdf"}` from stdin, substitutes `{pdf}`,
runs the command with the shell, and returns
`{"ok": true, "data": "<base64 adapted PDF>"}` (or `{"ok": false, "error": ...}`).

## Install (development)

1. Open Thunderbird → ☰ → Add-ons and Themes → gear icon → "Debug Add-ons"
   (or `about:debugging` → "This Thunderbird" → "Load Temporary Add-on…").
2. Select `pdf-mailer/manifest.json`.

## Requirements

Thunderbird 115 or newer.
