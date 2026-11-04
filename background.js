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

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "openOptions") {
    return browser.runtime.openOptionsPage();
  }
});
