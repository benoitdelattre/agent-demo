// =====================================================================
// llm-client.js — Le "client" qui parle à l'API du fournisseur
// ---------------------------------------------------------------------
// Rôle dans l'architecture : l'ACCÈS AU MODÈLE. Ce module ne connaît
// rien de l'interface : il reçoit des réglages + des messages, et renvoie
// du texte. On pourrait le réutiliser dans une autre application.
//
// Format des messages (standard OpenAI) :
//   [{ role: "system" | "user" | "assistant", content: "..." }, ...]
// Le modèle n'a PAS de mémoire : à chaque question, on renvoie tout
// l'historique de la conversation. C'est l'application qui "se souvient".
// =====================================================================

// Transforme une erreur technique en message compréhensible.
function explainError(status, bodyText) {
  let detail = bodyText;
  try {
    const json = JSON.parse(bodyText);
    detail = json.error?.message || json.message || bodyText;
  } catch {
    /* le corps n'était pas du JSON */
  }
  const hints = {
    400: "Requête refusée : le nom du modèle est peut-être incorrect.",
    401: "Clé API invalide ou expirée.",
    403: "Accès refusé : la clé n'a pas les droits pour ce modèle.",
    404: "Adresse ou modèle introuvable : vérifiez l'URL et le nom du modèle.",
    429: "Trop de requêtes ou quota épuisé : patientez ou vérifiez votre crédit.",
  };
  const hint = hints[status] || (status >= 500 ? "Le fournisseur rencontre un problème, réessayez plus tard." : "");
  return `Erreur ${status}. ${hint}\nDétail du fournisseur : ${String(detail).slice(0, 400)}`;
}

// Un échec de fetch SANS réponse HTTP (TypeError) vient presque toujours
// soit d'un problème réseau, soit d'un blocage CORS : le navigateur
// refuse l'appel parce que le fournisseur n'autorise pas les sites web
// à l'appeler directement. Le navigateur ne nous dit pas lequel des deux.
function networkError(baseUrl) {
  return new Error(
    `Impossible de joindre ${baseUrl}.\n` +
      "Causes possibles : pas de connexion Internet, adresse erronée, ou " +
      "le fournisseur bloque les appels directs depuis un navigateur (CORS). " +
      "Ouvrez la console du navigateur (F12) : un message mentionnant « CORS » " +
      "confirme la deuxième hypothèse. Voir le README, section CORS."
  );
}

function headers(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

// Liste les modèles proposés par le fournisseur.
export async function listModels({ baseUrl, apiKey }) {
  let res;
  try {
    res = await fetch(`${baseUrl}/models`, { headers: headers(apiKey) });
  } catch {
    throw networkError(baseUrl);
  }
  if (!res.ok) throw new Error(explainError(res.status, await res.text()));
  const data = await res.json();
  return (data.data || []).map((m) => m.id).sort();
}

// Envoie la conversation et appelle onToken(morceau) au fil de l'eau
// (mode "streaming") pour afficher la réponse pendant qu'elle s'écrit.
// Renvoie le texte complet à la fin.
export async function chat({ baseUrl, apiKey, model, messages, temperature = 0.7, signal, onToken }) {
  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ model, messages, temperature, stream: true }),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw networkError(baseUrl);
  }
  if (!res.ok) throw new Error(explainError(res.status, await res.text()));

  // Certains fournisseurs ignorent "stream" et renvoient du JSON classique.
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    onToken?.(text);
    return text;
  }

  // Lecture du flux "Server-Sent Events" : des lignes "data: {...}".
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // la dernière ligne peut être incomplète
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return full;
      try {
        const piece = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (piece) {
          full += piece;
          onToken?.(piece);
        }
      } catch {
        /* ligne partielle ou commentaire : on l'ignore */
      }
    }
  }
  return full;
}
