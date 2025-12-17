#!/usr/bin/env python3
"""
Script d'automatisation complète : Traitement + Prégénération
"""

import subprocess
import sys
import time
from pathlib import Path

def run_command(command, description):
    """Exécute une commande avec gestion d'erreurs"""
    print(f"🚀 {description}...")
    print(f"💻 Commande: {' '.join(command)}")
    
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        print(f"✅ {description} terminé avec succès")
        if result.stdout:
            print("📋 Sortie:")
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Erreur lors de {description}")
        print(f"Code de sortie: {e.returncode}")
        if e.stdout:
            print("📋 Sortie:")
            print(e.stdout)
        if e.stderr:
            print("🔥 Erreurs:")
            print(e.stderr)
        return False

def main():
    """Workflow complet automatisé"""
    
    print("🎨 WORKFLOW COMPLET MUSEUM VOICE")
    print("=" * 50)
    
    # Vérifier qu'on est dans le bon répertoire
    if not Path("cli.py").exists():
        print("❌ Erreur: cli.py non trouvé. Lancez depuis backend/rag/")
        return False
    
    start_time = time.time()
    
    # Étape 1: Traitement des PDFs
    success1 = run_command(
        [sys.executable, "cli.py"], 
        "Traitement des documents PDF"
    )
    
    if not success1:
        print("❌ Échec du traitement PDF. Arrêt du workflow.")
        return False
    
    print("\n" + "="*50)
    
    # Étape 2: Prégénération optimisée
    workers = 4
    if "--workers" in sys.argv:
        try:
            idx = sys.argv.index("--workers")
            if idx + 1 < len(sys.argv):
                workers = int(sys.argv[idx + 1])
        except (ValueError, IndexError):
            pass
    
    force_flag = ["--force"] if "--force" in sys.argv else []
    sequential_flag = ["--sequential"] if "--sequential" in sys.argv else []
    
    pregeneration_cmd = [sys.executable, "auto_pregeneration_optimized.py"]
    
    if sequential_flag:
        pregeneration_cmd.extend(sequential_flag)
    else:
        pregeneration_cmd.extend(["--workers", str(workers)])
    
    pregeneration_cmd.extend(force_flag)
    
    success2 = run_command(
        pregeneration_cmd,
        f"Prégénération de contenu personnalisé"
    )
    
    # Résumé final
    end_time = time.time()
    total_time = end_time - start_time
    
    print("\n" + "="*60)
    print("🎉 WORKFLOW TERMINÉ")
    print("="*60)
    print(f"⏱️  Durée totale: {total_time:.2f} secondes")
    print(f"📋 Étape 1 (Traitement PDF): {'✅ Réussi' if success1 else '❌ Échec'}")
    print(f"🎨 Étape 2 (Prégénération): {'✅ Réussi' if success2 else '❌ Échec'}")
    
    if success1 and success2:
        print("\n🎯 Système prêt ! Vos œuvres ont maintenant :")
        print("   📚 Contenu traité et analysé")
        print("   🎭 108 variations personnalisées par œuvre")
        print("   ⚡ Performance optimale pour l'API")
        print("\n💡 Vous pouvez maintenant utiliser l'API de prégénération !")
        return True
    else:
        print("\n⚠️  Certaines étapes ont échoué. Vérifiez les logs ci-dessus.")
        return False

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Workflow complet Museum Voice")
    parser.add_argument("--workers", type=int, default=4, help="Nombre de workers parallèles")
    parser.add_argument("--force", action="store_true", help="Forcer la régénération")
    parser.add_argument("--sequential", action="store_true", help="Mode séquentiel")
    
    print("💡 Options disponibles:")
    print("   --workers N     : Nombre de workers (défaut: 4)")
    print("   --force         : Régénérer même si existe")
    print("   --sequential    : Mode séquentiel (debug)")
    print("")
    
    success = main()
    sys.exit(0 if success else 1)