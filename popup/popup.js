const STORAGE_KEY = "snippets";

const replaceBtn = document.getElementById("replaceBtn");
const keywordSelect = document.getElementById("keywordSelect");
const configureBtn = document.getElementById("configureBtn");
const statusEl = document.getElementById("status");

async function getSnippets() {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function getComposeTab() {
  const candidates = [];

  try {
    candidates.push(...(await browser.tabs.query({ active: true, currentWindow: true })));
  } catch (e) {
    // ignore, try next source
  }

  try {
    const wins = await browser.windows.getAll({ populate: true, windowTypes: ["messageCompose"] });
    for (const win of wins) {
      candidates.push(...(win.tabs || []));
    }
  } catch (e) {
    // ignore, try next source
  }

  try {
    const win = await browser.windows.getLastFocused({ populate: true });
    if (win && win.tabs) {
      candidates.push(...win.tabs);
    }
  } catch (e) {
    // ignore, try next source
  }

  for (const tab of candidates) {
    try {
      const win = await browser.windows.get(tab.windowId);
      if (win.type === "messageCompose") {
        return tab;
      }
    } catch (e) {
      return tab;
    }
  }

  try {
    const tabs = await browser.tabs.query({ windowType: "messageCompose" });
    if (tabs.length > 0) {
      return tabs[0];
    }
  } catch (e) {
    // ignore
  }

  return null;
}

function showStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
}

/* The two functions below are serialized and executed inside the compose
 * window via tabs.executeScript. They operate on the editable message body
 * in the "content-frame" iframe. */

function ktiReplaceKeywords(pairs) {
  const frame = document.getElementById("content-frame");
  if (!frame || !frame.contentDocument) {
    return -1;
  }
  const doc = frame.contentDocument;
  if (!doc.body) {
    return -1;
  }
  let replaced = 0;
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
  for (const node of textNodes) {
    let value = node.nodeValue;
    for (const pair of pairs) {
      if (pair.keyword) {
        value = value.split(pair.keyword).join(pair.text);
      }
    }
    if (value !== node.nodeValue) {
      node.nodeValue = value;
      replaced++;
    }
  }
  return replaced;
}

function ktiInsertAtCursor(text) {
  const frame = document.getElementById("content-frame");
  if (!frame || !frame.contentDocument) {
    return false;
  }
  const doc = frame.contentDocument;
  if (!doc.body) {
    return false;
  }
  doc.body.focus();
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || !doc.body.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return doc.execCommand("insertText", false, text);
}

async function runInCompose(message, fn, arg) {
  try {
    const resp = await browser.runtime.sendMessage(message);
    if (resp && typeof resp === "object" && "value" in resp) {
      return { value: resp.value };
    }
  } catch (e) {
    // no compose script reachable; fall back to direct tab injection
  }
  return runInComposeTab(fn, arg);
}

async function runInComposeTab(fn, arg) {
  const tab = await getComposeTab();
  if (!tab) {
    return { error: "No compose window found" };
  }
  const code = "(" + fn.toString() + ")(" + JSON.stringify(arg) + ");";
  try {
    const results = await browser.tabs.executeScript(tab.id, { code });
    return { value: Array.isArray(results) ? results[0] : null };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

async function init() {
  const snippets = (await getSnippets()).filter((s) => s.keyword);

  keywordSelect.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = snippets.length ? "— choose a keyword —" : "— no keywords configured —";
  keywordSelect.appendChild(placeholder);
  for (const snippet of snippets) {
    const option = document.createElement("option");
    option.value = snippet.keyword;
    option.textContent = snippet.keyword;
    keywordSelect.appendChild(option);
  }

  replaceBtn.addEventListener("click", async () => {
    const all = await getSnippets();
    const pairs = all.filter((s) => s.keyword && s.text);
    if (pairs.length === 0) {
      showStatus("No keywords configured");
      return;
    }
    const result = await runInCompose({ type: "kti:replace", pairs }, ktiReplaceKeywords, pairs);
    if (result.error) {
      showStatus(result.error);
    } else if (result.value === null || result.value < 0) {
      showStatus("Could not access the message body");
    } else {
      showStatus("Replaced in " + result.value + (result.value === 1 ? " place" : " places"));
    }
  });

  keywordSelect.addEventListener("change", async () => {
    const keyword = keywordSelect.value;
    if (!keyword) {
      return;
    }
    const all = await getSnippets();
    const snippet = all.find((s) => s.keyword === keyword);
    keywordSelect.value = "";
    if (!snippet) {
      return;
    }
    const result = await runInCompose({ type: "kti:insert", text: snippet.text }, ktiInsertAtCursor, snippet.text);
    if (result.error) {
      showStatus(result.error);
    } else {
      showStatus(result.value ? "Inserted" : "Insert failed");
    }
  });

  configureBtn.addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "openOptions" });
    window.close();
  });
}

init();
