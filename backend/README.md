# Backend MuseumVoice V3

## Structure

```
backend/
├── rag/                    # Module principal RAG
│   ├── __init__.py        # Package Python
│   ├── main.py           # Point d'entrée principal
│   ├── config.py         # Configuration
│   ├── db.py             # Accès base de données
│   ├── doc_processing.py # Traitement documents
│   ├── rag_engine.py     # Moteur RAG
│   └── parcours_engine.py # Génération parcours
├── cache/                 # Cache temporaire
├── indexes/              # Index FAISS
├── logs/                 # Logs du système  
└── requirements.txt      # Dépendances Python
```

## Utilisation

### Lancer le backend
```bash
cd backend/rag
python main.py
```

### Workflow recommandé
1. **Ajouter des œuvres via le frontend** (http://localhost:3000/editor)
   - Créer des œuvres d'art avec leurs PDF dans l'éditeur  
   - Les PDF sont automatiquement sauvés dans `public/uploads/pdfs/`

2. **Traiter les PDF via le backend**
   - Lancer le backend : `cd backend/rag && python main.py`
   - Choisir l'option `0` (Pipeline complet) pour traiter tous les PDF

3. **Le backend créera automatiquement :**
   - Les chunks de texte à partir des PDF
   - L'index FAISS pour la recherche vectorielle
   - Les embeddings pour le système RAG

### Options disponibles
- `0` - Pipeline complet (recommandé)
- `2` - Traitement PDF  
- `3` - Construction index RAG
- `4` - Test recherche
- `5` - Génération parcours
- `6` - Traiter documents existants
- `8` - Status base de données
- `9` - Nettoyer la base de données

### Base de données
- Utilise `database/museum_v1.db` (partagée avec le frontend)
- Stockage des PDF dans `public/uploads/pdfs/`

## Architecture

Le système utilise:
- **SQLite** pour le stockage des données
- **FAISS** pour la recherche vectorielle  
- **Sentence Transformers** pour l'embeddings
- **PyPDF2** pour le traitement PDF