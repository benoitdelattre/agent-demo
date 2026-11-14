// =====================================================================
// app.js — Le "chef d'orchestre" (contrôleur)
// ---------------------------------------------------------------------
// Rôle dans l'architecture : relier l'INTERFACE (index.html) aux autres
// modules :
//   providers.js  -> quels fournisseurs existent (configuration)
//   storage.js    -> où garder les réglages (persistance)
//   llm-client.js -> comment parler au modèle (accès API)
// L'état de la conversation (la "mémoire" de l'agent) vit ici, dans le
// tableau `history`.
// =====================================================================

import { PROVIDERS, getProvider } from "./providers.js";
import { loadSettings, saveSettings, clearSettings } from "./storage.js";
import { chat, listModels } from "./llm-client.js";

// ---------- Raccourcis vers les éléments de la page ----------
const $ = (id) => document.getElementById(id);
const el = {
  layout: document.querySelector(".layout"),
  status: $("status"),
  provider: $("provider"),
  corsNote: $("cors-note"),
  customRow: $("custom-url-row"),
  baseUrl: $("base-url"),
  apiKey: $("api-key"),
  toggleKey: $("btn-toggle-key"),
  keyLink: $("key-link"),
  model: $("model"),
  modelList: $("model-list"),
  btnModels: $("btn-models"),
  systemPrompt: $("system-prompt"),
  remember: $("remember"),
  settingsForm: $("settings-form"),
  settingsMsg: $("settings-msg"),
  btnForget: $("btn-forget"),
  btnSettings: $("btn-settings"),
  btnNew: $("btn-new"),
  messages: $("messages"),
  chatForm: $("chat-form"),
  input: $("input"),
  btnSend: $("btn-send"),
  btnStop: $("btn-stop"),
};

// ---------- État de l'application ----------
let settings = null;    // réglages validés
let history = [];       // messages échangés [{role, content}]
let controller = null;  // permet d'interrompre une réponse en cours

const CORS_TEXT = {
  verifie: "Appels directs depuis le navigateur : vérifiés.",
  reconnu: "Appels directs depuis le navigateur : réputés fonctionner (non garanti).",
  incertain: "Appels directs depuis le navigateur : non vérifiés, peuvent être bloqués (CORS).",
};

// ---------- Panneau de réglages ----------
function fillProviders() {
  for (const p of PROVIDERS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    el.provider.append(opt);
  }
}

function onProviderChange(keepModel = false) {
  const p = getProvider(el.provider.value);
  el.customRow.hidden = p.id !== "custom";
  el.baseUrl.required = p.id === "custom";
  el.corsNote.textContent = CORS_TEXT[p.cors];
  el.keyLink.parentElement.hidden = !p.keyUrl;
  el.keyLink.href = p.keyUrl || "#";
  el.modelList.replaceChildren();
  if (!keepModel) el.model.value = p.defaultModel;
}

function readForm() {
  const p = getProvider(el.provider.value);
  const baseUrl = (p.id === "custom" ? el.baseUrl.value : p.baseUrl).trim().replace(/\/+$/, "");
  return {
    providerId: p.id,
    baseUrl,
    apiKey: el.apiKey.value.trim(),
    model: el.model.value.trim(),
    systemPrompt: el.systemPrompt.value.trim(),
  };
}

function writeForm(s) {
  el.provider.value = s.providerId;
  onProviderChange(true);
  if (s.providerId === "custom") el.baseUrl.value = s.baseUrl;
  el.apiKey.value = s.apiKey;
  el.model.value = s.model;
  el.systemPrompt.value = s.systemPrompt || "";
}

function setMsg(text, isError = false) {
  el.settingsMsg.textContent = text;
  el.settingsMsg.className = isError ? "hint error" : "hint";
}

function applySettings(s) {
  settings = s;
  const ready = Boolean(s);
  el.input.disabled = !ready;
  el.btnSend.disabled = !ready;
  el.layout.classList.toggle("configured", ready);
  el.layout.classList.remove("show-settings");
  el.status.textContent = ready ? `${getProvider(s.providerId).label.split(" (")[0]} · ${s.model}` : "Non configuré";
  el.status.classList.toggle("ok", ready);
  if (ready) el.input.focus();
}

