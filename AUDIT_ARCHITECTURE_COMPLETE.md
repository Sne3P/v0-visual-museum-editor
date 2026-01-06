# 🔍 AUDIT COMPLET - ARCHITECTURE & PIPELINE GÉNÉRATION NARRATIONS

**Date**: 5 Janvier 2026  
**Version**: 1.0  
**Statut**: ✅ ARCHITECTURE VALIDE avec optimisations recommandées

---

## 📊 RÉSUMÉ EXÉCUTIF

### ✅ **VERDICT: BONNE STRATÉGIE, SCALABLE, QUELQUES OPTIMISATIONS POSSIBLES**

Votre architecture **chunks + embeddings + FAISS + RAG + LLM** est:
- ✅ **Correcte et standard** pour la génération contextuelle
- ✅ **Scalable** pour plusieurs musées
- ✅ **Bien structurée** (séparation concerns, cascades DB propres)
- ⚠️ **Optimisable** (réutilisation contexte, parallélisation, caching)

**Points forts majeurs**:
1. Séparation chunks/embeddings/FAISS = réutilisable
2. Pregenerations avec UNIQUE constraint = pas de doublons
3. Cascades ON DELETE = pas d'orphelins
4. force_regenerate = contrôle total sur régénération

**Optimisations recommandées** (détails ci-dessous):
1. **Batch contexte RAG** une seule fois pour 36 narrations (gain ~30%)
2. **Parallélisation Ollama** (8 threads → 36 narrations simultanées, gain ~70%)
3. **Cache prompts** par thématique (réutilisation base)
4. **Embeddings batch** (créer tous d'un coup vs 1 par 1)

---

## 🏗️ ANALYSE ARCHITECTURE

### 1. **STRATÉGIE CHUNKS + EMBEDDINGS + FAISS**

#### ✅ CE QUI EST BIEN:

**A. Création chunks sémantiques**
```python
# chunk_creator_postgres.py - Structure optimisée
CHUNK 0: MÉTADONNÉES ESSENTIELLES (titre, artiste, date, technique)
CHUNK 1: CONTEXTE HISTORIQUE & COMMANDE (1200 chars max)
CHUNK 2: DESCRIPTION & CONTEXTE ARTISTIQUE
CHUNK 3: ANALYSE TECHNIQUE & MATÉRIELLE
CHUNK 4: ICONOGRAPHIE & SYMBOLIQUE
CHUNK 5: RÉCEPTION CRITIQUE & POSTÉRITÉ
CHUNK 6: CONSERVATION & DOCUMENTATION
CHUNK 7: PROVENANCE
```

**Avantages**:
- ✅ **Sémantique claire**: Chaque chunk = 1 thématique précise
- ✅ **Labels explicites**: "CONTEXTE HISTORIQUE" vs "Contexte" (meilleur pour RAG)
- ✅ **Limite 1200 chars**: Optimal pour embeddings (ni trop court, ni trop long)
- ✅ **Fallback**: Minimum 2 chunks même si métadonnées incomplètes
- ✅ **Index**: chunk_index pour ordre préservé

**Pourquoi c'est pertinent**:
- Embeddings SentenceTransformer fonctionnent mieux avec chunks 200-1500 chars
- Thématiques séparées = meilleur matching RAG (technique vs biographie)
- Permet recherche précise ("technique picturale" → chunk 3, "historique" → chunk 1)

#### ✅ B. Embeddings & FAISS

**Configuration actuelle**:
```python
# rag_engine_postgres.py
model_name = "all-MiniLM-L6-v2"  # 384 dimensions
index = faiss.IndexFlatIP(dimension)  # Inner Product = cosine similarity
faiss.normalize_L2(vectors)  # Normalisation pour cosine
```

**Avantages**:
- ✅ **Modèle léger**: all-MiniLM-L6-v2 = 80MB, rapide CPU
- ✅ **Cosine similarity**: Meilleure mesure pour texte sémantique
- ✅ **1 index par œuvre**: Isolation propre, pas de pollution entre œuvres
- ✅ **Sauvegarde disque**: .faiss + .mapping = persistance
- ✅ **Normalisation L2**: Obligatoire pour cosine avec IndexFlatIP

**Pourquoi c'est pertinent**:
- FAISS = recherche vectorielle ultra-rapide (ms vs sec avec distance naive)
- Index séparé par œuvre = régénération facile (pas besoin rebuild global)
- Cosine = indépendant de la longueur (focus sur similarité sémantique)

#### ⚠️ CE QUI PEUT ÊTRE AMÉLIORÉ:

**A. Batch embeddings creation**
```python
# ACTUEL (rag_engine_postgres.py:102-135)
for chunk in chunks:
    embedding_vector = self.model.encode(chunk_text, convert_to_numpy=True)
    # INSERT 1 par 1
```

**❌ Problème**: 1 appel model.encode() par chunk = lent (setup/teardown overhead)

**✅ SOLUTION: Batch encoding**
```python
def create_embeddings_batch(self, oeuvre_id: int):
    chunks = get_artwork_chunks(oeuvre_id)
    chunk_texts = [c['chunk_text'] for c in chunks]
    
    # 1 seul appel pour tous les chunks
    all_embeddings = self.model.encode(chunk_texts, batch_size=32, convert_to_numpy=True)
    
    # Puis INSERT en batch
    values = [(chunk_id, pickle.dumps(emb), ...) for chunk_id, emb in zip(chunk_ids, all_embeddings)]
    cur.executemany("INSERT INTO embeddings ...", values)
```

**Gain estimé**: 30-50% plus rapide (5-8 chunks = 1 seul forward pass neural net)

**B. Cache contexte RAG**
```python
# ACTUEL (ollama_pregeneration_complete.py:88-92)
rag_context = self._build_artwork_rag_context(oeuvre_id, chunks)

# Puis pour CHAQUE narration (×36):
for age, theme, style:
    narration = ollama_gen.generate_narration(
        rag_context=rag_context,  # MEME contexte réutilisé ✅
        ...
    )
```

**✅ Déjà correct**: Contexte RAG créé 1× et réutilisé 36×

**💡 AMÉLIORATION POSSIBLE**: Filtrer chunks par thématique
```python
def _build_filtered_context(self, chunks, thematique):
    """Sélectionne chunks pertinents selon thématique"""
    if thematique == 'technique_picturale':
        # Prioriser chunk 3 (ANALYSE TECHNIQUE) + chunk 0 (MÉTADONNÉES)
        return chunks[0] + chunks[3] if len(chunks) > 3 else all_chunks
    elif thematique == 'biographie':
        # Prioriser chunk 2 (CONTEXTE ARTISTIQUE) + chunk 1 (HISTORIQUE)
        return chunks[0] + chunks[1] + chunks[2]
    elif thematique == 'historique':
        return chunks[0] + chunks[1] + chunks[5]  # + RÉCEPTION
```

**Avantage**: Contexte plus précis = meilleure génération (moins de bruit)
**Inconvénient**: Plus complexe, risque de manquer info importante
**Recommandation**: **Garder contexte complet actuel** (plus sûr), MAIS ajouter weights dans prompt

---

### 2. **SCALABILITÉ MULTI-MUSÉES**

#### ✅ ARCHITECTURE MULTI-TENANT READY

**Séparation par plan_id**:
```sql
-- Chaque musée = 1 plan_id
plans (plan_id, nom, description)
  ↓
entities (entity_id, plan_id, oeuvre_id)  -- FK plan_id
  ↓
oeuvres (oeuvre_id, title, artist, ...)

-- Chunks/embeddings/pregenerations liés à oeuvre_id uniquement
chunk (chunk_id, oeuvre_id)
embeddings (embedding_id, chunk_id)
pregenerations (pregeneration_id, oeuvre_id, age_cible, thematique, style_texte)
```

**✅ Points forts**:
1. **Isolation plan**: Chaque musée = 1 plan, géométrie séparée
2. **Partage œuvres**: Œuvres partagées entre plans (ex: Mona Lisa dans plusieurs musées)
3. **Pas de duplication RAG**: Chunks/embeddings/narrations par oeuvre_id (pas plan_id)
4. **Réutilisation**: Si 2 musées ont même œuvre → même pregenerations réutilisables

**💡 RECOMMANDATIONS SCALABILITÉ**:

**A. Ajouter champ museum_id (optionnel mais recommandé)**
```sql
ALTER TABLE plans ADD COLUMN museum_id INTEGER;
ALTER TABLE oeuvres ADD COLUMN museum_id INTEGER;

-- Pour filtrage facile:
SELECT * FROM oeuvres WHERE museum_id = 1;
SELECT * FROM pregenerations WHERE oeuvre_id IN (SELECT oeuvre_id FROM oeuvres WHERE museum_id = 1);
```

**B. Index FAISS global optionnel**
```python
# Actuellement: 1 index FAISS par œuvre
# artwork_1.faiss, artwork_2.faiss, ...

# Pour recherche cross-œuvres (futur):
# museum_1_global.faiss (toutes œuvres du musée 1)
```

**Avantage**: Recherche "tableaux impressionnistes dans tout le musée"  
**Pour l'instant**: Pas nécessaire (chaque narration = 1 œuvre spécifique)

**C. Paramètres musée-spécifiques**
```sql
CREATE TABLE museum_settings (
    museum_id SERIAL PRIMARY KEY,
    nom TEXT,
    ages_cibles TEXT[],  -- ['enfant', 'ado', 'adulte', 'senior']
    thematiques TEXT[],  -- Customizable par musée
    styles TEXT[],
    ollama_temperature REAL DEFAULT 0.2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Utilisation**:
```python
# Actuellement hardcodé:
self.ages = ['enfant', 'ado', 'adulte', 'senior']

# Version future:
settings = get_museum_settings(museum_id)
self.ages = settings['ages_cibles']  # Configurable!
```

**✅ VERDICT SCALABILITÉ**: Très bien structuré, prêt pour multi-musées

---

## 🔄 AUDIT PIPELINE COMPLÈTE

### **FLUX COMPLET: Plan → Œuvres → PDF → Chunks → Embeddings → FAISS → Narrations**

```
┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 1: CRÉATION PLAN & ŒUVRES (Frontend → save-to-db)   │
└─────────────────────────────────────────────────────────────┘
1. User crée plan dans éditeur
2. User ajoute artworks (upload PDF optionnel)
3. Click "Sauvegarder"
4. Frontend: database.service.ts → exportData
5. API: POST /api/save-to-db
6. DB: UPSERT oeuvres (ON CONFLICT = update, sinon insert)

✅ CORRECT:
- Pas de chunks créés frontend (pollution supprimée)
- ON CONFLICT = pas de doublons
- Métadonnées PDF extraites et sauvegardées

⚠️ ATTENTION:
- TRUNCATE chunk CASCADE (ligne 86) = SUPPRIME TOUS CHUNKS À CHAQUE SAVE
- Problème: Si user save plan → chunks régénérés inutilement

┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 2: EXTRACTION PDF (Optionnel)                        │
└─────────────────────────────────────────────────────────────┘
1. User upload PDF via frontend
2. API: POST /api/extract-pdf-metadata
3. Backend: /api/pdf/extract-metadata (PyPDF2)
4. Métadonnées → oeuvres table (update)

✅ CORRECT:
- Extraction métadonnées propre
- Sauvegarde dans colonnes dédiées (contexte_commande, iconographie, etc.)

⚠️ NOTE:
- Chunks PAS créés ici (bon!)
- Chunks créés uniquement au clic "Générer"

┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 3: GÉNÉRATION NARRATIONS (Dashboard → pregenerate)   │
└─────────────────────────────────────────────────────────────┘
1. User: Click "Générer" pour 1 œuvre
2. API: POST /api/admin/pregenerate-artwork/[oeuvreId]
3. Backend: ollama_pregeneration_complete.py

SUB-ÉTAPE 3.1: SETUP RAG
├─ chunk_creator_postgres.py
│  ├─ DELETE FROM chunk WHERE oeuvre_id = X  ← Supprime anciens
│  ├─ Crée 5-8 chunks sémantiques
│  └─ INSERT INTO chunk (chunk_text, chunk_index, oeuvre_id)
│
├─ rag_engine_postgres.py → create_embeddings_for_artwork()
│  ├─ Pour chaque chunk: model.encode(chunk_text)
│  ├─ Normalisation L2
│  └─ INSERT INTO embeddings (chunk_id, embedding_vector)
│
└─ rag_engine_postgres.py → build_faiss_index_for_artwork()
   ├─ SELECT embeddings JOIN chunk WHERE oeuvre_id = X
   ├─ Créer IndexFlatIP (dimension=384)
   ├─ Sauvegarder artwork_X.faiss + artwork_X.mapping
   └─ Return success

SUB-ÉTAPE 3.2: GÉNÉRATION 36 NARRATIONS
├─ Pour chaque (age, theme, style):  # 4×3×3 = 36
│  ├─ RAG search (top-5 chunks via FAISS)  ← PAS FAIT ACTUELLEMENT!
│  ├─ Build contexte (concatenate chunks)
│  ├─ Build prompt factuel (ollama_generator_improved.py)
│  ├─ Call Ollama (temperature=0.2, CPU-only)
│  ├─ Validation stricte (anti-hallucination)
│  └─ INSERT INTO pregenerations (ON CONFLICT DO UPDATE)
│
└─ Return stats (generated, updated, errors)

✅ CORRECT:
- Chunks régénérés à chaque fois (force_regenerate)
- Embeddings régénérés (cohérence garantie)
- FAISS rebuild (index toujours à jour)
- Pregenerations avec UNIQUE constraint (pas doublons)
- ON CONFLICT DO UPDATE = écrasement safe

⚠️ PROBLÈME MAJEUR IDENTIFIÉ:
```python
# ollama_generator_improved.py:66
def generate_narration(self, artwork, chunks, rag_context, ...):
    # rag_context = string concaténé de TOUS les chunks
    # PAS de recherche FAISS!
```

**❌ FAISS INDEX PAS UTILISÉ POUR LA GÉNÉRATION!**

Le code crée l'index FAISS mais ne l'utilise pas:
- _build_artwork_rag_context() = concatène TOUS les chunks
- Pas de search_similar_chunks() appelé
- FAISS = juste sauvegardé, jamais interrogé

**Impact**: Contexte RAG = tous les chunks (OK pour 5-8 chunks, mais inefficace si >20)

┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 4: GÉNÉRATION PARCOURS (Futur)                       │
└─────────────────────────────────────────────────────────────┘
1. User sélectionne œuvres + critères (age, theme, style)
2. API: /api/generate-parcours
3. Récupère pregenerations matching critères
4. Crée parcours avec timings (walking 0.5m/s, narration 90wpm)
5. Return parcours JSON

✅ CORRECT:
- Pregenerations déjà générées = instant
- Pas de LLM call = rapide
```

---

## 🗄️ AUDIT DATABASE INTEGRITY

### **A. CASCADES ON DELETE**

```sql
-- ✅ BIEN CONFIGURÉ:

1. plans → entities: ON DELETE CASCADE
   Si plan supprimé → toutes entities supprimées

2. entities → points: ON DELETE CASCADE
   Si entity supprimée → tous points supprimés

3. entities → relations: ON DELETE CASCADE
   Si entity supprimée → toutes relations supprimées

4. oeuvres → chunk: ON DELETE CASCADE
   Si oeuvre supprimée → tous chunks supprimés

5. chunk → embeddings: ON DELETE CASCADE
   Si chunk supprimé → tous embeddings supprimés

6. oeuvres → pregenerations: ON DELETE CASCADE
   Si oeuvre supprimée → toutes pregenerations supprimées

7. oeuvres → sections: ON DELETE CASCADE

8. oeuvres → anecdotes: ON DELETE CASCADE
```

**✅ RÉSULTAT**: Pas d'orphelins possibles, cascades propres

### **B. GESTION ORPHELINS**

**save-to-db/route.ts (lines 69-79)**:
```typescript
DELETE FROM oeuvres
WHERE oeuvre_id NOT IN (SELECT DISTINCT oeuvre_id FROM entities WHERE oeuvre_id IS NOT NULL)
AND oeuvre_id NOT IN (SELECT DISTINCT oeuvre_id FROM pregenerations WHERE oeuvre_id IS NOT NULL)
```

**✅ LOGIQUE**: Supprime œuvres orphelines SAUF si pregenerations existent (protection LLM content)

**⚠️ PROBLÈME IDENTIFIÉ**:

```typescript
// Ligne 86
await client.query('TRUNCATE TABLE points, relations, entities, plans, chunk CASCADE')
```

**❌ TRUNCATE chunk CASCADE = SUPPRIME TOUS LES CHUNKS + EMBEDDINGS À CHAQUE SAVE!**

**Impact**:
1. User save plan (même sans changement œuvres)
2. → TOUS chunks/embeddings supprimés
3. → Regénération complète nécessaire (3-5 min par œuvre)

**Solution recommandée**:
```typescript
// NE PAS truncate chunk si oeuvres pas modifiées
await client.query('TRUNCATE TABLE points, relations, entities, plans CASCADE')

// Supprimer chunks UNIQUEMENT pour œuvres modifiées/supprimées
// Les chunks sont déjà gérés par force_regenerate lors du clic "Générer"
```

**Logique améliorée**:
- Chunks créés UNIQUEMENT au clic "Générer narrations"
- Save plan = ne touche PAS aux chunks
- Force_regenerate = contrôle explicite de régénération

### **C. UNIQUE CONSTRAINTS**

```sql
-- ✅ BIEN:
pregenerations (oeuvre_id, age_cible, thematique, style_texte) UNIQUE

-- Empêche doublons, permet ON CONFLICT DO UPDATE

-- ✅ BIEN:
embeddings (chunk_id, model_name) UNIQUE

-- Permet changer de modèle embeddings sans conflit
```

### **D. INDEXES**

```sql
-- ✅ BIEN:
CREATE INDEX idx_pregenerations_oeuvre ON pregenerations(oeuvre_id);
CREATE INDEX idx_pregenerations_criteres ON pregenerations(age_cible, thematique, style_texte);
CREATE INDEX idx_sections_oeuvre ON sections(oeuvre_id);
CREATE INDEX idx_anecdotes_oeuvre ON anecdotes(oeuvre_id);
CREATE INDEX idx_oeuvres_artiste ON oeuvres(artiste_id);
CREATE INDEX idx_oeuvres_mouvement ON oeuvres(mouvement_id);
```

**💡 RECOMMANDATION: Ajouter index chunk**
```sql
CREATE INDEX idx_chunk_oeuvre ON chunk(oeuvre_id);
CREATE INDEX idx_embeddings_chunk ON embeddings(chunk_id);
```

**Justification**: Accélère requêtes RAG (SELECT chunks WHERE oeuvre_id = X)

---

## ⚡ OPTIMISATIONS GÉNÉRATION

### **1. PARALLÉLISATION 36 NARRATIONS**

**ACTUEL (séquentiel)**:
```python
for age in self.ages:         # 4
    for theme in self.themes: # 3
        for style in self.styles:  # 3
            narration = ollama_gen.generate_narration(...)  # 5-10 sec
            # Total: 36 × 8s = 288 sec (4.8 min)
```

**✅ OPTIMISATION: ThreadPoolExecutor**
```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def pregenerate_artwork_parallel(self, oeuvre_id, force_regenerate):
    # Préparer RAG 1× (partagé)
    chunks = get_artwork_chunks(oeuvre_id)
    rag_context = self._build_artwork_rag_context(oeuvre_id, chunks)
    
    # Créer toutes les combinaisons
    tasks = [
        (age, theme, style)
        for age in self.ages
        for theme in self.themes
        for style in self.styles
    ]
    
    def generate_one(task):
        age, theme, style = task
        narration = self.ollama_gen.generate_narration(
            artwork=artwork,
            chunks=chunks,
            rag_context=rag_context,  # Réutilisé (thread-safe)
            age_cible=age,
            thematique=theme,
            style_texte=style
        )
        return (age, theme, style, narration)
    
    # Paralléliser avec 8 workers (CPU threads)
    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(generate_one, task) for task in tasks]
        for future in as_completed(futures):
            results.append(future.result())
    
    # Sauvegarder tous en batch
    for age, theme, style, narration in results:
        add_pregeneration(oeuvre_id, age, theme, style, narration)
