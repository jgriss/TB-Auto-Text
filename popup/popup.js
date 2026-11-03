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
  const win = await browser.windows.getLastFocused();
  if (win) {
    const tabs = await browser.tabs.query({ windowId: win.id, windowType: "messageCompose" });
    if (tabs.length > 0) {
      return tabs[0];
    }
  }
  const tabs = await browser.tabs.query({ windowType: "messageCompose" });
  return tabs.length > 0 ? tabs[0] : null;
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

async function runInComposeTab(fn, arg) {
  const tab = await getComposeTab();
  if (!tab) {
    showStatus("No compose window");
    return null;
  }
  const code = "(" + fn.toString() + ")(" + JSON.stringify(arg) + ");";
  const results = await browser.tabs.executeScript(tab.id, { code });
  return Array.isArray(results) ? results[0] : null;
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
    const replaced = await runInComposeTab(ktiReplaceKeywords, pairs);
    if (replaced === null || replaced < 0) {
      showStatus("No compose window");
    } else {
      showStatus("Replaced in " + replaced + (replaced === 1 ? " place" : " places"));
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
    const ok = await runInComposeTab(ktiInsertAtCursor, snippet.text);
    showStatus(ok ? "Inserted" : "Insert failed");
  });

  configureBtn.addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "openOptions" });
    window.close();
  });
}

init();