async function onLoadModels() {
  const s = readForm();
  if (!s.apiKey || !s.baseUrl) return setMsg("Renseignez d'abord la clé (et l'URL si besoin).", true);
  el.btnModels.disabled = true;
  setMsg("Chargement des modèles…");
  try {
    const models = await listModels(s);
    el.modelList.replaceChildren(
      ...models.map((m) => Object.assign(document.createElement("option"), { value: m }))
    );
    setMsg(`${models.length} modèle(s) trouvé(s). Cliquez dans le champ « Modèle » pour choisir. Votre clé fonctionne.`);
  } catch (e) {
    setMsg(e.message, true);
  } finally {
    el.btnModels.disabled = false;
  }
}

// ---------- Affichage des messages ----------
// Important (sécurité) : on utilise textContent, jamais innerHTML. Une
// réponse du modèle ne peut donc pas injecter de code dans la page (et
// donc pas lire la clé API stockée).
function addBubble(role, text = "") {
  el.messages.querySelector(".empty")?.remove();
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  el.messages.append(div);
  el.messages.scrollTop = el.messages.scrollHeight;
  return div;
}

function setBusy(busy) {
  el.btnSend.disabled = busy || !settings;
  el.input.disabled = busy || !settings;
  el.btnStop.hidden = !busy;
}

// ---------- Boucle de conversation ----------
async function send(text) {
  history.push({ role: "user", content: text });
  addBubble("user", text);
  const bubble = addBubble("assistant");
  bubble.classList.add("pending");
  setBusy(true);
  controller = new AbortController();

  // Le message "system" (consigne) est placé en tête à chaque envoi.
  const messages = settings.systemPrompt
    ? [{ role: "system", content: settings.systemPrompt }, ...history]
    : history;

  try {
    const answer = await chat({
      ...settings,
      messages,
      signal: controller.signal,
      onToken: (piece) => {
        bubble.textContent += piece;
        el.messages.scrollTop = el.messages.scrollHeight;
      },
    });
    history.push({ role: "assistant", content: answer });
  } catch (e) {
    if (e.name === "AbortError") {
      // Réponse interrompue : on garde ce qui a déjà été écrit.
      history.push({ role: "assistant", content: bubble.textContent });
    } else {
      bubble.remove();
      history.pop(); // on retire la question qui a échoué pour pouvoir la renvoyer
      addBubble("error", e.message);
      el.input.value = text;
    }
  } finally {
    bubble.classList.remove("pending");
    controller = null;
    setBusy(false);
    el.input.focus();
  }
}

// ---------- Branchement des événements ----------
function init() {
  fillProviders();
  el.provider.addEventListener("change", () => onProviderChange());

  const saved = loadSettings();
  if (saved) {
    writeForm(saved);
    el.remember.checked = Boolean(localStorage.getItem("agent-conversationnel:settings"));
    applySettings(saved);
  } else {
    onProviderChange();
  }

  el.toggleKey.addEventListener("click", () => {
    const show = el.apiKey.type === "password";
    el.apiKey.type = show ? "text" : "password";
    el.toggleKey.textContent = show ? "Masquer" : "Afficher";
  });

  el.btnModels.addEventListener("click", onLoadModels);

  el.settingsForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const s = readForm();
    if (!s.baseUrl.startsWith("https://") && !s.baseUrl.startsWith("http://localhost")) {
      return setMsg("L'URL doit commencer par https:// (sinon la clé circulerait en clair).", true);
    }
    saveSettings(s, el.remember.checked);
    setMsg("Réglages enregistrés.");
    applySettings(s);
  });

  el.btnForget.addEventListener("click", () => {
    clearSettings();
    el.apiKey.value = "";
    el.remember.checked = false;
    applySettings(null);
    setMsg("Clé effacée de ce navigateur.");
  });

  el.btnSettings.addEventListener("click", () => {
    if (!settings) return el.apiKey.focus();
    el.layout.classList.toggle("show-settings");
  });

  el.btnNew.addEventListener("click", () => {
    controller?.abort();
    history = [];
    el.messages.replaceChildren();
    addBubble("assistant", "Nouvelle conversation. Le modèle a oublié les échanges précédents.");
  });

  el.chatForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = el.input.value.trim();
    if (!text || controller) return;
    el.input.value = "";
    send(text);
  });

  el.input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      el.chatForm.requestSubmit();
    }
  });

  el.btnStop.addEventListener("click", () => controller?.abort());
}

init();
