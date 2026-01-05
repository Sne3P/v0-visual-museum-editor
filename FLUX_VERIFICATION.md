# Vérification des Flux Complets - Museum Voice

## ✅ FLUX 1: Upload PDF → Extraction Métadonnées

### Fichiers impliqués:
1. **Frontend**: `features/canvas/components/ArtworkPropertiesModal.tsx`
   - Ligne 100-165: Upload PDF + Extraction métadonnées
   - Appelle `/api/artwork-pdf` puis `/api/extract-pdf-metadata`
   
2. **API Upload**: `app/api/artwork-pdf/route.ts`
   - Sauvegarde le PDF dans `/uploads/pdfs/`
   
3. **API Extraction**: `app/api/extract-pdf-metadata/route.ts`
   - Proxy vers le backend Flask
   
4. **Backend**: `backend/rag/main_postgres.py`
   - Ligne 285-350: Route `/api/pdf/extract-metadata`
   - Utilise `ModelCompliantPDFProcessor` pour extraire métadonnées
   
### Données extraites:
- `title`: Titre de l'œuvre
- `artist`: Nom de l'artiste  
- `date_oeuvre`: Date de création
- `materiaux`: Matériaux et technique
- `description`: Description de l'œuvre
- + autres champs (provenance, contexte, analyse, etc.)

### Résultat:
✅ Les métadonnées sont stockées dans `artwork.metadata` dans l'état React

---

## ✅ FLUX 2: Sauvegarde Plan → Préservation Données

### Fichiers impliqués:
1. **Export**: `core/services/database.service.ts`
   - Ligne 190-217: Construction objet oeuvre avec metadata
   - Récupère `artwork.metadata` et le transmet au format JSON
   
2. **API Save**: `app/api/save-to-db/route.ts`
   - **Ligne 67** ⚠️ CRITIQUE: `UPDATE entities SET oeuvre_id = NULL` 
     - Casse la cascade FK avant TRUNCATE pour préserver oeuvres
   - **Ligne 70**: `TRUNCATE entities, points, relations, plans` 
     - Exclut `oeuvres` du TRUNCATE
   - **Ligne 85-132**: `INSERT ... ON CONFLICT DO UPDATE`
     - UPSERT des oeuvres pour préserver pregenerations
   
### Suppressions AUTORISÉES:
- ✅ `entities` (reconstruites à chaque save)
- ✅ `points` (reconstruites à chaque save)
- ✅ `relations` (reconstruites à chaque save)
- ✅ `plans` (reconstruits à chaque save)
- ✅ `chunk` (CASCADE depuis entities)

### Suppressions INTERDITES:
- ❌ `oeuvres` → Préservées via UPSERT
- ❌ `pregenerations` → Protégées car oeuvres non supprimées
- ❌ Métadonnées → Mises à jour via ON CONFLICT DO UPDATE

### Vérification:
```sql
-- AVANT sauvegarde:
SELECT COUNT(*) FROM pregenerations;  -- Résultat: 144

-- SAUVEGARDER LE PLAN depuis l'éditeur

-- APRÈS sauvegarde:
SELECT COUNT(*) FROM pregenerations;  -- Résultat attendu: 144 ✅
SELECT artist FROM oeuvres WHERE oeuvre_id = 1;  -- Résultat: "Eugène Leroy" ✅
```

---

## ✅ FLUX 3: Chargement Plan → Reconstruction Métadonnées

### Fichiers impliqués:
1. **API Load**: `app/api/load-from-db/route.ts`
   - **Ligne 95-125**: Reconstruction artworks avec métadonnées ✅
   - Charge `oeuvre.artist`, `oeuvre.date_oeuvre`, etc.
   - Reconstruit `artwork.metadata` depuis colonnes BDD
   
### Données chargées:
```typescript
{
  id: "artwork-4",
  name: "Profil sombre",
  artist: "Eugène Leroy",  // ✅ Chargé depuis BDD
  pdfPath: "/uploads/pdfs/...",
  metadata: {
    title: "Profil sombre",
    artist: "Eugène Leroy",
    date_oeuvre: "1986",
    materiaux: "Huile sur toile",
    provenance: "Collection LaM",
    // ... autres champs
  }
}
```

### Vérification:
- Recharger le plan dans l'éditeur → Métadonnées présentes ✅
- Aller sur `/admin/dashboard` → Artist et date affichés ✅

---

## 🔍 POINTS DE CONTRÔLE

### 1. Test Upload PDF
```
1. Aller dans l'éditeur
2. Sélectionner un artwork
3. Cliquer "Upload PDF"
4. Vérifier logs: "✅ Métadonnées extraites: <titre> / <artiste>"
```

### 2. Test Sauvegarde
```sql
-- Avant save:
SELECT COUNT(*) FROM pregenerations;  -- 144
SELECT artist FROM oeuvres WHERE oeuvre_id = 1;  -- "Eugène Leroy"

-- SAUVEGARDER PLAN

-- Après save:
SELECT COUNT(*) FROM pregenerations;  -- Doit rester 144
SELECT artist FROM oeuvres WHERE oeuvre_id = 1;  -- Doit rester "Eugène Leroy"
```

### 3. Test Chargement
```
1. Recharger la page éditeur (F5)
2. Cliquer "Charger le plan"
3. Sélectionner un artwork
4. Vérifier que les métadonnées sont présentes
```

### 4. Test Dashboard Admin
```
1. Aller sur /admin/dashboard
2. Vérifier que "Artist" et "Date" sont affichés
3. Ne pas voir "Artiste inconnu" ❌
```

---

## 🐛 BUGS CORRIGÉS

### Bug #1: Narrations supprimées à chaque save
**Cause**: `TRUNCATE oeuvres CASCADE` supprimait pregenerations  
**Solution**: 
- Ligne 67: `UPDATE entities SET oeuvre_id = NULL` (casse FK)
- Ligne 70: Exclure `oeuvres` du TRUNCATE  
- Ligne 85: UPSERT au lieu de INSERT  

### Bug #2: Métadonnées non chargées
**Cause**: `load-from-db/route.ts` ne récupérait pas les métadonnées  
**Solution**: Ligne 111-124: Reconstruction de `metadata` depuis colonnes BDD

### Bug #3: Métadonnées écrasées
**Cause**: `save-to-db` cherchait `metadata.materiaux` au lieu de `meta.materiaux`  
**Solution**: Ligne 82: Variable `meta` avec fallback sur les deux sources

---

## 📊 ÉTAT ACTUEL (Testé le 2026-01-05)

```sql
-- OEUVRES
oeuvre_id | title                 | artist       | date_oeuvre
---------+-----------------------+--------------+-------------
1        | Profil sombre         | Eugène Leroy | 1986
2        | L'Enfant              | Eugène Leroy | 1986
3        | Paysage               | Eugène Leroy | 1986
4        | Autoportrait (lichen) | Eugène Leroy | 1986

-- NARRATIONS
SELECT COUNT(*) FROM pregenerations;  -- 144 ✅

-- ENTITIES
entity_id | name                 | oeuvre_id
---------+----------------------+-----------
4        | Profil sombre         | 1
5        | L'Enfant              | 2
6        | Paysage               | 3
7        | Autoportrait (lichen) | 4
```

✅ **Tout fonctionne correctement !**
