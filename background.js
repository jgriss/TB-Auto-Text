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

/* Fallback injectable used when no compose script is listening (mirrors
 * the logic in compose/compose-script.js). */
function ktiEscapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ktiGetDoc() {
  if (document.body && (document.body.isContentEditable || document.designMode === "on")) {
    return document;
  }
  const frame = document.getElementById("content-frame") || document.querySelector("iframe");
  if (frame) {
    try {
      if (frame.contentDocument && frame.contentDocument.body) {
        return frame.contentDocument;
      }
    } catch (e) {
      // ignore
    }
  }
  return document.body ? document : null;
}

function ktiReplaceKeywords(pairs) {
  const doc = ktiGetDoc();
  if (!doc || !doc.body) {
    return -1;
  }
  const active = pairs.filter((p) => p.keyword);
  const map = new Map(active.map((p) => [p.keyword, p.text]));
  const re = new RegExp(
    active.map((p) => ktiEscapeRegExp(p.keyword)).sort((a, b) => b.length - a.length).join("|"),
    "g"
  );
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const name = node.parentNode ? node.parentNode.nodeName : "";
      if (name === "SCRIPT" || name === "STYLE") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  let replaced = 0;
  for (const node of textNodes) {
    const text = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) {
      continue;
    }
    re.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
      }
      const parts = String(map.get(m[0])).split("\n");
      parts.forEach((part, i) => {
        if (i > 0) {
          frag.appendChild(doc.createElement("br"));
        }
        if (part) {
          frag.appendChild(doc.createTextNode(part));
        }
      });
      last = m.index + m[0].length;
      replaced++;
    }
    if (last < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(last)));
    }
    node.parentNode.replaceChild(frag, node);
  }
  return replaced;
}

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
    return;
  } catch (e) {
    // no compose script listening; fall back to direct injection below
  }
  try {
    const wins = await browser.windows.getAll({ populate: true, windowTypes: ["messageCompose"] });
    const code =
      "var ktiGetDoc = " + ktiGetDoc.toString() + ";" +
      "var ktiEscapeRegExp = " + ktiEscapeRegExp.toString() + ";" +
      "(" + ktiReplaceKeywords.toString() + ")(" + JSON.stringify(pairs) + ");";
    for (const win of wins) {
      for (const tab of win.tabs || []) {
        try {
          await browser.tabs.executeScript(tab.id, { code });
        } catch (e) {
          // ignore individual failures
        }
      }
    }
  } catch (e) {
    console.error("replace-keywords command failed:", e);
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "openOptions") {
    return browser.runtime.openOptionsPage();
  }
});