```

**Gain estimé**:
- Actuel: 36 × 8s = 288s (4.8 min)
- Avec 8 workers: 36 / 8 × 8s = 36s (~70% plus rapide!)

**⚠️ ATTENTION OLLAMA**:
- Ollama peut limiter concurrent requests (vérifier config)
- Si timeout, réduire max_workers à 4

### **2. CACHE PROMPTS PAR THÉMATIQUE**

**ACTUEL**:
```python
# Prompt reconstruit 36 fois (mêmes instructions de base)
for age, theme, style:
    prompt = self._build_factual_prompt(artwork, rag_context, age, theme, style)
    # Prompt = 2000+ chars, rebuilt each time
```

**✅ OPTIMISATION: Template cache**
```python
class OllamaFactualGenerator:
    def __init__(self):
        self._prompt_templates = {}  # Cache
    
    def _get_prompt_template(self, age, theme, style):
        key = f"{age}_{theme}_{style}"
        if key not in self._prompt_templates:
            # Construire template 1×
            self._prompt_templates[key] = self._build_template(age, theme, style)
        return self._prompt_templates[key]
    
    def generate_narration(self, artwork, rag_context, age, theme, style):
        template = self._get_prompt_template(age, theme, style)
        # Juste remplacer variables (title, artist, context)
        prompt = template.format(
            title=artwork['title'],
            artist=artwork['artist'],
            rag_context=rag_context
        )
