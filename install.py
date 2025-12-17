#!/usr/bin/env python3
"""
Script d'installation automatique pour MuseumVoice - Système Structuré
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(command, description):
    """Execute une commande avec gestion d'erreur."""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} - Succès")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} - Erreur: {e}")
        print(f"Output: {e.stdout}")
        print(f"Error: {e.stderr}")
        return False

def main():
    """Installation automatique du système."""
    print("🚀 Installation MuseumVoice - Système Structuré d'Œuvres d'Art")
    print("=" * 70)
    
    # Vérifier Python
    print(f"🐍 Python version: {sys.version}")
    
    # Vérifier l'environnement virtuel
    if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("⚠️  Il est recommandé d'utiliser un environnement virtuel:")
        print("   1. Créer: python -m venv .venv")
        print("   2. Activer: .venv\\Scripts\\Activate.ps1  (Windows)")
        print("   3. Relancer ce script")
        choice = input("\nContinuer quand même ? (y/N): ")
        if choice.lower() != 'y':
            sys.exit(1)
    
    # Installation des packages obligatoires
    print("\n📦 Installation des dépendances obligatoires...")
    obligatory_packages = [
        "flask>=3.1.0",
        "flask-cors>=6.0.0", 
        "PyPDF2>=3.0.0",
        "numpy>=1.23.0",
        "requests>=2.28.0"
    ]
    
    for package in obligatory_packages:
        if not run_command(f"pip install {package}", f"Installation {package}"):
            print(f"❌ Échec installation {package}")
            sys.exit(1)
    
    # Installation des packages recommandés (optionnels)
    print("\n🔧 Installation des dépendances recommandées (RAG)...")
    optional_packages = [
        "sentence-transformers>=2.2.0",
        "faiss-cpu>=1.7.2",
        "scikit-learn>=1.0.0"
    ]
    
    for package in optional_packages:
        success = run_command(f"pip install {package}", f"Installation {package}")
        if not success:
            print(f"⚠️  Package optionnel {package} - Continuer sans RAG avancé")
    
    # Test de l'installation
    print("\n🧪 Test de l'installation...")
    
    # Test imports de base
    try:
        import flask
        import flask_cors
        import PyPDF2
        print("✅ Modules obligatoires - OK")
    except ImportError as e:
        print(f"❌ Import modules obligatoires: {e}")
        sys.exit(1)
    
    # Test imports optionnels
    rag_available = True
    try:
        import sentence_transformers
        import faiss
        print("✅ Modules RAG - OK")
    except ImportError:
        print("⚠️  Modules RAG non disponibles - API simple uniquement")
        rag_available = False
    
    # Test de la base de données
    try:
        sys.path.append(str(Path(__file__).parent))
        from db import get_all_artworks
        artworks = get_all_artworks()
        print(f"✅ Base de données - {len(artworks)} œuvres trouvées")
    except Exception as e:
        print(f"⚠️  Base de données: {e}")
    
    print("\n" + "=" * 70)
    print("🎉 Installation terminée !")
    
    print("\n📋 Résumé:")
    print(f"   • Flask API: ✅ Disponible")
    print(f"   • Traitement PDF: ✅ Disponible") 
    print(f"   • RAG avancé: {'✅' if rag_available else '⚠️'} {'Disponible' if rag_available else 'Non disponible'}")
    
    print("\n🚀 Pour démarrer:")
    print("   • API simple:   python backend/rag/simple_api.py")
    if rag_available:
        print("   • API complète: python backend/rag/main.py")
    
    print("\n🌐 L'API sera disponible sur:")
    print("   • http://localhost:5000 (simple)")
    if rag_available:
        print("   • http://localhost:5001 (complète avec RAG)")

if __name__ == "__main__":
    main()