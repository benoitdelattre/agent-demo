// =====================================================================
// providers.js — Le "catalogue" des fournisseurs LLM
// ---------------------------------------------------------------------
// Rôle dans l'architecture : c'est la CONFIGURATION. Aucun appel réseau
// ici, seulement des données. Pour ajouter un fournisseur, on ajoute une
// entrée dans ce tableau, sans toucher au reste du code.
//
// Tous les fournisseurs listés exposent une API "compatible OpenAI" :
//   POST {baseUrl}/chat/completions   -> envoyer la conversation
//   GET  {baseUrl}/models             -> lister les modèles disponibles
// avec l'en-tête "Authorization: Bearer <clé>".
//
// "defaultModel" n'est qu'une suggestion : les noms de modèles changent
// souvent. Le bouton "Charger les modèles" interroge le fournisseur pour
// obtenir la liste réelle et à jour.
//
// "cors" indique ce que l'on sait des appels directs depuis un navigateur :
//   "verifie"  : testé (requête de pré-vérification CORS acceptée)
//   "reconnu"  : documenté / largement utilisé ainsi, non testé par nous
//   "incertain": non vérifié, peut être bloqué par le navigateur
// =====================================================================

export const PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    cors: "reconnu",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    cors: "reconnu",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    keyUrl: "https://console.mistral.ai/api-keys",
    cors: "incertain",
  },
  {
    id: "openrouter",
    label: "OpenRouter (accès à de nombreux modèles)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    keyUrl: "https://openrouter.ai/keys",
    cors: "reconnu",
  },
  {
    id: "gemini",
    label: "Google Gemini (mode compatible OpenAI)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    cors: "verifie",
  },
  {
    id: "custom",
    label: "Autre (URL compatible OpenAI)",
    baseUrl: "",
    defaultModel: "",
    keyUrl: "",
    cors: "incertain",
  },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}
