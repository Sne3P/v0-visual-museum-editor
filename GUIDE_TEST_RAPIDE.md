# 🧪 GUIDE TEST RAPIDE - Commandes & Vérifications

## 📋 AVANT TEST (Optionnel: Reset DB)

```bash
# Se connecter au container DB
docker exec -it museum-db psql -U museum_admin -d museumvoice

# Reset propre (garde oeuvres, supprime chunks/narrations)
TRUNCATE chunk CASCADE;
TRUNCATE pregenerations CASCADE;
-- Les embeddings sont supprimés automatiquement (CASCADE from chunk)

# Vérifier état initial
SELECT COUNT(*) FROM oeuvres;  -- Doit avoir vos œuvres
SELECT COUNT(*) FROM chunk;    -- Doit être 0
SELECT COUNT(*) FROM embeddings;  -- Doit être 0
SELECT COUNT(*) FROM pregenerations;  -- Doit être 0
```

---

## 🎯 PENDANT TEST

### **1. Générer narrations pour 1 œuvre**

Dashboard → Clic "Générer" pour œuvre ID X

### **2. Monitor logs backend**

```bash
# Terminal séparé
docker logs -f museum-backend

# Chercher:
# ✅ "X chunks créés pour l'œuvre Y"
# ✅ "Embeddings created: X"
# ✅ "FAISS index built"
# ✅ "36 narrations" ou "Générées: 36"
```

---

## ✅ APRÈS TEST - Vérifications SQL

### **A. Chunks créés (5-8 attendus)**

```sql
SELECT 
    chunk_id,
    chunk_index,
    LENGTH(chunk_text) as size_bytes,
    SUBSTRING(chunk_text, 1, 50) as preview
FROM chunk 
WHERE oeuvre_id = 1  -- Remplacer par votre ID
ORDER BY chunk_index;

-- Expected:
-- chunk_index | size_bytes | preview
-- 0           | ~300       | RÉFÉRENCE ŒUVRE Titre : ...
-- 1           | ~1200      | CONTEXTE HISTORIQUE ...
-- 2           | ~1200      | DESCRIPTION ...
-- etc.
```

### **B. Embeddings créés (COUNT = COUNT chunks)**

```sql
SELECT COUNT(*) as embeddings_count
FROM embeddings e
JOIN chunk c ON e.chunk_id = c.chunk_id
WHERE c.oeuvre_id = 1;

-- Expected: Même nombre que chunks (5-8)

-- Vérifier dimension
SELECT DISTINCT vector_dimension, model_name
FROM embeddings e
JOIN chunk c ON e.chunk_id = c.chunk_id
WHERE c.oeuvre_id = 1;

-- Expected:
-- vector_dimension | model_name
-- 384              | all-MiniLM-L6-v2
```

### **C. FAISS index fichiers créés**

```bash
# Dans container backend
docker exec museum-backend ls -lh /app/rag/indexes/museum_postgres/

# Expected:
# artwork_1.faiss    (~2KB pour 5-8 chunks)
# artwork_1.mapping  (~1KB)
```

### **D. Narrations générées (36 attendues)**

```sql
SELECT COUNT(*) as narrations_count
FROM pregenerations
WHERE oeuvre_id = 1;

-- Expected: 36

-- Distribution par critères
SELECT 
    age_cible,
    thematique,
    style_texte,
    COUNT(*) as count
FROM pregenerations
WHERE oeuvre_id = 1
GROUP BY age_cible, thematique, style_texte
ORDER BY age_cible, thematique, style_texte;

-- Expected: 36 rows (4 ages × 3 thèmes × 3 styles)
```

### **E. Qualité narrations (pas de spéculation)**

```sql
-- Chercher patterns interdits
SELECT 
    pregeneration_id,
    age_cible,
    thematique,
    style_texte,
    CASE
        WHEN pregeneration_text ILIKE '%peut-être%' THEN 'PEUT-ÊTRE détecté'
        WHEN pregeneration_text ILIKE '%probablement%' THEN 'PROBABLEMENT détecté'
        WHEN pregeneration_text ILIKE '%on pense%' THEN 'ON PENSE détecté'
        WHEN pregeneration_text ILIKE '%Bonjour%' THEN 'BONJOUR détecté'
        ELSE 'OK'
    END as validation
FROM pregenerations
WHERE oeuvre_id = 1
AND (
    pregeneration_text ILIKE '%peut-être%' 
    OR pregeneration_text ILIKE '%probablement%'
    OR pregeneration_text ILIKE '%on pense%'
    OR pregeneration_text ILIKE '%Bonjour%'
);

-- Expected: 0 rows (aucun pattern interdit)
```

### **F. Taille narrations (100-350 mots)**

```sql
SELECT 
    age_cible,
    thematique,
    style_texte,
    LENGTH(pregeneration_text) as chars,
    array_length(string_to_array(pregeneration_text, ' '), 1) as words
FROM pregenerations
WHERE oeuvre_id = 1
ORDER BY words;

-- Expected:
-- words entre 100-350 pour la majorité
-- chars entre 500-2000
```

---

## 📊 MÉTRIQUES PERFORMANCE

### **A. Temps total attendu**