```

**Gain**: Reconstruction string réduite (marginal, ~5% plus rapide)

### **3. BATCH INSERTION PREGENERATIONS**

**ACTUEL**:
```python
# pregeneration_db.py (1 INSERT par narration)
for narration in narrations:
    add_pregeneration(oeuvre_id, age, theme, style, text)  # 1 commit
    # 36 commits = lent
```

**✅ OPTIMISATION: executemany**
```python
def add_pregenerations_batch_optimized(batch_data):
    conn = _connect_postgres()
    cur = conn.cursor()
    try:
        cur.executemany("""
            INSERT INTO pregenerations (oeuvre_id, age_cible, thematique, style_texte, pregeneration_text)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (oeuvre_id, age_cible, thematique, style_texte)
            DO UPDATE SET pregeneration_text = EXCLUDED.pregeneration_text
        """, batch_data)
        conn.commit()  # 1 seul commit pour 36 narrations
    finally:
        cur.close()
        conn.close()
```

**Gain**: 36 commits → 1 commit (~10-15% plus rapide DB writes)

### **4. UTILISER VRAIMENT FAISS (Recommandation future)**

**ACTUEL**:
```python
# ollama_pregeneration_complete.py:88
rag_context = self._build_artwork_rag_context(oeuvre_id, chunks)
# = Concatène TOUS les chunks (pas de recherche)
```

**✅ UTILISATION FAISS (si >10 chunks dans le futur)**:
```python
def _build_filtered_rag_context(self, oeuvre_id, theme):
    # Créer query selon thématique
    queries = {
        'technique_picturale': "technique peinture matériaux composition couleurs",
        'biographie': "artiste vie parcours formation influence",
        'historique': "époque contexte historique événements période"
    }
    
    query = queries.get(theme, "")
    
    # Rechercher top-3 chunks via FAISS
    top_chunks = self.rag_engine.search_similar_chunks(
        query=query,
        oeuvre_id=oeuvre_id,
        top_k=3,
        threshold=0.3
    )
    
    # Combiner avec chunk 0 (MÉTADONNÉES) toujours
    metadata_chunk = get_artwork_chunks(oeuvre_id)[0]
    context = metadata_chunk['chunk_text'] + "\n\n"
    context += "\n\n".join([c['chunk_text'] for c in top_chunks])
    
    return context
