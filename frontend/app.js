const API_BASE = window.TRANSLATOR_API_BASE || "";
const TRANSLATE_ENDPOINT = `${API_BASE}/api/translate`;
const HISTORY_KEY = "translator_history_v1";
const HISTORY_LIMIT = 10;
const INPUT_HISTORY_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 600;

const sourceText = document.getElementById("sourceText");
const translatedText = document.getElementById("translatedText");
const translateBtn = document.getElementById("translateBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const qrBtn = document.getElementById("qrBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const clearOutputBtn = document.getElementById("clearOutputBtn");
const swapBtn = document.getElementById("swapBtn");
const statusText = document.getElementById("statusText");
const detectedLang = document.getElementById("detectedLang");
const charCount = document.getElementById("charCount");
const sourceFieldLabel = document.getElementById("sourceFieldLabel");
const targetFieldLabel = document.getElementById("targetFieldLabel");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const panel = document.querySelector(".panel");
const sourceLangSelect = document.getElementById("sourceLangSelect");
const targetLangSelect = document.getElementById("targetLangSelect");
const chips = Array.from(document.querySelectorAll(".chip"));

const languages = {
  auto: "Auto",
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic"
};

const statusClasses = [
  "status-ready",
  "status-loading",
  "status-success",
  "status-error",
  "status-warning"
];

const state = {
  sourceLang: "auto",
  targetLang: "hi",
  inputHistory: [""],
  inputIndex: 0
};

const setStatus = (message, type = "ready") => {
  statusText.classList.remove(...statusClasses);
  statusText.classList.add(`status-${type}`);
  statusText.textContent = message;
};

const setDetected = (code) => {
  if (!code || !languages[code]) {
    detectedLang.textContent = "Detected: -";
    return;
  }
  detectedLang.textContent = `Detected: ${languages[code]} (${code})`;
};

const setBusy = (busy) => {
  translateBtn.disabled = busy;
  swapBtn.disabled = busy;
  clearBtn.disabled = busy;
  panel.classList.toggle("loading", busy);
  translateBtn.textContent = busy ? "Translating..." : "Translate";
};

const updateCharCount = () => {
  charCount.textContent = `${sourceText.value.length} / 2000`;
};

const formatTime = (isoTimestamp) => {
  const date = new Date(isoTimestamp);
  return date.toLocaleString();
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");

const getHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveHistory = (items) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
};

const renderHistory = () => {
  const items = getHistory();
  historyList.innerHTML = "";
  historyEmpty.style.display = items.length ? "none" : "block";

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <div class="history-meta">${languages[item.source_lang]} -> ${languages[item.target_lang]} | ${formatTime(item.created_at)}</div>
      <div class="history-row">
        <p class="history-text"><strong>In:</strong> ${escapeHtml(item.source_text)}</p>
        <div class="history-actions">
          <button type="button" class="mini-btn" data-action="reuse" data-index="${index}">Reuse</button>
          <button type="button" class="mini-btn" data-action="copy" data-index="${index}">Copy</button>
        </div>
      </div>
      <p class="history-text"><strong>Out:</strong> ${escapeHtml(item.translated_text)}</p>
    `;
    historyList.appendChild(li);
  });
};

const addHistory = (item) => {
  const current = getHistory();
  const updated = [item, ...current];
  saveHistory(updated);
  renderHistory();
};

const populateLanguageSelects = () => {
  const entries = Object.entries(languages);
  const buildOptions = (select) => {
    select.innerHTML = "";
    entries.forEach(([code, label]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = label;
      select.appendChild(option);
    });
  };

  buildOptions(sourceLangSelect);
  buildOptions(targetLangSelect);
  sourceLangSelect.value = state.sourceLang;
  targetLangSelect.value = state.targetLang;
};

const updateLanguageUI = () => {
  sourceFieldLabel.textContent = `Input text (${languages[state.sourceLang]})`;
  targetFieldLabel.textContent = `${languages[state.targetLang]} translation`;
  sourceText.placeholder = "Type your text here...";
  translatedText.placeholder = "Translation appears here...";
  translatedText.style.fontFamily =
    state.targetLang === "hi"
      ? '"Noto Sans Devanagari", "Mangal", sans-serif'
      : '"Space Grotesk", "Segoe UI", sans-serif';
};

const resetOutput = () => {
  translatedText.value = "";
  setStatus("Ready", "ready");
  setDetected(null);
};

const recordInput = (value) => {
  const history = state.inputHistory.slice(0, state.inputIndex + 1);
  if (history[history.length - 1] === value) {
    return;
  }
  history.push(value);
  if (history.length > INPUT_HISTORY_LIMIT) {
    history.shift();
  }
  state.inputHistory = history;
  state.inputIndex = history.length - 1;
  updateUndoRedo();
};

const updateUndoRedo = () => {
  undoBtn.disabled = state.inputIndex <= 0;
  redoBtn.disabled = state.inputIndex >= state.inputHistory.length - 1;
};

const applyInputFromHistory = () => {
  sourceText.value = state.inputHistory[state.inputIndex] || "";
  updateCharCount();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const translateWithRetry = async (payload) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const errBody = await response.json();
          message = errBody.error || message;
        } catch {
          // Keep fallback message when backend does not return JSON.
        }
        throw new Error(message);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt === 0) {
        setStatus("Retrying request...", "warning");
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Request failed");
};

const translate = async () => {
  const text = sourceText.value.trim();

  if (!text) {
    setStatus("Enter text before translating.", "error");
    sourceText.focus();
    return;
  }

  setBusy(true);
  setStatus("Sending request...", "loading");

  try {
    const data = await translateWithRetry({
      text,
      source_lang: state.sourceLang,
      target_lang: state.targetLang
    });

    const output = data.translation || data.translated_text || "";

    if (!output) {
      throw new Error("No translation field in API response");
    }

    translatedText.value = output;
    setStatus("Translated successfully", "success");
    setDetected(data.detected_source_lang || null);

    addHistory({
      source_text: text,
      translated_text: output,
      source_lang: data.detected_source_lang || state.sourceLang,
      target_lang: state.targetLang,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    setStatus(error.message || "Translation failed", "error");
  } finally {
    setBusy(false);
  }
};

const initFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const text = params.get("text");
  const source = params.get("source");
  const target = params.get("target");

  if (source && languages[source]) {
    state.sourceLang = source;
  }
  if (target && languages[target]) {
    state.targetLang = target;
  }

  populateLanguageSelects();
  updateLanguageUI();

  if (text) {
    sourceText.value = text;
    updateCharCount();
    recordInput(text);
  }
};

translateBtn.addEventListener("click", translate);

sourceText.addEventListener("input", () => {
  updateCharCount();
  recordInput(sourceText.value);
  if (!sourceText.value.trim()) {
    resetOutput();
  }
});

sourceText.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    translate();
  }
});

clearBtn.addEventListener("click", () => {
  sourceText.value = "";
  translatedText.value = "";
  updateCharCount();
  recordInput("");
  setStatus("Ready", "ready");
  setDetected(null);
  sourceText.focus();
});

clearOutputBtn.addEventListener("click", () => {
  translatedText.value = "";
  setStatus("Output cleared", "ready");
});

copyBtn.addEventListener("click", async () => {
  const value = translatedText.value.trim();
  if (!value) {
    setStatus("Nothing to copy yet.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setStatus("Copied translation to clipboard", "success");
  } catch {
    setStatus("Clipboard blocked by browser", "error");
  }
});

downloadBtn.addEventListener("click", () => {
  const value = translatedText.value.trim();
  if (!value) {
    setStatus("Nothing to download yet.", "warning");
    return;
  }

  const blob = new Blob([value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "translation.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Downloaded translation", "success");
});

copyLinkBtn.addEventListener("click", async () => {
  const text = sourceText.value.trim();
  if (!text) {
    setStatus("Add text before sharing.", "warning");
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("text", text);
  url.searchParams.set("source", state.sourceLang);
  url.searchParams.set("target", state.targetLang);

  try {
    await navigator.clipboard.writeText(url.toString());
    setStatus("Copied share link", "success");
  } catch {
    setStatus("Clipboard blocked by browser", "error");
  }
});

qrBtn.addEventListener("click", () => {
  const text = sourceText.value.trim();
  if (!text) {
    setStatus("Add text before sharing.", "warning");
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("text", text);
  url.searchParams.set("source", state.sourceLang);
  url.searchParams.set("target", state.targetLang);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url.toString())}`;
  window.open(qrUrl, "_blank", "noopener,noreferrer");
  setStatus("Opened QR code", "success");
});

