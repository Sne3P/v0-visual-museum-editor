# 🎨 FLUX COMPLET DE PRÉGÉNÉRATION AVEC OLLAMA

## 📋 ARCHITECTURE GLOBALE

```
PDF → Chunks → Embeddings → FAISS → RAG → Ollama → Narrations Uniques (36/œuvre)
```

## 🔧 COMPOSANTS DU SYSTÈME

### 1. **Extraction et Chunking** (Existant)
- **Fichier**: `model_pdf_processor.py`
- **Fonction**: Découpe PDF en chunks sémantiques
- **Table**: `chunk` (chunk_id, oeuvre_id, chunk_text, chunk_order)

### 2. **Embeddings** (Nouveau - PostgreSQL)
- **Fichier**: `core/rag_engine_postgres.py`
- **Modèle**: `all-MiniLM-L6-v2` (sentence-transformers)
- **Dimension**: 384
- **Table**: `embeddings` (embedding_id, chunk_id, embedding_vector BYTEA)
- **Méthode**: `create_embeddings_for_artwork(oeuvre_id)`

### 3. **Index FAISS** (Nouveau)
- **Fichier**: `core/rag_engine_postgres.py`
- **Type**: `IndexFlatIP` (Inner Product = cosine similarity)
- **Sauvegarde**: `/backend/indexes/museum_postgres/artwork_{id}.faiss` + `.mapping`
- **Méthode**: `build_faiss_index_for_artwork(oeuvre_id)`

### 4. **RAG Sémantique** (Nouveau)
- **Fichier**: `core/rag_engine_postgres.py`
- **Fonction**: Recherche chunks pertinents via similarité vectorielle
- **Paramètres**: `top_k=10`, `threshold=0.1`
- **Méthode**: `search_similar_chunks(query, oeuvre_id)`

### 5. **Génération Ollama** (Nouveau - Anti-hallucination)
- **Fichier**: `core/ollama_generator.py`
- **Modèle**: Mistral (local via Ollama)
- **URL**: `http://host.docker.internal:11434`
- **Température**: 0.3 (factuel, peu créatif = moins hallucinations)
- **Top-p**: 0.85 (nucleus sampling strict)
- **Méthode**: `generate_narration(artwork, chunks, rag_context, age, theme, style)`

### 6. **Anti-Hallucination** (Nouveau)
- **Validation post-génération**:
  - Vérification cohérence titre/artiste
  - Détection phrases spéculatives ("on raconte que", "probablement")
  - Validation longueur (30-600 mots)
  - Vérification lien avec contexte RAG (>5 mots communs)
- **Fallback sécurisé** si validation échoue

### 7. **Orchestration Complète** (Nouveau)
- **Fichier**: `core/ollama_pregeneration_complete.py`
- **Flux par œuvre**:
  1. Setup RAG (embeddings + FAISS)
  2. Récupération contexte RAG
  3. Génération 36 narrations (4 ages × 3 thèmes × 3 styles)
  4. Sauvegarde BDD
- **Méthode**: `pregenerate_artwork(oeuvre_id, force_regenerate)`

## 🚀 API ENDPOINTS

### **POST /api/pregenerate-artwork/:id**
Prégénération complète pour UNE œuvre
```json
{
  "force_regenerate": false,
  "skip_rag_setup": false
}
```

**Réponse**:
```json
{
  "success": true,
  "oeuvre_id": 1,
  "title": "La Joconde",
  "stats": {
    "generated": 36,
    "updated": 0,
    "skipped": 0,
    "errors": 0
  },
  "duration": 42.5
}
```

### **POST /api/pregenerate-all**
Prégénération pour TOUTES les œuvres
```json
{
  "force_regenerate": false
}
```

### **POST /api/rag/embeddings/create/:id**
Créer embeddings pour une œuvre

### **POST /api/rag/faiss/build/:id**
Construire index FAISS pour une œuvre

### **POST /api/rag/search**
Recherche sémantique dans les chunks
```json
{
  "query": "technique peinture",
  "oeuvre_id": 1,
  "top_k": 5
}
```

## 📊 PROFILS DE GÉNÉRATION (36 combinaisons)

### **Ages (4):**
- `enfant`: Vocabulaire simple, phrases courtes
- `ado`: Accessible, engageant
- `adulte`: Standard, informatif
- `senior`: Enrichi, contexte historique

### **Thématiques (3):**
- `technique_picturale`: Focus matériaux/technique
- `biographie`: Focus artiste/vie
- `historique`: Focus contexte/époque

### **Styles (3):**
- `analyse`: Analytique, structuré
- `decouverte`: Progressif, découverte
- `anecdote`: Narratif mais factuel

## 🔄 WORKFLOW COMPLET

