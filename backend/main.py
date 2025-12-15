#!/usr/bin/env python3
"""
Point d'entrée principal pour MuseumVoice V3 Backend
Exécute le système RAG depuis le module rag/
"""

import sys
import subprocess
from pathlib import Path

# Chemins
backend_dir = Path(__file__).parent
rag_dir = backend_dir / "rag" 

if __name__ == "__main__":
    # Exécuter le main.py dans le dossier rag/
    try:
        result = subprocess.run([sys.executable, "main.py"], 
                              cwd=str(rag_dir), 
                              check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Erreur lors de l'exécution: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print(f"❌ Fichier main.py introuvable dans {rag_dir}")
        sys.exit(1)