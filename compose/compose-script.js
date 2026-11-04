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

function ktiEscapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ktiTextToFragment(doc, text) {
  const frag = doc.createDocumentFragment();
  const parts = String(text).split("\n");
  parts.forEach((part, i) => {
    if (i > 0) {
      frag.appendChild(doc.createElement("br"));
    }
    if (part) {
      frag.appendChild(doc.createTextNode(part));
    }
  });
  return frag;
}

function ktiReplaceKeywords(pairs) {
  const found = ktiGetDoc();
  if (!found.doc || !found.doc.body) {
    return { value: -1, diag: found.diag };
  }
  const doc = found.doc;
  const active = pairs.filter((p) => p.keyword);
  const map = new Map(active.map((p) => [p.keyword, p.text]));
  const re = new RegExp(
    active.map((p) => ktiEscapeRegExp(p.keyword)).sort((a, b) => b.length - a.length).join("|"),
    "g"
  );
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
      frag.appendChild(ktiTextToFragment(doc, map.get(m[0])));
      last = m.index + m[0].length;
      replaced++;
    }
    if (last < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(last)));
    }
    node.parentNode.replaceChild(frag, node);
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
  const html = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>");
  let ok = doc.execCommand("insertHTML", false, html);
  if (!ok) {
    ok = doc.execCommand("insertText", false, text);
  }
  return { value: ok, diag: found.diag };
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