```

**Avantage**: Contexte ultra-ciblé = meilleure qualité narration
**Inconvénient**: Risque manquer info importante (pour 5-8 chunks, ALL chunks = safer)

**Recommandation**: **Garder approche actuelle (ALL chunks)** car 5-8 chunks = ~5000 chars (acceptable)

---

## 📈 RÉSUMÉ OPTIMISATIONS PROPOSÉES

| Optimisation | Gain estimé | Complexité | Priorité | Recommandation |
|--------------|-------------|------------|----------|----------------|
| **Parallélisation 36 narrations** | **70%** (4.8min → 1.5min) | Moyenne | **HAUTE** | ✅ **FAIRE** |
| **Batch embeddings** | 30-50% (embedding phase) | Faible | **MOYENNE** | ✅ Recommandé |
| **Batch INSERT pregenerations** | 10-15% (save phase) | Faible | MOYENNE | ✅ Recommandé |
| **Fix TRUNCATE chunk** | Évite regén inutiles | Faible | **HAUTE** | ✅ **FAIRE** |
| **Cache prompt templates** | 5% | Faible | BASSE | Optionnel |
| **FAISS search filtered** | Variable | Haute | BASSE | ❌ Pas pour 5-8 chunks |
| **Add indexes chunk/embeddings** | Accélère queries | Faible | MOYENNE | ✅ Recommandé |

---

## 🎯 RECOMMANDATIONS FINALES

### **A. CORRECTIONS IMMÉDIATES**

#### 1. **Fix TRUNCATE chunk CASCADE**
```typescript
// app/api/save-to-db/route.ts ligne 86
// AVANT:
await client.query('TRUNCATE TABLE points, relations, entities, plans, chunk CASCADE')