```
Setup RAG:
  - Chunks creation: 1-2s
  - Embeddings: 2-3s (5-8 chunks)
  - FAISS index: <1s

Génération 36 narrations:
  - Actuel (séquentiel): 3-5 min (36 × 5-8s)
  - Optimisé (parallèle): 1-2 min (36 / 8 × 5-8s)

Total: 3-6 min (actuel) ou 1-3 min (optimisé)
```

### **B. Query temps génération**

```sql
SELECT 
    oeuvre_id,
    MIN(created_at) as premiere_narration,
    MAX(created_at) as derniere_narration,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) as duree_secondes
FROM pregenerations
WHERE oeuvre_id = 1
GROUP BY oeuvre_id;

-- Expected:
-- duree_secondes: 180-300s (3-5 min) si séquentiel
```

---

## 🔍 DIAGNOSTICS PROBLÈMES

### **Si chunks = 0**

```sql
-- Vérifier œuvre existe
SELECT oeuvre_id, title, artist FROM oeuvres WHERE oeuvre_id = 1;

-- Vérifier métadonnées
SELECT 
    oeuvre_id,
    COALESCE(LENGTH(contexte_commande), 0) as ctx_len,
    COALESCE(LENGTH(description), 0) as desc_len,
    COALESCE(LENGTH(iconographie_symbolique), 0) as icon_len
FROM oeuvres 
WHERE oeuvre_id = 1;

-- Si toutes longueurs = 0 → PDF pas extrait ou métadonnées vides
```

### **Si embeddings = 0**

```sql
-- Vérifier chunks existent
SELECT COUNT(*) FROM chunk WHERE oeuvre_id = 1;

-- Si chunks > 0 mais embeddings = 0 → erreur création embeddings
-- Check logs backend: "sentence-transformers" errors
```

### **Si narrations < 36**

```sql
-- Voir combien générées
SELECT COUNT(*) FROM pregenerations WHERE oeuvre_id = 1;

-- Voir les combinaisons manquantes
SELECT 
    ages.age,
    themes.theme,
    styles.style
FROM 
    (VALUES ('enfant'), ('ado'), ('adulte'), ('senior')) AS ages(age)
CROSS JOIN
    (VALUES ('technique_picturale'), ('biographie'), ('historique')) AS themes(theme)
CROSS JOIN
    (VALUES ('analyse'), ('decouverte'), ('anecdote')) AS styles(style)
EXCEPT
SELECT age_cible, thematique, style_texte
FROM pregenerations
WHERE oeuvre_id = 1;

-- Check logs backend pour erreurs Ollama
```

### **Si narrations vides ou trop courtes**

```sql
SELECT 
    pregeneration_id,
    age_cible,
    LENGTH(pregeneration_text) as chars,
    array_length(string_to_array(pregeneration_text, ' '), 1) as words
FROM pregenerations
WHERE oeuvre_id = 1
AND (
    pregeneration_text IS NULL 
    OR LENGTH(pregeneration_text) < 100
);

-- Si plusieurs rows → problème génération Ollama
-- Check: Ollama running? Model pulled? Timeout?
```

---

## 🧹 CLEANUP APRÈS TEST

### **Supprimer narrations test**

```sql
DELETE FROM pregenerations WHERE oeuvre_id = 1;
-- Cascade supprime automatiquement les relations
```

### **Supprimer chunks/embeddings test**

```sql
DELETE FROM chunk WHERE oeuvre_id = 1;
-- Cascade supprime embeddings automatiquement
```

### **Reset complet si besoin**

```sql
TRUNCATE chunk CASCADE;
TRUNCATE pregenerations CASCADE;
-- Garde oeuvres, plans, entities
```

---

## ✅ CHECKLIST TEST RÉUSSI

- [ ] Chunks créés: 5-8 par œuvre
- [ ] Embeddings: COUNT = COUNT chunks
- [ ] FAISS files: artwork_X.faiss + artwork_X.mapping existent
- [ ] Narrations: 36 générées
- [ ] Qualité: Aucun pattern interdit (peut-être, probablement, Bonjour)
- [ ] Taille: 100-350 mots par narration
- [ ] Temps: < 6 min total (ou < 3 min si optimisé)
- [ ] Diversité: Variations visibles entre âges/thèmes/styles

---

## 🚀 SI TEST OK → PRODUCTION

1. **Générer pour toutes œuvres**
   - Dashboard → "Générer tout"
   - Ou API: POST /api/admin/pregenerate-all

2. **Monitor progression**
   ```sql
   SELECT 
       o.oeuvre_id,
       o.title,
       COUNT(p.pregeneration_id) as narrations
   FROM oeuvres o
   LEFT JOIN pregenerations p ON o.oeuvre_id = p.oeuvre_id
   GROUP BY o.oeuvre_id, o.title
   ORDER BY narrations DESC;
   ```

3. **Vérifier qualité globale**
   ```sql
   -- Stats globales
   SELECT 
       COUNT(DISTINCT oeuvre_id) as oeuvres_avec_narrations,
       COUNT(*) as total_narrations,
       AVG(array_length(string_to_array(pregeneration_text, ' '), 1)) as avg_words
   FROM pregenerations;
   ```

---

**Bon test! 🎯**
