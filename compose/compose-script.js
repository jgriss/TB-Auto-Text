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
  const frame =
    document.getElementById("content-frame") ||
    document.querySelector("iframe") ||
    null;
  if (frame) {
    try {
      const fdoc = frame.contentDocument;
      if (fdoc && fdoc.body) {
        return {
          doc: fdoc,
          diag: "iframe " + (frame.id || "(no id)") +
            " editable=" + fdoc.body.isContentEditable +
            " designMode=" + fdoc.designMode
        };
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

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "kti:ping") {
    const found = ktiGetDoc();
    sendResponse({ ok: true, result: { value: found.doc ? 1 : 0, diag: found.diag } });
  } else if (message.type === "kti:replace") {
    sendResponse({ ok: true, result: ktiReplaceKeywords(message.pairs || []) });
  } else if (message.type === "kti:insert") {
    sendResponse({ ok: true, result: ktiInsertAtCursor(message.text || "") });
  }
});
