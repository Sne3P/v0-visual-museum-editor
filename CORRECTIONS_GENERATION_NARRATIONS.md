# 🔧 CORRECTIONS SYSTÈME DE GÉNÉRATION DE NARRATIONS

## ❌ PROBLÈMES IDENTIFIÉS

### 1. **Chunks Inutiles Créés par le Frontend**
**Fichier**: `core/services/database.service.ts` ligne 280-283  
**Problème**: Création de chunks vides avec juste `artwork.name`  
**Impact**: Pollue la base de données, aucun contenu RAG réel

### 2. **PDF Jamais Extrait pour RAG**
**Problème**: Le PDF est uploadé mais jamais traité pour extraire le texte  
**Impact**: Pas de chunks RAG → pas de contexte → narrations inventées

### 3. **Prompts Peu Factuels**
**Fichier**: `backend/rag/core/ollama_generator.py`  
**Problèmes**:
- Température trop haute (0.4) → créativité excessive
- Validation trop permissive (ligne 291-295)
- Instructions peu claires sur interdiction d'inventer

### 4. **Configuration Ollama Non Optimisée**
**Problème**: Paramètres par défaut, pas de force CPU explicite  
**Impact**: Peut utiliser GPU, performances variables

---

## ✅ CORRECTIONS APPLIQUÉES

### 1. **Suppression Chunks Frontend** ✅
**Fichiers modifiés**:
- `core/services/database.service.ts` (lignes 56-76, 100-118, 275-283, 482)
- `app/api/save-to-db/route.ts` (lignes 191-199)

**Actions**:
- ❌ Supprimé création `chunks.push({ chunk_text: artwork.name })`
- ❌ Supprimé `chunkIdCounter` inutile
- ❌ Supprimé interface `chunks: Array<...>`
- ✅ Ajouté commentaire: "Chunks créés par backend lors extraction PDF"

### 2. **Générateur Factuel Optimisé** ✅
**Nouveau fichier**: `backend/rag/core/ollama_generator_improved.py`

**Améliorations**:
- ✅ **Température ultra-basse**: 0.2 (vs 0.4) → factuel strict
- ✅ **top_p réduit**: 0.75 (vs 0.9) → moins de créativité
- ✅ **top_k réduit**: 40 (vs 50) → choix plus déterministes
- ✅ **Force CPU**: `num_gpu: 0` → utilise CPU/RAM uniquement
- ✅ **Prompts clairs**: Instructions explicites "N'invente RIEN"
- ✅ **Validation stricte**: Détecte spéculation, salutations, formules

**Règles linguistiques implémentées**:
- ❌ Pas de pluriel ("les amis" interdit)
- ❌ Pas de genre sauf si factuel
- ❌ Pas de salutations ("Bonjour", "Salut", "Aujourd'hui")
- ❌ Pas de formules d'accroche ("Voici", "Regardez")
- ✅ Commence DIRECTEMENT par le contenu

**Validation anti-hallucination**:
```python
# Détecte et REJETTE:
- "on raconte", "la légende", "selon certains"
- "probablement", "peut-être", "il se pourrait"
- Salutations en début
- Longueur anormale (< 100 ou > 350 mots)
```

### 3. **Configuration Ollama Optimisée**
```python
{
    "temperature": 0.2,        # Ultra-factuel (vs 0.4)
    "top_p": 0.75,            # Strict (vs 0.9)
    "top_k": 40,              # Réduit (vs 50)
    "num_predict": 200,       # 200 mots max
    "num_ctx": 2048,          # Contexte réduit = rapide
    "num_batch": 1024,        # Batch CPU
    "num_thread": 8,          # 8 threads CPU
    "num_gpu": 0,             # FORCE CPU (pas GPU)
    "repeat_penalty": 1.2     # Anti-répétition forte
}
```

---

## 🔄 FLUX CORRECT À IMPLÉMENTER

### Pipeline Complet:
```
1. Upload PDF via frontend
   ↓
2. /api/extract-pdf-metadata
   - Extrait texte PDF (PyPDF2)
   - Parse sections (modèle structuré)
   - Sauvegarde métadonnées en BDD
   ↓
3. Backend crée chunks RAG
   - chunk_creator_postgres.py
   - Découpe en chunks sémantiques
   - Sauvegarde chunks en BDD
   ↓
4. Backend crée embeddings
   - SentenceTransformer
   - Calcule vecteurs pour chaque chunk
   - Sauvegarde dans table `embeddings`
   ↓
5. Backend crée index FAISS
   - Construit index vectoriel
   - Sauvegarde sur disque
   ↓
6. Prégénération narrations
   - Pour chaque profil (36 combinaisons)
   - RAG: récupère chunks pertinents
   - Ollama: génère narration FACTUELLE
   - Validation stricte
   - Sauvegarde dans `pregenerations`
```