// APRÈS:
await client.query('TRUNCATE TABLE points, relations, entities, plans CASCADE')
// Chunks gérés séparément par force_regenerate
```

#### 2. **Ajouter indexes DB**
```sql
-- database/init.sql
CREATE INDEX IF NOT EXISTS idx_chunk_oeuvre ON chunk(oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON embeddings(chunk_id);
```

#### 3. **Batch embeddings creation**
```python
# backend/rag/core/rag_engine_postgres.py
def create_embeddings_for_artwork(self, oeuvre_id: int):
    chunks = get_artwork_chunks(oeuvre_id)
    chunk_texts = [c['chunk_text'] for c in chunks]
    chunk_ids = [c['chunk_id'] for c in chunks]
    
    # Batch encode (1 seul forward pass)
    embeddings = self.model.encode(chunk_texts, batch_size=32, convert_to_numpy=True)
    faiss.normalize_L2(embeddings)
    
    # Batch insert
    values = [(cid, pickle.dumps(emb), self.model_name, emb.shape[0]) 
              for cid, emb in zip(chunk_ids, embeddings)]
    cur.executemany("INSERT INTO embeddings (...) VALUES (%s, %s, %s, %s)", values)
```

### **B. OPTIMISATIONS PERFORMANCE (Phase 2)**

#### 1. **Parallélisation génération**
```python
# backend/rag/core/ollama_pregeneration_complete.py
from concurrent.futures import ThreadPoolExecutor

def pregenerate_artwork_parallel(self, oeuvre_id, force_regenerate):
    # Setup RAG 1×
    chunks = get_artwork_chunks(oeuvre_id)
    rag_context = self._build_artwork_rag_context(oeuvre_id, chunks)
    
    # Générer 36 en parallèle (8 workers)
    tasks = [(age, theme, style) 
             for age in self.ages 
             for theme in self.themes 
             for style in self.styles]
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(
            lambda t: self._generate_one(oeuvre_id, chunks, rag_context, *t),
            tasks
        ))
    
    # Batch save
    add_pregenerations_batch(results)
