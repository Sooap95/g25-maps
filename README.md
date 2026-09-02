# G25 Maps

Carte de proximité génétique à partir de coordonnées **Global25 (scaled)**. Usage personnel, gratuit, 100 % dans le navigateur — rien n’est envoyé sur un serveur.

Inspiré de l’idée de [MyGeneticMaps](https://mygeneticmaps.com/) (cartes colorées par distance G25), sans abonnement. Le code et le traitement sont indépendants.

## En ligne (GitHub Pages)

**https://sooap95.github.io/g25-maps/**

Dépôt : [github.com/Sooap95/g25-maps](https://github.com/Sooap95/g25-maps). Le site est publié sur la branche `gh-pages` ; chaque push sur `main` le reconstruit.

Si l’URL affiche 404, activer Pages une fois : [Settings → Pages](https://github.com/Sooap95/g25-maps/settings/pages) → Source **Deploy from a branch** → Branch **gh-pages** / **/(root)**.

## Lancer en local

```bash
python3 -m http.server 8765
```

Ouvrir [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Utilisation

1. Choisir un **jeu de données** (modernes, anciens, Gaulois…).
2. Coller une ligne G25 **scaled** au format Vahaduo : `Nom,PC1,PC2,…,PC25`, ou cliquer un profil d’exemple.
3. **Analyser**.
4. Choisir une carte parmi celles que le jeu peut réellement colorer.

La couleur d’un territoire = distance euclidienne 25-D au **plus proche** échantillon qui lui est rattaché. La table liste toutes les distances, avec leur rang.

### Ce que la carte refuse de montrer

Toutes les cartes ne conviennent pas à tous les jeux. « Gaulois · Âge du Fer » ne documente aucun département français : la carte des départements peignait pourtant ses 96 polygones d’une seule teinte, chacun empruntant la moyenne nationale. Sur les régions, l’effet était pire — les régions sans échantillon prenaient le **meilleur** score national et paraissaient donc plus proches que les régions réellement documentées.

Désormais :

- Une carte n’est proposée que si le vivier courant y documente au moins 5 territoires et peut y produire au moins 3 valeurs distinctes. Les autres onglets sont barrés, avec le décompte en infobulle.
- Changer de jeu ou resserrer un filtre bascule automatiquement sur la carte la mieux couverte.
- Le repli sur la moyenne du pays est une **option, décochée par défaut**. Activée, les territoires concernés sont hachurés et exclus du calcul de l’échelle.

## Fonctions

| | |
|---|---|
| **Frise chronologique** | Sur un jeu ancien, deux curseurs bornent la période. « Animer » fait défiler une fenêtre glissante : on voit les populations proches se déplacer d’une époque à l’autre. |
| **Filtres** | Périodes, taille minimale de la moyenne (`n=`), profils bruités (`low_res`), individus aberrants (`_o`), diasporas. Carte, table et modèle d’admixture partagent exactement le même vivier. |
| **Rang** | Une distance brute ne dit rien ; « plus proche que 96 % des populations » se lit sans référence. |
| **Comparaison de deux profils** | La carte affiche l’écart signé entre A et B, sur une palette divergente centrée sur l’égalité. |
| **Surface interpolée** | Un dégradé continu entre les points (pondération par l’inverse de la distance), au lieu d’aplats découpés par des frontières administratives sans réalité génétique. |
| **Modélisation (admixture)** | Décomposition du profil en proportions de sources, par sélection avant gloutonne et descente projetée sur le simplexe. |
| **Permalien** | Tout l’état tient dans le fragment `#…` — jamais transmis au serveur, GitHub Pages ne le voit pas. |
| **Export** | PNG de la carte, JSON / TXT des dépôts. |

## Déposer des sources

| Voie | Où ça vit |
|---|---|
| Formulaire « Déposer » ou glisser-déposer `.txt` / `.json` | IndexedDB du navigateur (persiste sur cette machine) |
| Export JSON puis réimport | Sauvegarde / partage |
| Fichier `data/deposits.json` | Chargé au démarrage, versionnable avec le projet |

Une source sans pays n’apparaît que dans la **table**. Avec un pays (et optionnellement une région INSEE, un département, un code NUTS), elle colore aussi les cartes.

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

- Collections **Global25 scaled** publiées sur [exploreyourdna.com](https://www.exploreyourdna.com/) (modernes et anciens Moriopoulos 2026, Âge du Fer, Gaulois, Celtes & Germains).
- Fonds de carte : Natural Earth (pays), IGN/Etalab Admin Express via france-geojson (régions et départements), Eurostat NUTS 2021 (subdivisions d’Europe de l’Ouest).

### Métadonnées déduites des étiquettes

Aucune collection G25 n’expose de métadonnées : tout est dans le nom de l’échantillon. `scripts/periods.py` en extrait la période, l’année, l’effectif `(n=)`, la couverture ADN et les marqueurs de qualité — 84 % des 5 051 anciens sont ainsi datés, dont 261 par une date explicite.

Deux limites, affichées dans l’application :

- Une date déduite d’un mot-clé (`LBA`, `Early Medieval`) est **indicative** et calée sur la chronologie européenne ; en Chine, `LN` ne couvre pas le même millénaire. Une date numérique portée par l’étiquette l’emporte toujours.
- Le point (lat, lon) d’un échantillon est le **centre de son territoire** — département, région, NUTS ou pays, le plus précis disponible — et non son lieu de fouille. Il suffit à interpoler une surface, pas à situer un site.

Les calculs sont exploratoires : une distance G25 n’est pas une certification généalogique.

## Reconstruire les données

```bash
python3 scripts/build_datasets.py
```

Télécharge les collections, les étiquette (iso3 / région / département), puis enchaîne l’enrichissement. La source étant un site tiers, une indisponibilité ne casse pas le build : les fichiers déjà publiés sont conservés.

Enrichissement seul, sans réseau :

```bash
python3 scripts/enrich_datasets.py
```

Tests :

```bash
python3 tests/test_data.py
```
