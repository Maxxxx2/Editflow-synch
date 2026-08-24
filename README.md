# EditFlow — PWA + synchronisation PC / iPhone

Cette version conserve l'interface et les fonctionnalités EditFlow existantes, le `localStorage` et le mode hors connexion, et ajoute une synchronisation cloud facultative avec Supabase.

## 1. Créer le cloud Supabase

1. Crée un projet sur https://supabase.com/
2. Dans **SQL Editor**, colle tout le contenu de `supabase.sql` et exécute-le.
3. Dans **Project Settings → API**, copie le **Project URL** et la **Publishable key**.
4. Ouvre `supabase-config.js` et remplace :

```js
window.EDITFLOW_SUPABASE = {
    url: "YOUR_SUPABASE_PROJECT_URL",
    key: "YOUR_SUPABASE_PUBLISHABLE_KEY"
};
```

par tes vraies valeurs.

Le publishable/anon key peut être présent dans une application web : la protection des données repose sur Supabase Auth et les politiques RLS du fichier SQL.

## 2. Connexion

Sur l'ordinateur et l'iPhone, ouvre EditFlow et clique sur le bouton `☁ Local`.

Utilise **la même adresse email** sur les deux appareils. EditFlow envoie un lien de connexion sécurisé.

## 3. Synchronisation

- `localStorage` reste la source locale immédiate.
- Hors connexion, l'application continue de fonctionner normalement.
- Une modification locale est marquée à synchroniser.
- Dès qu'Internet revient, elle est envoyée au cloud.
- Les autres appareils récupèrent les changements automatiquement, au retour en ligne, au retour sur l'application et périodiquement.
- En cas de modification concurrente, la version locale la plus récente est conservée lorsqu'elle est plus récente que celle du cloud.

## 4. PWA

La PWA doit être servie par HTTPS ou localhost, pas par `file://`.

Pour GitHub Pages, mets les fichiers suivants à la racine du dépôt :

```text
index.html
manifest.json
sw.js
supabase-config.js
sync.js
supabase.sql
icons/
```

Puis active **Settings → Pages → Deploy from a branch → main → / (root)**.

## 5. Domaine personnalisé

Si tu utilises un domaine comme `editflow.fun`, configure-le dans **Settings → Pages → Custom domain** de GitHub, puis ajoute les enregistrements DNS demandés par GitHub.

## 6. Mise à jour PWA

Quand le code change, incrémente la version dans `sw.js`, par exemple `editflow-v2` → `editflow-v3`, puis republie.
