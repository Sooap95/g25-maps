# G25 Maps

Heatmap de proximité génétique à partir de coordonnées **Global25 (scaled)**. Usage personnel, gratuit, 100 % dans le navigateur — rien n’est envoyé sur un serveur.

Inspiré de l’idée de [MyGeneticMaps](https://mygeneticmaps.com/) (cartes colorées par distance G25), sans abonnement. Le code et le traitement sont indépendants.

## En ligne (GitHub Pages)

**https://sooap95.github.io/g25-maps/**

Le dépôt est public. Chaque push sur `main` republie le site via GitHub Actions.

## Lancer en local

```bash
cd coding/g25-heatmap
python3 -m http.server 8765
```

Ouvrir [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Utilisation

1. Coller une ligne G25 **scaled** au format Vahaduo : `Nom,PC1,PC2,…,PC25`.
2. **Analyser**.
3. Choisir une carte : Monde, Europe, Europe de l’Ouest, France (régions), France (départements).
4. La couleur d’un territoire = distance euclidienne 25-D au **plus proche** échantillon qui lui est rattaché.
5. La table liste toutes les distances (base + vos dépôts).

## Déposer des sources

Trois façons d’enrichir la base :

| Voie | Où ça vit |
|---|---|
| Formulaire « Déposer » ou glisser-déposer `.txt` / `.json` | IndexedDB du navigateur (persiste sur cette machine) |
| Export JSON puis réimport | Sauvegarde / partage |
| Fichier `data/deposits.json` | Chargé au démarrage, versionnable avec le projet |

Une source sans pays n’apparaît que dans la **table**. Avec un pays (et optionnellement une région INSEE, un département, un code NUTS), elle colore aussi les cartes.

Exemple d’entrée dans `data/deposits.json` :

```json
[
  {
    "id": "u_toulouse",
    "n": "Toulouse_perso_scaled",
    "c": [0.12, 0.14, 0.03],
    "iso3": "FRA",
    "role": "regional",
    "fr_regions": ["76"],
    "fr_depts": ["31"],
    "nuts": [],
    "notes": "moyenne familiale"
  }
]
```

(`c` doit contenir **25** nombres.)

## Données

- Moyennes modernes **Global25 scaled** (feuille publique de type Vahaduo / Eurogenes).
- Fond de carte : Natural Earth (pays), contours IGN/Etalab via france-geojson (régions et départements), Eurostat NUTS 2021 (subdivisions d’Europe de l’Ouest).

Les calculs sont exploratoires : une distance G25 n’est pas une certification généalogique.

## Recalculer les fichiers `data/maps`

```bash
python3 scripts/build_data.py
```
