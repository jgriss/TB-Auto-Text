const CONFIG_KEY = "config";

const DEFAULT_CONFIG = {
  targetAddress: "",
  subject: "Adapted PDF",
  saveDirectory: "pdf-mailer",
  command: ""
};

const targetAddressEl = document.getElementById("targetAddress");
const subjectEl = document.getElementById("subject");
const saveDirectoryEl = document.getElementById("saveDirectory");
const commandEl = document.getElementById("command");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

let saveTimer = null;

async function loadConfig() {
  const data = await browser.storage.local.get(CONFIG_KEY);
  return Object.assign({}, DEFAULT_CONFIG, data[CONFIG_KEY] || {});
}

function fillForm(config) {
  targetAddressEl.value = config.targetAddress || "";
  subjectEl.value = config.subject || "";
  saveDirectoryEl.value = config.saveDirectory || "";
  commandEl.value = config.command || "";
}

function collectConfig() {
  return {
    targetAddress: targetAddressEl.value.trim(),
    subject: subjectEl.value,
    saveDirectory: saveDirectoryEl.value.trim(),
    command: commandEl.value
  };
}

async function save() {
  await browser.storage.local.set({ [CONFIG_KEY]: collectConfig() });
  statusEl.textContent = "Saved";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

async function init() {
  fillForm(await loadConfig());
}

targetAddressEl.addEventListener("input", scheduleSave);
subjectEl.addEventListener("input", scheduleSave);
saveDirectoryEl.addEventListener("input", scheduleSave);
commandEl.addEventListener("input", scheduleSave);

saveBtn.addEventListener("click", save);

init();
