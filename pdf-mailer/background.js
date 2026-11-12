const CONFIG_KEY = "config";
const NATIVE_HOST = "com.example.pdftool";

const DEFAULT_CONFIG = {
  targetAddress: "",
  subject: "Adapted PDF",
  saveDirectory: "pdf-mailer",
  command: ""
};

async function getConfig() {
  const data = await browser.storage.local.get(CONFIG_KEY);
  return Object.assign({}, DEFAULT_CONFIG, data[CONFIG_KEY] || {});
}

async function notify(title, message) {
  try {
    await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon.svg"),
      title,
      message
    });
  } catch (e) {
    console.error(title + ": " + message);
  }
}

function notifyError(message) {
  return notify("PDF Mailer - Error", message);
}

function sanitizeFileName(name) {
  const cleaned = String(name || "attachment.pdf")
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "_")
    .trim();
  return cleaned || "attachment.pdf";
}

function isPdfAttachment(attachment) {
  const type = String(attachment.contentType || "").toLowerCase();
  const name = String(attachment.name || "").toLowerCase();
  return type === "application/pdf" || type === "application/x-pdf" || name.endsWith(".pdf");
}

function waitForDownload(downloadId) {
  return new Promise((resolve, reject) => {
    const listener = (delta) => {
      if (delta.id !== downloadId) {
        return;
      }
      if (delta.state && delta.state.current === "complete") {
        browser.downloads.onChanged.removeListener(listener);
        resolve();
      }
      if (delta.state && delta.state.current === "interrupted") {
        browser.downloads.onChanged.removeListener(listener);
        reject(new Error("Saving the PDF was interrupted: " + (delta.error ? delta.error.current : "unknown error")));
      }
    };
    browser.downloads.onChanged.addListener(listener);
    browser.downloads.search({ id: downloadId }).then((items) => {
      if (items && items.length && items[0].state === "complete") {
        browser.downloads.onChanged.removeListener(listener);
        resolve();
      }
    });
  });
}

async function savePdf(file, config, fileName) {
  const dir = String(config.saveDirectory || "").replace(/^\/+|\/+$/g, "");
  const relPath = (dir ? dir + "/" : "") + fileName;
  const url = URL.createObjectURL(file);
  let downloadId;
  try {
    downloadId = await browser.downloads.download({
      url,
      filename: relPath,
      conflictAction: "overwrite",
      saveAs: false
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  await waitForDownload(downloadId);
  const items = await browser.downloads.search({ id: downloadId });
  if (!items || !items.length || !items[0].filename) {
    throw new Error("Could not determine the saved location of the PDF.");
  }
  return items[0].filename;
}

async function runCommandOnPdf(config, pdfPath) {
  if (!config.command || !config.command.trim()) {
    throw new Error("No command line tool configured. Open the add-on's options page to set one.");
  }
  const response = await browser.runtime.sendNativeMessage(NATIVE_HOST, {
    command: config.command,
    pdf: pdfPath
  });
  if (!response || !response.ok) {
    const detail = response && response.error ? response.error : "the native messaging host did not respond";
    throw new Error("Running the command line tool failed: " + detail);
  }
  if (!response.data) {
    throw new Error("The command line tool did not return the adapted PDF.");
  }
  return response.data;
}

function base64ToPdfFile(b64, fileName) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: "application/pdf" });
}

async function processDisplayedMessage(tab) {
  const message = await browser.messageDisplay.getDisplayedMessage(tab.id);
  if (!message) {
    throw new Error("No email is currently displayed.");
  }

  const attachments = (await browser.messages.listAttachments(message.id)) || [];
  const pdfs = attachments.filter(isPdfAttachment);
  if (pdfs.length !== 1) {
    throw new Error(
      "This email does not contain exactly one PDF attachment (found " + pdfs.length + ")."
    );
  }
  const pdf = pdfs[0];
  const fileName = sanitizeFileName(pdf.name);

  const config = await getConfig();
  if (!config.targetAddress || !config.targetAddress.trim()) {
    throw new Error("No target address configured. Open the add-on's options page to set one.");
  }

  const file = await browser.messages.getAttachmentFile(message.id, pdf.partName);
  const pdfPath = await savePdf(file, config, fileName);
  const adaptedBase64 = await runCommandOnPdf(config, pdfPath);
  const adaptedFile = base64ToPdfFile(adaptedBase64, fileName);

  await browser.compose.beginNew({
    to: [config.targetAddress.trim()],
    subject: config.subject || "",
    attachments: [{ file: adaptedFile, name: fileName }]
  });

  await notify("PDF Mailer", "New email with the adapted PDF " + fileName + " opened for " + config.targetAddress.trim() + ".");
}

browser.messageDisplayAction.onClicked.addListener(async (tab) => {
  try {
    await processDisplayedMessage(tab);
  } catch (e) {
    console.error("PDF Mailer failed:", e);
    await notifyError(e && e.message ? e.message : String(e));
  }
});

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const data = await browser.storage.local.get(CONFIG_KEY);
    if (!data[CONFIG_KEY]) {
      await browser.storage.local.set({ [CONFIG_KEY]: DEFAULT_CONFIG });
    }
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "openOptions") {
    return browser.runtime.openOptionsPage();
  }
});