```

#### 2. **Batch save pregenerations**
```python
# backend/rag/core/pregeneration_db.py
def add_pregenerations_batch(batch_data):
    """batch_data = [(oeuvre_id, age, theme, style, text), ...]"""
    conn = _connect_postgres()
    cur = conn.cursor()
    try:
        cur.executemany("""
            INSERT INTO pregenerations (...)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (...) DO UPDATE SET ...
        """, batch_data)
        conn.commit()
    finally:
        cur.close()
        conn.close()
```

### **C. SCALABILITÉ MULTI-MUSÉES (Phase 3)**

#### 1. **Ajouter museum_id**
```sql
ALTER TABLE plans ADD COLUMN museum_id INTEGER DEFAULT 1;
ALTER TABLE oeuvres ADD COLUMN museum_id INTEGER DEFAULT 1;

CREATE INDEX idx_oeuvres_museum ON oeuvres(museum_id);
CREATE INDEX idx_plans_museum ON plans(museum_id);
```

#### 2. **Table paramètres musée**
```sql
CREATE TABLE museum_settings (
    museum_id SERIAL PRIMARY KEY,
    nom TEXT NOT NULL,
    ages_cibles TEXT[] DEFAULT ARRAY['enfant', 'ado', 'adulte', 'senior'],
    thematiques TEXT[] DEFAULT ARRAY['technique_picturale', 'biographie', 'historique'],
    styles TEXT[] DEFAULT ARRAY['analyse', 'decouverte', 'anecdote'],
    ollama_temperature REAL DEFAULT 0.2,
    walking_speed REAL DEFAULT 0.5,
    narration_wpm INTEGER DEFAULT 90
);
```

#### 3. **Générateur dynamique**
```python
class OllamaPregenerationSystem:
    def __init__(self, museum_id: int = 1):
        settings = get_museum_settings(museum_id)
        self.ages = settings['ages_cibles']
        self.themes = settings['thematiques']
        self.styles = settings['styles']
        # Reste identique
