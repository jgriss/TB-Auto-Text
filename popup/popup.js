const STORAGE_KEY = "snippets";

const replaceBtn = document.getElementById("replaceBtn");
const keywordSelect = document.getElementById("keywordSelect");
const configureBtn = document.getElementById("configureBtn");
const statusEl = document.getElementById("status");

async function getSnippets() {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

function showStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 4000);
}

function describe(result) {
  if (result.error) {
    return result.error;
  }
  if (result.value === null || result.value === undefined || result.value < 0) {
    return "Could not access the message body" + (result.diag ? " (" + result.diag + ")" : "");
  }
  return null;
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

/* The two functions below are serialized and executed inside the compose
 * window via tabs.executeScript as a fallback when no compose script is
 * listening. They mirror compose/compose-script.js and operate on the
 * editable message document. */

function ktiGetDoc() {
  const tried = [];
  if (document.body && (document.body.isContentEditable || document.designMode === "on")) {
    return { doc: document, diag: "main document editable" };
  }
  tried.push(
    "main: body=" + (document.body ? "yes" : "no") +
    " editable=" + (document.body ? document.body.isContentEditable : "-") +
    " designMode=" + document.designMode
  );
  const frame = document.getElementById("content-frame") || document.querySelector("iframe") || null;
  if (frame) {
    try {
      const fdoc = frame.contentDocument;
      if (fdoc && fdoc.body) {
        return { doc: fdoc, diag: "iframe " + (frame.id || "(no id)") };
      }
      tried.push("iframe " + (frame.id || "?") + ": no body");
    } catch (e) {
      tried.push("iframe " + (frame.id || "?") + " access error: " + e.message);
    }
  } else {
    tried.push("no iframe found");
  }
  return { doc: null, diag: tried.join("; ") };
}

function ktiReplaceKeywords(pairs) {
  const found = ktiGetDoc();
  if (!found.doc || !found.doc.body) {
    return { value: -1, diag: found.diag };
  }
  const doc = found.doc;
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
  return { value: replaced, diag: found.diag };
}

function ktiInsertAtCursor(text) {
  const found = ktiGetDoc();
  if (!found.doc || !found.doc.body) {
    return { value: false, diag: found.diag };
  }
  const doc = found.doc;
  doc.body.focus();
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || !doc.body.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return { value: doc.execCommand("insertText", false, text), diag: found.diag };
}

async function runInComposeTab(fn, arg) {
  const tab = await getComposeTab();
  if (!tab) {
    return { error: "No compose window found" };
  }
  const code = "(" + fn.toString() + ")(" + JSON.stringify(arg) + ");";
  try {
    const results = await browser.tabs.executeScript(tab.id, { code });
    const r = Array.isArray(results) ? results[0] : null;
    if (r && typeof r === "object" && "value" in r) {
      return { value: r.value, diag: r.diag };
    }
    return { value: r };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

async function runInCompose(message, fn, arg) {
  try {
    const resp = await browser.runtime.sendMessage(message);
    if (resp && typeof resp === "object" && resp.result && "value" in resp.result) {
      return { value: resp.result.value, diag: resp.result.diag };
    }
  } catch (e) {
    // no compose script reachable; fall back to direct tab injection
  }
  return runInComposeTab(fn, arg);
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
    const problem = describe(result);
    if (problem) {
      showStatus(problem);
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
    const problem = describe(result);
    if (problem) {
      showStatus(problem);
    } else {
      showStatus(result.value ? "Inserted" : "Insert failed" + (result.diag ? " (" + result.diag + ")" : ""));
    }
  });

  configureBtn.addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "openOptions" });
    window.close();
  });
}

init();
