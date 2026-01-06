# 🎯 PLAN D'ACTION: PIPELINE GÉNÉRATION NARRATIONS

## 📋 STRATÉGIE CHOISIE

### **Timing: À CHAQUE LANCEMENT DE PRÉGÉNÉRATION (pas à l'upload)**

**Raison**:
- Les métadonnées PDF peuvent être améliorées/corrigées après upload
- Les chunks doivent être crééschaque fois pour éviter stale data
- Permet regen forcée : `force_regenerate=true` → TRUNCATE chunks + embeddings + indices
- Workflow simple et clair

**Flux**:
```
Upload PDF
  ↓
Extraction métadonnées (extract-pdf-metadata) → sauvegarde oeuvre
  ↓
Clic bouton "Générer Narrations" au dashboard
  ↓
Prégénération:
  1. Supprimer anciens chunks/embeddings/index (si force_regenerate=true)
  2. Créer chunks sémantiques depuis métadonnées
  3. Créer embeddings pour chaque chunk
  4. Construire index FAISS
  5. Générer 36 narrations avec RAG + Ollama
  6. Sauvegarder pregenerations
```

---

## ✅ COMPOSANTS EXISTANTS

### 1. **Dashboard** ✅ 
- Bouton "Générer pour 1 œuvre" → appelle `POST /api/admin/pregenerate-artwork/{oeuvreId}`
- Bouton "Générer pour TOUTES" → appelle `POST /api/admin/pregenerate-all`
- Affiche stats et liste prégénérations

### 2. **Routes NextJS** ✅
- `POST /api/admin/pregenerate-artwork/[oeuvreId]` → proxy vers backend
- `POST /api/admin/pregenerate-all` → proxy vers backend
- `POST /api/extract-pdf-metadata` → extraction PDF (proxy)

### 3. **Backend Python** ✅
- `ollama_pregeneration_complete.py` → orchestration complète
- `chunk_creator_postgres.py` → crée chunks depuis métadonnées
- `ollama_generator.py` → génère narrations (ANCIEN - à remplacer)

---

## 🔧 AMÉLIORATIONS À FAIRE

### 1. **Remplacer Générateur Ancien par Nouveau**
- ✅ Nouveau fichier créé: `ollama_generator_improved.py`
- ❌ Pas encore intégré dans `ollama_pregeneration_complete.py`

**À faire**:
```python
# Dans ollama_pregeneration_complete.py ligne ~13
# AVANT:
from rag.core.ollama_generator import get_ollama_generator

# APRÈS:
from rag.core.ollama_generator_improved import get_factual_generator as get_ollama_generator
```

### 2. **Optimiser Création de Chunks**
**Problème actuel**: Chunks créés avec juste les colonnes métadonnées  
**Amélioration**: Mieux structurer + contextualiser par thématique

**Fichier**: `backend/rag/traitement/chunk_creator_postgres.py`

Ajouter:
- Chunks organisés par catégorie (technique, biographie, historique)
- Chunks avec titre + contexte pour meilleure pertinence
- Limite longueur chunks (max 500 chars pour mieux matcher)
- Poids/priorité des chunks selon pertinence

### 3. **Optimiser Embeddings**
**Fichier**: `backend/rag/core/rag_engine_postgres.py`

Vérifier:
- Model embedding utilisé (SentenceTransformer?)
- Batch processing pour paralléliser
- Caching embeddings déjà créés

### 4. **Optimiser Index FAISS**
- Vérifier construction efficace
- Vérifier utilisation CPU (pas GPU)
- Tester taille index pour perf

### 5. **Vérifier Prompts & Contexte**
- Vérifier contexte RAG bien construit (top chunks pertinents)
- Vérifier prompts adaptés per profil
- Vérifier pas d'appels redondants

### 6. **Configuration CPU/RAM/Parallélisation**
**Ollama params**:
```python
{
    "num_gpu": 0,          # Force CPU
    "num_thread": 8,       # 8 threads
    "num_batch": 1024,     # Batch parallelization
    "num_ctx": 2048,       # Contexte window
    "temperature": 0.2,    # Ultra-factuel
}
```

**Parallélisation**:
- Générer 36 narrations en parallèle (non-blocking)
- Utiliser ThreadPoolExecutor ou asyncio
- Max workers = nombre CPU - 1

---

## 🚀 CHECKLIST À COMPLÉTER