```

---

## ✅ VALIDATION FINALE

### **QUESTIONS CLÉS**

**Q1: Est-ce la bonne stratégie d'utiliser chunks + embeddings + FAISS?**
**R:** ✅ **OUI**, stratégie standard et éprouvée pour RAG. Seul bémol: FAISS pas utilisé actuellement (mais acceptable pour 5-8 chunks).

**Q2: Est-ce scalable pour plusieurs musées?**
**R:** ✅ **OUI**, architecture bien séparée (plan_id, oeuvre_id). Ajouter museum_id = parfait.

**Q3: Peut-on améliorer qualité/diversité/vitesse?**
**R:** ✅ **OUI**:
- **Qualité**: Déjà bon (prompts factuels, validation stricte) - filtrage chunks par thème = amélioration marginale
- **Diversité**: Déjà bon (36 combinaisons uniques) - ajouter temperature variable selon style = possible
- **Vitesse**: ✅ **Parallélisation = gain 70%** (recommandé fortement)

**Q4: Peut-on réutiliser contexte/prompts entre narrations?**
**R:** ✅ **Déjà fait pour contexte RAG** (créé 1×, réutilisé 36×). Prompts = rebuild 36× mais impact faible (5%).

**Q5: Pipeline DB est-elle propre (pas d'orphelins, pas d'écrasements non voulus)?**
**R:** ✅ **OUI SAUF**:
- ⚠️ TRUNCATE chunk CASCADE = regén inutile (FIX: ne pas truncate chunk)
- ✅ Cascades ON DELETE = propres
- ✅ UNIQUE constraints = pas doublons
- ✅ Orphelins oeuvres gérés (sauf si pregenerations)

---

## 📋 CHECKLIST AVANT TEST

### **Modifications recommandées AVANT test**

- [ ] **Fix TRUNCATE chunk** (save-to-db/route.ts ligne 86)
- [ ] **Add indexes** (idx_chunk_oeuvre, idx_embeddings_chunk)
- [ ] **Batch embeddings** (rag_engine_postgres.py)

### **Optimisations APRÈS premier test**

- [ ] **Parallélisation 36 narrations** (ThreadPoolExecutor)
- [ ] **Batch save pregenerations** (executemany)
- [ ] **Mesurer temps** (chunks, embeddings, FAISS, LLM)
- [ ] **Tester force_regenerate=true vs false**

### **Scalabilité (quand multi-musées)**

- [ ] **Ajouter museum_id** (plans, oeuvres)
- [ ] **Créer museum_settings table**
- [ ] **Générateur dynamique** (paramètres par musée)

---

## 🚀 CONCLUSION

**VOTRE ARCHITECTURE EST SOLIDE ET SCALABLE.**

**Points forts majeurs**:
1. ✅ Chunks sémantiques bien structurés (7-8 sections thématiques)
2. ✅ Embeddings + FAISS = standard RAG (même si FAISS pas utilisé pour 5-8 chunks)
3. ✅ Database integrity propre (cascades, UNIQUE constraints)
4. ✅ Séparation plan/œuvres = multi-musées ready
5. ✅ Pregenerations réutilisables (ON CONFLICT DO UPDATE)

**Améliorations recommandées** (par priorité):
1. **HAUTE**: Fix TRUNCATE chunk (évite regén inutiles)
2. **HAUTE**: Parallélisation 36 narrations (gain 70%)
3. **MOYENNE**: Batch embeddings (gain 30%)
4. **MOYENNE**: Batch save pregenerations (gain 10%)
5. **BASSE**: Cache prompts (gain 5%)

**Vous pouvez tester dès maintenant**, mais appliquer les **2 fixes HAUTE priorité** = gain temps énorme.

---

**Generated**: 5 Janvier 2026  
**Version**: 1.0 - Audit Architecture Complet
