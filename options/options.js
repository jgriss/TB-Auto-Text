const STORAGE_KEY = "snippets";

const rowsEl = document.getElementById("rows");
const addBtn = document.getElementById("addBtn");
const statusEl = document.getElementById("status");

let saveTimer = null;

async function loadSnippets() {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

function createRow(snippet) {
  const entry = document.createElement("div");
  entry.className = "entry";

  const keywordInput = document.createElement("input");
  keywordInput.type = "text";
  keywordInput.placeholder = "keyword";
  keywordInput.value = snippet.keyword || "";

  const textInput = document.createElement("textarea");
  textInput.placeholder = "text passage inserted for this keyword";
  textInput.value = snippet.text || "";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "deleteBtn";
  deleteBtn.textContent = "\u00d7";
  deleteBtn.title = "Delete entry";

  keywordInput.addEventListener("input", scheduleSave);
  textInput.addEventListener("input", scheduleSave);
  deleteBtn.addEventListener("click", () => {
    entry.remove();
    scheduleSave();
  });

  entry.append(keywordInput, textInput, deleteBtn);
  return entry;
}

function collectSnippets() {
  const snippets = [];
  for (const entry of rowsEl.querySelectorAll(".entry")) {
    const [keywordInput, textInput] = entry.querySelectorAll("input, textarea");
    const keyword = keywordInput.value.trim();
    const text = textInput.value;
    if (keyword) {
      snippets.push({ keyword, text });
    }
  }
  return snippets;
}

async function save() {
  const snippets = collectSnippets();
  await browser.storage.local.set({ [STORAGE_KEY]: snippets });
  statusEl.textContent = "Saved";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

async function showHotkey() {
  const el = document.getElementById("hotkeyInfo");
  let text = "Shortcut: Ctrl+E (default).";
  try {
    const cmds = await browser.commands.getAll();
    const cmd = cmds.find((c) => c.name === "replace-keywords");
    if (cmd && cmd.shortcut) {
      text = "Current shortcut: " + cmd.shortcut + ".";
    }
  } catch (e) {
    // commands API unavailable; show default
  }
  el.textContent =
    text + " Press it in a compose window to replace all keywords in the draft. " +
    "To change it (e.g. to F4), open the Add-on Manager, click the gear icon, " +
    "choose \"Manage Extension Shortcuts\".";
}

async function init() {
  showHotkey();
  const snippets = await loadSnippets();
  rowsEl.textContent = "";
  for (const snippet of snippets) {
    rowsEl.appendChild(createRow(snippet));
  }
  if (snippets.length === 0) {
    rowsEl.appendChild(createRow({ keyword: "", text: "" }));
  }
}

addBtn.addEventListener("click", () => {
  rowsEl.appendChild(createRow({ keyword: "", text: "" }));
  rowsEl.lastElementChild.querySelector("input").focus();
});

init();