undoBtn.addEventListener("click", () => {
  if (state.inputIndex > 0) {
    state.inputIndex -= 1;
    applyInputFromHistory();
    updateUndoRedo();
  }
});

redoBtn.addEventListener("click", () => {
  if (state.inputIndex < state.inputHistory.length - 1) {
    state.inputIndex += 1;
    applyInputFromHistory();
    updateUndoRedo();
  }
});

swapBtn.addEventListener("click", () => {
  const nextSource = state.targetLang;
  state.targetLang = state.sourceLang;
  state.sourceLang = nextSource;
  const previousInput = sourceText.value;
  sourceText.value = translatedText.value;
  translatedText.value = previousInput;
  sourceLangSelect.value = state.sourceLang;
  targetLangSelect.value = state.targetLang;
  updateLanguageUI();
  updateCharCount();
  setStatus("Languages swapped", "ready");
  panel.classList.remove("swap-animate");
  requestAnimationFrame(() => {
    panel.classList.add("swap-animate");
    setTimeout(() => panel.classList.remove("swap-animate"), 320);
  });
});

sourceLangSelect.addEventListener("change", (event) => {
  state.sourceLang = event.target.value;
  updateLanguageUI();
});

targetLangSelect.addEventListener("change", (event) => {
  state.targetLang = event.target.value;
  updateLanguageUI();
});

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    sourceText.value = chip.dataset.sample || "";
    updateCharCount();
    recordInput(sourceText.value);
    resetOutput();
    sourceText.focus();
  });
});

historyList.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const index = Number(button.dataset.index);
  const items = getHistory();
  const item = items[index];
  if (!item) {
    return;
  }

  if (action === "reuse") {
    state.sourceLang = item.source_lang;
    state.targetLang = item.target_lang;
    sourceLangSelect.value = state.sourceLang;
    targetLangSelect.value = state.targetLang;
    sourceText.value = item.source_text;
    translatedText.value = item.translated_text;
    updateLanguageUI();
    updateCharCount();
    setStatus("Loaded from history", "success");
  }

  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(item.translated_text);
      setStatus("Copied history translation", "success");
    } catch {
      setStatus("Clipboard blocked by browser", "error");
    }
  }
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  setStatus("History cleared", "ready");
});

updateCharCount();
populateLanguageSelects();
updateLanguageUI();
renderHistory();
updateUndoRedo();
initFromUrl();