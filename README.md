# G25 Maps

Heatmap de proximité génétique à partir de coordonnées **Global25 (scaled)**. Usage personnel, gratuit, 100 % dans le navigateur — rien n’est envoyé sur un serveur.

## En ligne

**https://sooap95.github.io/g25-maps/**

Le site est déjà construit sur la branche `gh-pages`. **Une seule action** pour le rendre public :

1. Ouvrir [Settings → Pages](https://github.com/Sooap95/g25-maps/settings/pages)
2. **Source** : *Deploy from a branch*
3. **Branch** : `gh-pages` / `/ (root)` → **Save**

Attendre ~1 minute, puis recharger l’URL ci-dessus.

Chaque push sur `main` reconstruit et republie `gh-pages` automatiquement.

## Lancer en local

```bash
cd coding/g25-heatmap
python3 -m http.server 8765
```

Ouvrir [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Utilisation

1. Coller une ligne G25 **scaled** : `Nom,PC1,PC2,…,PC25`.
2. **Analyser**.
3. Choisir une carte : Monde, Europe, Europe de l’Ouest, France (régions / départements).

## Déposer des sources

Formulaire dans l’app, glisser-déposer `.txt` / `.json`, ou fichier `data/deposits.json`.

## Données

Moyennes Global25 scaled (Eurogenes / Vahaduo). Cartes : Natural Earth, IGN/Etalab, Eurostat NUTS.
