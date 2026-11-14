// =====================================================================
// storage.js — Où et comment on garde les réglages de l'utilisateur
// ---------------------------------------------------------------------
// Rôle dans l'architecture : la PERSISTANCE. Le reste de l'application
// ne sait pas si les données sont en sessionStorage ou en localStorage.
//
// Choix de sécurité :
//  - Par défaut, la clé API va dans sessionStorage : elle disparaît
//    quand on ferme l'onglet.
//  - Si l'utilisateur coche "Se souvenir", elle va dans localStorage :
//    elle reste sur cet appareil jusqu'à ce qu'on clique "Oublier".
//  - Dans les deux cas, la clé reste dans CE navigateur. Elle n'est
//    jamais envoyée à Firebase ni à GitHub, seulement au fournisseur LLM.
//  - Limite honnête : un script malveillant exécuté sur la page (faille
//    XSS, extension de navigateur douteuse) pourrait la lire. C'est pour
//    cela que l'on n'utilise jamais innerHTML avec du texte reçu.
// =====================================================================

const KEY = "agent-conversationnel:settings";

function safeGet(store) {
  try {
    const raw = store.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // stockage bloqué (navigation privée, etc.)
  }
}

export function loadSettings() {
  return safeGet(sessionStorage) || safeGet(localStorage);
}

export function saveSettings(settings, remember) {
  const value = JSON.stringify(settings);
  try {
    if (remember) {
      localStorage.setItem(KEY, value);
      sessionStorage.removeItem(KEY);
    } else {
      sessionStorage.setItem(KEY, value);
      localStorage.removeItem(KEY);
    }
  } catch {
    // Si le stockage est indisponible, l'application fonctionne quand
    // même : les réglages restent en mémoire jusqu'au rechargement.
  }
}

export function clearSettings() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    /* rien à faire */
  }
}
