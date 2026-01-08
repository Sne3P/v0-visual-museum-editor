# Module de Génération de Parcours Intelligent

## 📖 Description

Module intelligent qui génère des parcours optimisés dans le musée en fonction du profil utilisateur.

## ✨ Fonctionnalités

### 1. Sélection Intelligente
- ✅ Filtre les œuvres selon le profil (age_cible, thématique, style)
- ✅ Diversité géographique (différentes salles/étages)
- ✅ Respect de la durée cible
- ✅ Variations uniques (seed aléatoire)

### 2. Optimisation du Chemin
- ✅ Algorithme Nearest Neighbor (plus proche voisin)
- ✅ Minimisation de la distance totale
- ✅ Gestion multi-étages (pénalité escaliers)
- ✅ Accessibilité (portes, connexions)

### 3. Métriques Calculées
- ✅ Distance totale (mètres)
- ✅ Durée estimée (marche + écoute narrations)
- ✅ Étages visités
- ✅ Salles visitées

### 4. Export JSON Complet
- ✅ Liste ordonnée des œuvres
- ✅ Narrations complètes
- ✅ Positions géographiques
- ✅ Distances entre œuvres

## 🚀 Utilisation

### Python Direct

```python
from rag.parcours.intelligent_path_generator import generer_parcours_intelligent

# Générer un parcours
parcours = generer_parcours_intelligent(
    age_cible='adulte',
    thematique='technique_picturale',
    style_texte='analyse',
    max_artworks=10,
    target_duration_minutes=30,  # Optionnel
    variation_seed=1234  # Optionnel (reproductibilité)
)

print(f"Parcours généré: {parcours['parcours_id']}")
print(f"Œuvres: {len(parcours['artworks'])}")
print(f"Durée: {parcours['metadata']['total_duration_minutes']} min")
```

### API REST

#### Générer un parcours
```bash
POST /api/parcours/generate

Body:
{
  "age_cible": "adulte",
  "thematique": "technique_picturale",
  "style_texte": "analyse",
  "max_artworks": 10,
  "target_duration_minutes": 30,
  "variation_seed": 1234
}

Response:
{
  "success": true,
  "parcours": {
    "parcours_id": "parcours_1234",
    "profil": {
      "age_cible": "adulte",
      "thematique": "technique_picturale",
      "style_texte": "analyse"
    },
    "metadata": {
      "artwork_count": 10,
      "total_distance_meters": 250.5,
      "total_duration_minutes": 35,
      "floors_visited": 2,
      "rooms_visited": 5
    },
    "artworks": [
      {
        "order": 1,
        "oeuvre_id": 42,
        "title": "Autoportrait",
        "artist": "Eugène Leroy",
        "date": "1989",
        "position": {
          "x": 150.5,
          "y": 200.3,
          "room": 1,
          "floor": 0
        },
        "narration": "Cette œuvre fascinante...",
        "narration_word_count": 180,
        "distance_to_next": 45.2
      },
      ...
    ]
  }
}
```

#### Voir les options disponibles
```bash
GET /api/parcours/preview

Response:
{
  "success": true,
  "options": {
    "age_cible": ["enfant", "ado", "adulte", "senior"],
    "thematique": ["technique_picturale", "biographie", "historique"],
    "style_texte": ["analyse", "decouverte", "anecdote"]
  },
  "stats": {
    "artworks_per_profile": {
      "adulte_technique_picturale_analyse": 5,
      "enfant_biographie_decouverte": 3,
      ...
    }
  }
}
```

## 📊 Algorithme

### 1. Récupération des Données
```
SELECT œuvres + narrations WHERE profil = (age, thème, style)
├─ Jointure oeuvres ⟷ pregenerations
├─ Jointure entities ⟷ points (positions)
└─ Filtrage par profil utilisateur
```

### 2. Sélection Intelligente
```
Diversité géographique:
├─ Prioriser différentes salles
├─ Équilibrer étages si multi-niveaux
└─ Respecter max_artworks et target_duration
```

### 3. Optimisation Chemin (Greedy Nearest Neighbor)
```
1. Départ: œuvre aléatoire
2. Pour chaque étape:
   ├─ Calculer distance à toutes les œuvres restantes
   ├─ Sélectionner la plus proche
   └─ Pénalité si changement d'étage (+1000m virtuel)
3. Répéter jusqu'à épuisement
```

### 4. Calcul Durée
```
Durée = Temps_marche + Temps_écoute

Temps_marche = Distance_totale / Vitesse_marche (1.2 m/s)
Temps_écoute = Σ(mots_narration) / 150 mots/min
```

## 🗺️ Structure de la Base de Données

```
oeuvres
├─ oeuvre_id (PK)
├─ title, artist, date, room
└─ pregenerations (narrations par profil)

entities (représentation spatiale)
├─ entity_id (PK)
├─ oeuvre_id (FK)
├─ entity_type (artwork, door, stairs...)
└─ points (coordonnées x, y)

pregenerations
├─ pregeneration_id (PK)
├─ oeuvre_id (FK)
├─ age_cible, thematique, style_texte
└─ pregeneration_text (narration)
```

## 🔮 Améliorations Futures

### Court Terme
- [ ] Gestion explicite des portes (accessibility matrix)
- [ ] Gestion explicite des escaliers (floor transitions)
- [ ] Prise en compte des salles fermées/temporaires
- [ ] Éviter backtracking (pas de retour en arrière inutile)

### Moyen Terme
- [ ] Algorithme 2-opt pour optimisation locale
- [ ] Préférences utilisateur (favoris, durée max...)
- [ ] Accessibilité PMR (ascenseurs, rampes)
- [ ] Horaires de visite (heures creuses/affluence)

### Long Terme
- [ ] Machine Learning pour préférences personnalisées
- [ ] Clustering thématique automatique
- [ ] Navigation indoor (Bluetooth beacons)
- [ ] Parcours guidés temps réel avec GPS indoor

## 🧪 Tests

```bash
# Test unitaire
docker exec museum-backend python /app/test_parcours_generator.py

# Test API
curl -X POST http://localhost:5000/api/parcours/generate \
  -H "Content-Type: application/json" \
  -d '{
    "age_cible": "adulte",
    "thematique": "technique_picturale",
    "style_texte": "analyse",
    "max_artworks": 8
  }'
```

## 📝 Notes Techniques

### Complexité
- **Sélection**: O(n) avec diversité
- **Optimisation**: O(n²) Nearest Neighbor
- **Total**: O(n²) acceptable pour n < 100 œuvres

### Reproductibilité
Utiliser `variation_seed` pour générer le même parcours:
```python
parcours1 = generer_parcours_intelligent(..., variation_seed=42)
parcours2 = generer_parcours_intelligent(..., variation_seed=42)
# parcours1 == parcours2 ✅
```

### Limitations Actuelles
- Distance "à vol d'oiseau" (pas de vraie navigation)
- Pénalité escaliers fixe (+1000m)
- Pas de gestion des salles fermées
- Seed aléatoire pour diversité (peut générer chemins sous-optimaux)

## 📚 Références

- **Nearest Neighbor Algorithm**: Algorithme greedy classique
- **Traveling Salesman Problem (TSP)**: Variante du problème du voyageur de commerce
- **Museum Visitor Studies**: Temps moyen de visite, vitesse de marche
