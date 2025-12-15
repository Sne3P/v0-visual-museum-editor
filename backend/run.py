#!/usr/bin/env python3
"""
Script de démarrage rapide MuseumVoice V3
Usage: python run.py [mode]
"""

import sys
import subprocess
from pathlib import Path

def check_dependencies():
    """Vérifie les dépendances critiques"""
    critical_deps = ['PyPDF2', 'numpy', 'sklearn']
    missing = []
    
    for dep in critical_deps:
        try:
            __import__(dep)
        except ImportError:
            missing.append(dep)
    
    return missing

def install_dependencies():
    """Installe les dépendances manquantes"""
    print("📦 Installation des dépendances...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", 
            "PyPDF2", "numpy", "scikit-learn", "requests"
        ])
        print("✅ Dépendances de base installées")
        
        # Optionnelles
        try:
            subprocess.check_call([
                sys.executable, "-m", "pip", "install",
                "sentence-transformers", "faiss-cpu", "bcrypt"
            ])
            print("✅ Dépendances recommandées installées")
        except:
            print("⚠️  Certaines dépendances optionnelles ont échoué (normal)")
        
        return True
    except Exception as e:
        print(f"❌ Erreur installation: {e}")
        return False

def clear_database():
    """Supprime et réinitialise la base de données"""
    db_path = Path("processing.db")
    
    if db_path.exists():
        response = input("⚠️  Êtes-vous sûr de vouloir supprimer toutes les données? (y/n): ")
        if response.lower() in ['y', 'yes', 'o', 'oui']:
            try:
                db_path.unlink()
                print("🗑️  Base de données supprimée")
                
                # Supprimer aussi les fichiers associés
                for pattern in ["*.db-wal", "*.db-shm", "indexes/*", "cache/*"]:
                    for file in Path(".").glob(pattern):
                        try:
                            if file.is_file():
                                file.unlink()
                            elif file.is_dir():
                                import shutil
                                shutil.rmtree(file)
                        except:
                            pass
                
                # Réinitialiser
                from db import init_db
                init_db()
                print("✅ Base de données réinitialisée")
                return True
            except Exception as e:
                print(f"❌ Erreur lors de la suppression: {e}")
                return False
        else:
            print("Opération annulée")
            return False
    else:
        print("ℹ️  Aucune base de données trouvée")
        from db import init_db
        init_db()
        print("✅ Base de données créée")
        return True

def main():
    """Point d'entrée principal"""
    print("🚀 MuseumVoice V3 - Démarrage rapide")
    print("=" * 40)
    
    # Vérifier si option de nettoyage
    if len(sys.argv) > 1 and sys.argv[1].lower() in ['clear', 'clean', 'reset']:
        clear_database()
        return
    
    # Vérifier dépendances
    missing = check_dependencies()
    if missing:
        print(f"❌ Dépendances manquantes: {', '.join(missing)}")
        response = input("Installer automatiquement? (y/n): ")
        if response.lower() in ['y', 'yes', 'o', 'oui']:
            if not install_dependencies():
                sys.exit(1)
        else:
            print("Installation manuelle requise:")
            print("pip install PyPDF2 numpy scikit-learn requests")
            sys.exit(1)
    
    # Créer dossiers nécessaires (seulement ceux du backend)
    folders = ['indexes', 'cache']
    for folder in folders:
        Path(folder).mkdir(exist_ok=True)
    print(f"✅ Dossiers créés: {', '.join(folders)}")
    
    # Vérifier que le dossier public/uploads/pdfs existe
    public_pdfs = Path('../public/uploads/pdfs')
    if not public_pdfs.exists():
        print(f"⚠️  Attention: {public_pdfs} n'existe pas!")
    else:
        print(f"✅ Dossier PDF trouvé: {public_pdfs}")
    
    # Initialiser base de données
    try:
        from db import init_db
        init_db()
        print("✅ Base de données initialisée")
    except Exception as e:
        print(f"❌ Erreur BDD: {e}")
        sys.exit(1)
    
    # Lancer le système principal
    try:
        from main import main as main_app
        main_app()
    except KeyboardInterrupt:
        print("\n👋 Arrêt demandé par l'utilisateur")
    except Exception as e:
        print(f"❌ Erreur système: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()