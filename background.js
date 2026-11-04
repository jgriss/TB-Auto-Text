const STORAGE_KEY = "snippets";

const DEFAULT_SNIPPETS = [
  { keyword: "sig", text: "Best regards,\nJohn Doe" },
  { keyword: "thanks", text: "Thank you for your message." },
  { keyword: "meeting", text: "I am available for a meeting on Monday or Tuesday afternoon." }
];

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const data = await browser.storage.local.get(STORAGE_KEY);
    if (!Array.isArray(data[STORAGE_KEY])) {
      await browser.storage.local.set({ [STORAGE_KEY]: DEFAULT_SNIPPETS });
    }
  }
});

browser.composeScripts
  .register({ js: [{ file: "compose/compose-script.js" }] })
  .catch((err) => console.error("composeScripts registration failed:", err));

async function injectIntoOpenComposeWindows() {
  try {
    const wins = await browser.windows.getAll({ populate: true, windowTypes: ["messageCompose"] });
    for (const win of wins) {
      for (const tab of win.tabs || []) {
        try {
          await browser.tabs.executeScript(tab.id, { file: "compose/compose-script.js" });
        } catch (e) {
          // ignore individual failures
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

injectIntoOpenComposeWindows();

browser.commands.onCommand.addListener(async (command) => {
  if (command !== "replace-keywords") {
    return;
  }
  const data = await browser.storage.local.get(STORAGE_KEY);
  const pairs = (Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : []).filter(
    (s) => s.keyword && s.text
  );
  if (pairs.length === 0) {
    return;
  }
  try {
    await browser.runtime.sendMessage({ type: "kti:replace", pairs });
  } catch (e) {
    console.error("replace-keywords command failed:", e);
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "openOptions") {
    return browser.runtime.openOptionsPage();
  }
});