### Phase 1: Intégration Générateur Amélioré
- [ ] Modifier import dans `ollama_pregeneration_complete.py`
- [ ] Tester que le nouveau générateur est appelé
- [ ] Vérifier logs mentionnent "OllamaFactualGenerator"

### Phase 2: Amélioration Chunks
- [ ] Améliorer `chunk_creator_postgres.py` avec meilleure structure
- [ ] Ajouter chunks par thématique
- [ ] Tester création chunks pour 1 œuvre

### Phase 3: Optimisation Embeddings & FAISS
- [ ] Vérifier configuration dans `rag_engine_postgres.py`
- [ ] Tester batch processing
- [ ] Vérifier utilisation CPU uniquement

### Phase 4: Tests Intégration
- [ ] Tester upload PDF
- [ ] Tester extraction métadonnées
- [ ] Tester génération 1 narration (time + RAM)
- [ ] Tester génération 36 narrations (parallelisé)
- [ ] Vérifier contenu narrations (factuel, pas d'hallucination)

### Phase 5: Reset & Test Complet
- [ ] Nettoyer base de données
- [ ] Tester flux complet: créer plan → ajouter oeuvres → upload PDF → générer narrations → générer parcours

---

## 📊 MÉTRIQUES À VALIDER

**Après génération 1 narration**:
- Temps: < 5 secondes
- Chunks créés: 5-8 pour l'œuvre
- Embeddings créés: 5-8 (1 par chunk)
- Narration longueur: 150-300 mots
- Narration factuelle: ✅ (pas "peut-être", "Bonjour", etc.)

**Après génération 36 narrations**:
- Temps total: < 3-4 minutes (avec parallélisation)
- CPU usage: 60-80%
- RAM usage: < 8 GB
- Toutes 36 prégénérations sauvegardées
- Variation: ✅ (chaque profil différent)

**À vérifier**:
```sql
-- Chunks créés:
SELECT COUNT(*) FROM chunk WHERE oeuvre_id = 1;  -- Doit être 5-8

-- Embeddings créés:
SELECT COUNT(*) FROM embeddings e 
JOIN chunk c ON e.chunk_id = c.chunk_id
WHERE c.oeuvre_id = 1;  -- Doit être 5-8

-- Narrations générées:
SELECT COUNT(*) FROM pregenerations WHERE oeuvre_id = 1;  -- Doit être 36

-- Contenu narratif:
SELECT pregeneration_text FROM pregenerations WHERE oeuvre_id = 1 LIMIT 1;
-- Vérifier: pas "Bonjour", pas "peut-être", contient info du PDF
```

---

## ⚠️ POINTS CRITIQUES

1. **Ollama doit tourner** avant de lancer prégénération
   - Vérifier: `curl http://localhost:11434/api/tags`

2. **PostgreSQL doit être accessible**
   - Vérifier: `docker ps | grep museum-db`

3. **Modèle Mistral doit être chargé**
   - Si pas dispo: `ollama pull mistral`

4. **Force_regenerate=true** supprime les anciennes données:
   - ⚠️ À utiliser avec précaution
   - Utiliser pour améliorer chunks/embeddings/prompts

5. **Pas de GPU disponible**:
   - ✅ Configuration CPU-only dans `ollama_generator_improved.py`
   - Peut être lent pour gros modèles

---

## 📝 PROCHAINES ÉTAPES EXACT

1. **Modifier import** dans `ollama_pregeneration_complete.py`
2. **Améliorer chunks** dans `chunk_creator_postgres.py`
3. **Vérifier/optimiser** `rag_engine_postgres.py`
4. **Test manuel**:
   ```bash
   # Terminal 1: Backend
   cd backend && python -m rag.main_postgres
   
   # Terminal 2: Frontend
   cd .. && npm run dev
   
   # Browser: /admin/dashboard
   # Créer plan + œuvre + upload PDF + clic "Générer"
   ```
5. **Vérifier BDD**: Chunks, embeddings, narrations créés
6. **Reset complet**: Nettoyer base
7. **Test flux**: Complet plan → œuvre → PDF → narraitons → parcours

---

## 🎯 OBJECTIF FINAL

Quand tu dis "C'est bon" = système prêt à tester:
- ✅ Générateur factuel intégré
- ✅ Chunks optimisés
- ✅ Embeddings & FAISS fonctionnels
- ✅ Tout optimisé CPU/RAM
- ✅ Pas d'hallucinations
- ✅ Prêt à réinitialiser et tester flux complet
