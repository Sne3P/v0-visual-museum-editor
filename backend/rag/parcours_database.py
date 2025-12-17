"""
Gestionnaire de sauvegarde des parcours personnalisés dans la base de données
Intégration avec la table 'parcours' existante
"""

import sqlite3
import json
import time
from typing import Dict, List, Any, Optional
from datetime import datetime
from parcours_generator import ParcoursPersonalise, ParcoursConfig


class ParcoursDatabase:
    """Gestionnaire de la base de données pour les parcours personnalisés"""
    
    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.db_path = db_path
        else:
            import os
            current_dir = os.path.dirname(os.path.abspath(__file__))
            self.db_path = os.path.join(os.path.dirname(os.path.dirname(current_dir)), 'database', 'museum_v1.db')
    
    def sauvegarder_parcours(self, config: ParcoursConfig, parcours_result: Dict[str, Any], 
                            processing_time_ms: int) -> int:
        """
        Sauvegarde un parcours personnalisé dans la base de données
        
        Args:
            config: Configuration utilisée pour générer le parcours
            parcours_result: Résultat complet du parcours généré
            processing_time_ms: Temps de traitement en millisecondes
            
        Returns:
            ID du parcours sauvegardé
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Préparation des données pour la table parcours
            criteria = self._format_criteria(config)
            selected_works = self._extract_selected_works(parcours_result)
            route_plan = self._format_route_plan(parcours_result)
            guide_text = parcours_result.get('parcours_complet', '')
            total_duration = parcours_result.get('stats', {}).get('duree_estimee', 0)
            
            # Insertion dans la table
            cursor.execute("""
                INSERT INTO parcours (
                    criteria, museum_mapping, selected_works, route_plan, 
                    guide_text, total_duration_minutes, model_name, 
                    processing_time_ms, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                criteria,
                json.dumps({'type': 'hybride', 'source': 'pregenerations+llm'}),  # museum_mapping
                selected_works,
                route_plan,
                guide_text,
                total_duration,
                'parcours_personalise_v1',  # model_name
                processing_time_ms,
                datetime.now().isoformat()
            ))
            
            parcours_id = cursor.lastrowid
            conn.commit()
            
            print(f"✅ Parcours sauvegardé avec l'ID: {parcours_id}")
            return parcours_id
            
        except Exception as e:
            print(f"❌ Erreur lors de la sauvegarde: {e}")
            conn.rollback()
            return -1
        finally:
            conn.close()
    
    def _format_criteria(self, config: ParcoursConfig) -> str:
        """Formate les critères de sélection en JSON"""
        criteria = {
            'age_cible': config.age_cible,
            'thematique': config.thematique,
            'style_texte': config.style_texte,
            'nombre_oeuvres': config.nombre_oeuvres,
            'niveau_detail': config.niveau_detail
        }
        
        if config.types_oeuvres:
            criteria['types_oeuvres'] = config.types_oeuvres
        if config.duree_souhaitee:
            criteria['duree_souhaitee'] = config.duree_souhaitee
            
        return json.dumps(criteria, ensure_ascii=False)
    
    def _extract_selected_works(self, parcours_result: Dict[str, Any]) -> str:
        """Extrait les œuvres sélectionnées au format JSON"""
        works = []
        
        if 'structure' in parcours_result and 'oeuvres' in parcours_result['structure']:
            for i, oeuvre in enumerate(parcours_result['structure']['oeuvres'], 1):
                work_info = {
                    'ordre': i,
                    'titre': oeuvre['titre'],
                    'artiste': oeuvre['artiste'],
                    'metadata': oeuvre.get('metadata', {})
                }
                works.append(work_info)
        
        return json.dumps(works, ensure_ascii=False)
    
    def _format_route_plan(self, parcours_result: Dict[str, Any]) -> str:
        """Formate le plan de route du parcours"""
        route = {
            'type': 'parcours_personnalise',
            'duree_estimee': parcours_result.get('stats', {}).get('duree_estimee', 0),
            'nombre_oeuvres': parcours_result.get('stats', {}).get('nombre_oeuvres', 0),
            'structure': {
                'introduction': True,
                'transitions': True,
                'conclusion': True
            }
        }
        
        return json.dumps(route, ensure_ascii=False)
    
    def recuperer_parcours(self, parcours_id: int) -> Optional[Dict[str, Any]]:
        """Récupère un parcours sauvegardé par son ID"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT criteria, selected_works, route_plan, guide_text, 
                       total_duration_minutes, created_at, processing_time_ms
                FROM parcours WHERE id = ?
            """, (parcours_id,))
            
            result = cursor.fetchone()
            if result:
                return {
                    'criteria': json.loads(result[0]),
                    'selected_works': json.loads(result[1]),
                    'route_plan': json.loads(result[2]),
                    'guide_text': result[3],
                    'total_duration_minutes': result[4],
                    'created_at': result[5],
                    'processing_time_ms': result[6]
                }
            return None
            
        except Exception as e:
            print(f"❌ Erreur lors de la récupération: {e}")
            return None
        finally:
            conn.close()
    
    def lister_parcours(self, limite: int = 20) -> List[Dict[str, Any]]:
        """Liste les parcours sauvegardés"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT id, criteria, total_duration_minutes, created_at
                FROM parcours 
                ORDER BY created_at DESC 
                LIMIT ?
            """, (limite,))
            
            results = cursor.fetchall()
            parcours_list = []
            
            for row in results:
                parcours_list.append({
                    'id': row[0],
                    'criteria': json.loads(row[1]),
                    'duree_minutes': row[2],
                    'created_at': row[3]
                })
            
            return parcours_list
            
        except Exception as e:
            print(f"❌ Erreur lors du listage: {e}")
            return []
        finally:
            conn.close()
    
    def supprimer_parcours(self, parcours_id: int) -> bool:
        """Supprime un parcours"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("DELETE FROM parcours WHERE id = ?", (parcours_id,))
            conn.commit()
            
            if cursor.rowcount > 0:
                print(f"✅ Parcours {parcours_id} supprimé")
                return True
            else:
                print(f"❌ Parcours {parcours_id} non trouvé")
                return False
                
        except Exception as e:
            print(f"❌ Erreur lors de la suppression: {e}")
            return False
        finally:
            conn.close()


class ParcoursPersonaliseAvecSauvegarde(ParcoursPersonalise):
    """Générateur de parcours avec sauvegarde automatique"""
    
    def __init__(self, db_path: Optional[str] = None):
        super().__init__(db_path)
        self.db_manager = ParcoursDatabase(db_path)
    
    def generer_et_sauvegarder(self, config: ParcoursConfig, 
                              sauvegarder: bool = True) -> Dict[str, Any]:
        """
        Génère un parcours personnalisé et le sauvegarde optionnellement
        
        Args:
            config: Configuration du parcours
            sauvegarder: Si True, sauvegarde le parcours en base
            
        Returns:
            Résultat avec l'ID de sauvegarde si applicable
        """
        start_time = time.time()
        
        # Génération du parcours
        parcours_result = self.generer_parcours_complet(config)
        
        if 'error' in parcours_result:
            return parcours_result
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Sauvegarde si demandée
        if sauvegarder:
            parcours_id = self.db_manager.sauvegarder_parcours(
                config, parcours_result, processing_time_ms
            )
            parcours_result['parcours_id'] = parcours_id
            parcours_result['sauvegarde'] = parcours_id > 0
        
        parcours_result['processing_time_ms'] = processing_time_ms
        
        return parcours_result


# Fonctions utilitaires
def generer_et_sauvegarder_parcours(age_cible: str, thematique: str, style_texte: str,
                                   nombre_oeuvres: int = 5, types_oeuvres: List[str] = None) -> Dict[str, Any]:
    """Interface rapide pour générer et sauvegarder un parcours"""
    config = ParcoursConfig(
        age_cible=age_cible,
        thematique=thematique,
        style_texte=style_texte,
        types_oeuvres=types_oeuvres or [],
        nombre_oeuvres=nombre_oeuvres
    )
    
    generator = ParcoursPersonaliseAvecSauvegarde()
    return generator.generer_et_sauvegarder(config, sauvegarder=True)


def recuperer_parcours_sauvegarde(parcours_id: int) -> Optional[Dict[str, Any]]:
    """Récupère un parcours sauvegardé"""
    db_manager = ParcoursDatabase()
    return db_manager.recuperer_parcours(parcours_id)


def lister_tous_les_parcours(limite: int = 20) -> List[Dict[str, Any]]:
    """Liste tous les parcours sauvegardés"""
    db_manager = ParcoursDatabase()
    return db_manager.lister_parcours(limite)


if __name__ == "__main__":
    # Test de sauvegarde
    print("🎯 Test de génération et sauvegarde de parcours\n")
    
    # Test 1: Génération et sauvegarde
    result = generer_et_sauvegarder_parcours(
        age_cible="adulte",
        thematique="technique_picturale", 
        style_texte="analyse",
        nombre_oeuvres=3
    )
    
    if 'parcours_id' in result:
        parcours_id = result['parcours_id']
        print(f"✅ Parcours généré et sauvegardé avec ID: {parcours_id}")
        print(f"⚡ Temps de traitement: {result['processing_time_ms']}ms")
        print(f"📏 Longueur: {result['stats']['longueur_totale']} caractères")
        
        # Test 2: Récupération
        print(f"\n🔍 Test de récupération du parcours {parcours_id}")
        parcours_recupere = recuperer_parcours_sauvegarde(parcours_id)
        
        if parcours_recupere:
            print("✅ Parcours récupéré avec succès")
            print(f"📅 Créé le: {parcours_recupere['created_at']}")
            print(f"⏱️  Durée: {parcours_recupere['total_duration_minutes']} min")
            print(f"🎨 Critères: {parcours_recupere['criteria']}")
        else:
            print("❌ Erreur lors de la récupération")
        
        # Test 3: Listage
        print(f"\n📋 Liste des parcours sauvegardés:")
        parcours_liste = lister_tous_les_parcours(5)
        
        for i, parcours in enumerate(parcours_liste, 1):
            criteria = parcours['criteria']
            print(f"  {i}. ID {parcours['id']} - {criteria['age_cible']} | {criteria['thematique']} | {criteria['style_texte']} ({parcours['duree_minutes']}min)")
    
    else:
        print(f"❌ Erreur: {result}")