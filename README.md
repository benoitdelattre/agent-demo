# Agent conversationnel multi-fournisseurs

Application web **100 % statique** (HTML, CSS, JavaScript, sans serveur) : chaque utilisateur choisit son fournisseur LLM, colle **sa propre clé API**, puis discute avec le modèle. Hébergeable gratuitement sur Firebase Hosting (plan Spark).

Le guide de mise en ligne pas à pas est dans [GUIDE.md](GUIDE.md).

## Fonctionnalités

- Fournisseurs prêts à l'emploi : **Groq**, OpenAI, Mistral AI, OpenRouter, Google Gemini (mode compatible OpenAI), plus « Autre » pour toute API compatible OpenAI (URL à saisir).
- Bouton **« Charger les modèles »** : interroge le fournisseur pour lister ses modèles réels (et vérifier au passage que la clé fonctionne).
- Réponses affichées **au fil de l'eau** (streaming), bouton **Arrêter**.
- Consigne système optionnelle (personnalité, langue, style de l'agent).
- Messages d'erreur expliqués en français (clé invalide, modèle inconnu, quota, CORS…).
- Clé conservée en `sessionStorage` par défaut, en `localStorage` seulement si l'utilisateur coche « Se souvenir ». Bouton « Oublier ma clé ».

## Architecture

```
public/
├── index.html          Interface (structure de la page)
├── css/style.css       Apparence (thème clair/sombre, mobile)
└── js/
    ├── app.js          Contrôleur : relie l'interface aux modules, garde l'historique
    ├── providers.js    Configuration : liste des fournisseurs (URL, modèle suggéré)
    ├── llm-client.js   Accès au modèle : appels HTTP, streaming, erreurs
    └── storage.js      Persistance : où est rangée la clé
```

Le flux d'une question :

```
Utilisateur ──> app.js ──(historique complet + consigne)──> llm-client.js ──HTTPS──> API du fournisseur
     ^                                                                                   │
     └──────────────── affichage morceau par morceau (streaming) <────────────────────────┘
```

Trois idées à retenir :

1. **Le modèle n'a pas de mémoire.** À chaque question, l'application renvoie *tout* l'historique. C'est `app.js` qui « se souvient » (tableau `history`). « Nouvelle conversation » vide ce tableau.
2. **Un seul format pour plusieurs fournisseurs.** Tous ceux de la liste acceptent le format « compatible OpenAI » (`POST /chat/completions`). Ajouter un fournisseur = ajouter une entrée dans `providers.js`.
3. **Pas de serveur à nous.** Le navigateur appelle directement le fournisseur. C'est simple et gratuit, mais ça a deux conséquences : CORS et la sécurité de la clé (ci-dessous).

## CORS : chaque fournisseur accepte-t-il les appels depuis un navigateur ?

Un navigateur n'autorise une page web à appeler une API d'un autre domaine que si cette API le permet explicitement (en-têtes CORS). Si ce n'est pas le cas, l'appel est bloqué **avant même** d'arriver chez le fournisseur, et l'application affiche « Impossible de joindre… ».

Ce que j'ai pu vérifier (novembre 2026), et ce que je n'ai pas pu vérifier :

| Fournisseur | Statut | Ce qui fonde ce statut |
|---|---|---|
| Google Gemini (compatible OpenAI) | **Vérifié** | Requête de pré-vérification CORS testée : acceptée pour une origine quelconque. |
| Groq | Réputé fonctionner, **non testé** | Leur SDK officiel prévoit l'usage navigateur. Mon environnement de test n'avait pas accès à `api.groq.com`. |
| OpenAI | Réputé fonctionner, **non testé** | Même situation que Groq. |
| OpenRouter | Réputé fonctionner, **non testé** | Service pensé pour ce type d'usage. |
| Mistral AI | **Incertain** | Je n'ai ni pu le tester ni trouvé de confirmation fiable. |
| Anthropic (Claude) | Non inclus | Son API native n'utilise pas le format OpenAI et exige un en-tête spécial pour les appels navigateur. Ajout possible, mais demande un adaptateur dédié. |

Ces politiques peuvent changer à tout moment. **Le vrai test, c'est le vôtre** : choisissez le fournisseur, collez la clé, cliquez « Charger les modèles ». Si un message « CORS » apparaît dans la console du navigateur (touche F12), ce fournisseur bloque les appels directs : il faudra l'option proxy ci-dessous.

## Sécurité de la clé API : ce qu'il faut savoir

- **La clé ne quitte le navigateur que vers le fournisseur choisi.** Elle n'est envoyée ni à Firebase ni à GitHub. Firebase ne fait que servir les fichiers.
- **sessionStorage (par défaut)** : effacée à la fermeture de l'onglet. **localStorage (case « Se souvenir »)** : reste sur l'appareil jusqu'au clic sur « Oublier ma clé ». À éviter sur un poste partagé.
- **Le risque réel** : tout script qui s'exécute dans la page peut lire ces stockages. D'où trois protections dans le code :
  - les réponses du modèle sont affichées avec `textContent` (jamais `innerHTML`), donc elles ne peuvent pas injecter de code ;
  - aucune bibliothèque externe n'est chargée ;
  - `firebase.json` envoie un en-tête **Content-Security-Policy** qui interdit tout script ne venant pas du site lui-même.
  Une extension de navigateur malveillante, elle, peut tout lire : aucun site ne peut s'en protéger.
- **Ne mettez jamais de clé dans le code ni sur GitHub.** Ce dépôt n'en contient aucune et n'en a pas besoin. Le `.gitignore` exclut les fichiers `.env` par précaution. Si une clé est publiée par erreur, **révoquez-la immédiatement** dans la console du fournisseur : la supprimer du dépôt ne suffit pas, l'historique Git la garde.
- Conseil : créez une clé dédiée à cette application et, si le fournisseur le permet, fixez-lui une limite de dépense.

## Option avancée : un proxy (Cloud Function)

À n'envisager que si un fournisseur bloque le CORS, ou si vous voulez que les utilisateurs n'aient **pas** à fournir de clé.

Principe : le navigateur appelle une Cloud Function Firebase, qui appelle le fournisseur à sa place (un serveur n'est pas soumis au CORS).

Ce que ça coûte, honnêtement :

- **Le plan Blaze est obligatoire** pour déployer des Cloud Functions. C'est un plan à l'usage qui exige une carte bancaire. Il inclut un quota gratuit, au-delà duquel on paie. Je ne cite pas de montants : vérifiez la page tarifs Firebase, ils évoluent.
- **Plus de code et de maintenance** (Node.js, déploiement des fonctions, journaux).
- **Si la clé est la vôtre (stockée côté serveur)** : n'importe quel visiteur consomme votre crédit. Il faut alors ajouter une authentification et une limitation du nombre de requêtes, sinon vous risquez une facture.
- **Si chaque utilisateur garde sa clé** : le proxy règle seulement le CORS. La clé transite par votre fonction : vous devez vous engager à ne jamais la journaliser.

Pour un projet de formation, l'architecture actuelle (sans proxy) est le bon point de départ.

## Tester en local

Les modules JavaScript (`type="module"`) **ne fonctionnent pas** si l'on ouvre `index.html` par double-clic (`file://`). Il faut un petit serveur local, par exemple :

```bash
cd public
python3 -m http.server 8080      # puis ouvrir http://localhost:8080
```

ou, une fois Firebase CLI installé : `firebase emulators:start --only hosting`.

## Ce qui a été testé

Testé dans Chromium avec une fausse API compatible OpenAI (aucune vraie clé n'a été utilisée) : chargement des modèles, clé invalide (erreur 401 expliquée), envoi de deux messages avec historique et consigne système transmis, streaming, conservation après rechargement, blocage CORS détecté et expliqué, « Oublier ma clé », affichage mobile. **Non testé** : un appel réel à Groq ou à un autre fournisseur. Faites-le avec votre clé en premier.