```
1. UPLOAD PDF
   ↓
2. EXTRACTION MÉTADONNÉES (model_pdf_processor.py)
   ↓
3. CHUNKING (model_pdf_processor.py)
   → Table: chunk
   ↓
4. EMBEDDINGS (rag_engine_postgres.py)
   → Modèle: all-MiniLM-L6-v2
   → Table: embeddings (BYTEA pickle)
   ↓
5. INDEX FAISS (rag_engine_postgres.py)
   → Fichiers: .faiss + .mapping
   → Type: IndexFlatIP
   ↓
6. RAG CONTEXT (rag_engine_postgres.py)
   → Recherche top 10 chunks pertinents
   → Seuil: 0.1
   ↓
7. GÉNÉRATION OLLAMA (ollama_generator.py)
   → Prompt anti-hallucination
   → Température: 0.3
   → Top-p: 0.85
   ↓
8. VALIDATION (ollama_generator.py)
   → Vérification factuelle
   → Détection spéculations
   → Fallback si suspect
   ↓
9. SAUVEGARDE BDD
   → Table: pregeneration
   → 36 narrations/œuvre
```

## ⚙️ CONFIGURATION OLLAMA

### **Installation Ollama (Windows)**
```powershell
# Télécharger: https://ollama.com/download
# Installer Ollama Desktop

# Vérifier
ollama --version

# Pull modèle Mistral
ollama pull mistral
```

### **Variables d'environnement**
```env
OLLAMA_API_URL=http://host.docker.internal:11434
OLLAMA_MODEL=mistral
```

### **Vérifier disponibilité**
```powershell
curl http://localhost:11434/api/tags
```

## 🐳 DOCKER

### **Build Backend**
```bash
docker-compose build backend
```

### **Start Services**
```bash
docker-compose up -d
```

### **Logs Backend**
```bash
docker logs museum-backend -f
```

## 📈 PERFORMANCE

### **Optimisations implémentées:**
1. **Cache Docker multi-stage** → Build 5x plus rapide
2. **Torch CPU-only** → -60% taille image
3. **Sentence-transformers preload** → -30s démarrage
4. **FAISS IndexFlatIP** → Recherche <10ms
5. **Ollama température basse** → Moins hallucinations, plus rapide
6. **Singleton RAG engine** → Pas de reload modèle

### **Benchmarks typiques:**
- **Embeddings** (1 œuvre, 20 chunks): ~2-3s
- **FAISS build**: ~0.5s
- **RAG search** (top 10): ~10ms
- **Ollama génération** (1 narration): ~5-15s (selon hardware)
- **36 narrations complètes**: ~3-8 min/œuvre

## 🔒 SÉCURITÉ ANTI-HALLUCINATION

### **Prompts stricts:**
```
RÈGLES ABSOLUES:
- N'invente AUCUNE information
- N'ajoute AUCUN détail qui n'est pas dans le contexte
- Si tu ne sais pas, ne spécule pas
- Reste STRICTEMENT factuel
```

### **Validation post-génération:**
- ❌ Détection "on raconte que", "probablement"
- ✅ Vérification lien avec contexte source
- ✅ Cohérence titre/artiste
- ✅ Longueur raisonnable (30-600 mots)

### **Fallback automatique:**
Si validation échoue → Génération factuelle pure à partir des métadonnées

## 📱 DASHBOARD

### **Bouton "Générer narrations Ollama"**
- Lance `/api/pregenerate-artwork/:id`
- Affiche progression temps réel
- Stats: générées/mises à jour/erreurs

### **Indicateurs RAG:**
- ✅ Embeddings créés
- ✅ Index FAISS construit
- ✅ Narrations générées (36/36)

## 🧪 TESTS

### **Test embeddings:**
```bash
curl -X POST http://localhost:5000/api/rag/embeddings/create/1
```

### **Test FAISS:**
```bash
curl -X POST http://localhost:5000/api/rag/faiss/build/1
```

### **Test recherche RAG:**
```bash
curl -X POST http://localhost:5000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"technique peinture","oeuvre_id":1,"top_k":5}'
```

### **Test prégénération:**
```bash
curl -X POST http://localhost:5000/api/pregenerate-artwork/1 \
  -H "Content-Type: application/json" \
  -d '{"force_regenerate":true}'
```

## 🐛 TROUBLESHOOTING

### **Ollama non disponible**
```
⚠️ ATTENTION: Ollama non disponible - Fallback automatique activé
```
→ Vérifier Ollama Desktop démarré
→ Vérifier port 11434 accessible

### **Embeddings lents**
→ Normal au premier lancement (téléchargement modèle)
→ Puis ~2-3s par œuvre

### **Narrations génériques**
→ Vérifier chunks extraits (non vides)
→ Vérifier RAG context (>100 caractères)
→ Vérifier température Ollama (<0.5)

### **Erreur FAISS**
→ Vérifier embeddings créés d'abord
→ Vérifier permissions dossier `/app/indexes`