---

## 📋 TÂCHES RESTANTES

### Priorité 1: Activer Nouveau Générateur
- [ ] Remplacer import dans `ollama_pregeneration_complete.py`:
  ```python
  # Ancien
  from rag.core.ollama_generator import get_ollama_generator
  
  # Nouveau
  from rag.core.ollama_generator_improved import get_factual_generator as get_ollama_generator
  ```

### Priorité 2: Dashboard Prégénération
- [ ] Ajouter bouton "Générer Narrations" dans `/admin/dashboard`
- [ ] Appelle `/api/backend/pregenerate` avec `oeuvre_id`
- [ ] Affiche progression (36 narrations)
- [ ] Affiche résultat (générées/erreurs)

### Priorité 3: API Prégénération
- [ ] Créer `/app/api/backend/pregenerate/route.ts`:
  ```typescript
  POST /api/backend/pregenerate
  Body: { oeuvre_id: number, force_regenerate?: boolean }
  
  Appelle backend Python:
  - Crée chunks (si pas déjà fait)
  - Crée embeddings
  - Construit FAISS
  - Génère 36 narrations
  
  Returns: { success, stats: { generated, updated, errors } }
  ```

### Priorité 4: Tests
- [ ] Upload PDF test
- [ ] Vérifier chunks créés (`SELECT * FROM chunk WHERE oeuvre_id=X`)
- [ ] Vérifier embeddings (`SELECT COUNT(*) FROM embeddings e JOIN chunk c ...`)
- [ ] Lancer prégénération
- [ ] Vérifier narrations (`SELECT * FROM pregenerations WHERE oeuvre_id=X`)
- [ ] Tester génération parcours

---

## 🔍 VÉRIFICATIONS

### Chunks en BDD:
```sql
-- Doit retourner 5-8 chunks par œuvre (pas 1 seul avec le nom)
SELECT oeuvre_id, COUNT(*) as chunk_count, 
       AVG(LENGTH(chunk_text)) as avg_length
FROM chunk
GROUP BY oeuvre_id;
```

### Embeddings:
```sql
-- Doit avoir autant d'embeddings que de chunks
SELECT 
  (SELECT COUNT(*) FROM chunk) as total_chunks,
  (SELECT COUNT(*) FROM embeddings) as total_embeddings;
```

### Index FAISS:
```bash
# Doit exister sur disque
ls -la /app/rag/indexes/museum_postgres/artwork_*.faiss
ls -la /app/rag/indexes/museum_postgres/artwork_*.mapping
```

### Narrations Factuelles:
```sql
-- Vérifier contenu (pas de "Bonjour", "peut-être", etc.)
SELECT pregeneration_text 
FROM pregenerations 
WHERE oeuvre_id = 1 
LIMIT 5;
```

---

## 📊 MÉTRIQUES CIBLES

- **Chunks par œuvre**: 5-8 (vs 1 actuellement)
- **Longueur chunk**: 200-500 caractères (vs 20 actuellement)
- **Temps génération**: ~3-5s par narration (36 narrations = ~2min)
- **Taux validation**: > 90% (rejection stricte hallucinations)
- **Contenu factuel**: 100% basé sur PDF (zéro invention)

---

## 🚀 POUR ACTIVER

1. **Backend**: Redémarrer avec nouveau générateur
   ```bash
   docker-compose restart backend
   ```

2. **Test Upload PDF**:
   - Uploader un PDF via `/editor`
   - Vérifier extraction: `SELECT * FROM oeuvres WHERE oeuvre_id=X`
   - Chunks auto-créés? `SELECT COUNT(*) FROM chunk WHERE oeuvre_id=X`

3. **Si chunks pas créés**:
   - Appeler manuellement: `POST /api/backend/create-chunks` avec `{oeuvre_id}`
   - Ou intégrer dans `extract-pdf-metadata`

4. **Générer Narrations**:
   - `POST /api/backend/pregenerate` avec `{oeuvre_id}`
   - Attend ~2min pour 36 narrations
   - Vérifier: `SELECT COUNT(*) FROM pregenerations WHERE oeuvre_id=X` → doit être 36

---

## ⚠️ POINTS D'ATTENTION

- **Ne jamais truncate chunk** sans vérifier pregenerations
- **Ollama doit tourner** avant prégénération
- **PDF doit être valide** et structuré
- **RAM**: Mistral utilise ~4-8 GB avec num_ctx=2048
- **CPU**: Avec 8 threads, occupe ~60-80% pendant génération

---

## 📝 DOCUMENTATION AJOUTÉE

- `ollama_generator_improved.py`: Commentaires détaillés
- `database.service.ts`: Explication suppression chunks
- `save-to-db/route.ts`: Référence pipeline RAG
- Ce fichier: Guide complet corrections
