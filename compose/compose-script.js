function ktiGetDoc() {
  if (document.body && document.body.isContentEditable) {
    return document;
  }
  const frame = document.getElementById("content-frame");
  if (frame && frame.contentDocument && frame.contentDocument.body) {
    return frame.contentDocument;
  }
  return document;
}

function ktiReplaceKeywords(pairs) {
  const doc = ktiGetDoc();
  if (!doc || !doc.body) {
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
  const doc = ktiGetDoc();
  if (!doc || !doc.body) {
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

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "kti:replace") {
    sendResponse({ ok: true, value: ktiReplaceKeywords(message.pairs || []) });
  } else if (message.type === "kti:insert") {
    sendResponse({ ok: true, value: ktiInsertAtCursor(message.text || "") });
  }
});
