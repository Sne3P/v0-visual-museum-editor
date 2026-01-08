"""
Générateur de parcours V3 - Architecture modulaire

Orchestration des services pour génération intelligente de parcours
"""

import psycopg2
import psycopg2.extras
from typing import Dict, List
import sys
import os

# Support exécution directe et import module
if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from models import MuseumGraphV2
    from services import (
        ArtworkSelector,
        ConnectivityChecker,
        PathOptimizer,
        WaypointCalculator,
        SegmentBuilder
    )
else:
    from .models import MuseumGraphV2
    from .services import (
        ArtworkSelector,
        ConnectivityChecker,
        PathOptimizer,
        WaypointCalculator,
        SegmentBuilder
    )


def generate_parcours_v3(
    profile: Dict, 
    target_duration_min: int = 30, 
    seed: int = None,
    accessible_only: bool = False  # Si True, n'utilise que les ascenseurs (PMR)
) -> Dict:
    """
    Génère un parcours personnalisé avec architecture modulaire
    
    Args:
        profile: Critères utilisateur {age, thematique, style_texte}
        target_duration_min: Durée cible en minutes
        seed: Seed pour reproductibilité (optionnel)
    
    Returns:
        Parcours complet avec artworks, waypoints, segments
    """
    
    # Connexion DB (support Docker et local)
    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': int(os.getenv('DB_PORT', 5432)),
        'database': os.getenv('DB_NAME', 'museumvoice'),
        'user': os.getenv('DB_USER', 'museum_admin'),
        'password': os.getenv('DB_PASSWORD', 'museum_password')
    }
    
    conn = psycopg2.connect(**db_config)
    
    try:
        # 1. Charger graphe du musée
        print("📐 Chargement structure du musée...")
        graph = MuseumGraphV2(conn)
        
        # Stats détaillées
        escaliers_count = sum(1 for s in graph.stairways if s.vertical_type == 'stairs')
        ascenseurs_count = sum(1 for s in graph.stairways if s.vertical_type == 'elevator')
        
        print(f"   ✓ {len(graph.rooms)} salles, {len(graph.doors)} portes")
        print(f"   ✓ {escaliers_count} escaliers, {ascenseurs_count} ascenseurs")
        
        # 2. Initialiser services
        artwork_selector = ArtworkSelector(conn, graph)
        connectivity_checker = ConnectivityChecker(graph, accessible_only=accessible_only)
        path_optimizer = PathOptimizer(connectivity_checker)
        waypoint_calculator = WaypointCalculator(connectivity_checker)
        segment_builder = SegmentBuilder(connectivity_checker)
        
        # 3. Sélection œuvres selon profil et durée
        print(f"🎨 Sélection œuvres (durée: {target_duration_min} min)...")
        artworks = artwork_selector.select_artworks(profile, target_duration_min, seed)
        print(f"   ✓ {len(artworks)} œuvres sélectionnées")
        
        if not artworks:
            return {
                'success': False,
                'error': 'Aucune œuvre trouvée pour ce profil'
            }
        
        # 4. Vérification accessibilité
        print("🔍 Vérification accessibilité...")
        inaccessible = connectivity_checker.check_accessibility(artworks)
        if inaccessible:
            print(f"   ⚠️ Œuvres inaccessibles: {[a.title for a in inaccessible]}")
            artworks = [a for a in artworks if a not in inaccessible]
        
        # 5. Optimisation parcours (TSP avec variété)
        print("🔀 Optimisation parcours...")
        optimized_artworks = path_optimizer.optimize_path(artworks, strategy='variety_tsp')
        print(f"   ✓ Parcours optimisé")
        
        # Affichage debug
        print("\n📋 PARCOURS FINAL:")
        for i, art in enumerate(optimized_artworks):
            print(f"   {i+1}. {art.title} - Salle {art.position.room} (Étage {art.position.floor})")
        
        # 6. Calcul waypoints
        print("\n🗺️ Calcul waypoints...")
        waypoints = waypoint_calculator.calculate_waypoints(optimized_artworks)
        print(f"   ✓ {len(waypoints)} waypoints générés")
        
        # 7. Construction segments
        print("📏 Construction segments...")
        segments = segment_builder.build_segments(optimized_artworks)
        print(f"   ✓ {len(segments)} segments créés")
        
        # 8. Calcul métriques finales
        total_distance = path_optimizer.calculate_total_distance(optimized_artworks)
        estimated_duration = path_optimizer.estimate_duration(optimized_artworks)
        
        floors_visited = sorted(set(a.position.floor for a in optimized_artworks))
        
        print(f"\n✅ PARCOURS GÉNÉRÉ:")
        print(f"   Distance: {total_distance:.1f}m")
        print(f"   Durée estimée: {estimated_duration:.1f} min")
        print(f"   Étages: {floors_visited}")
        
        # 9. Construire résultat (format compatible V2)
        # Calcul breakdown durée
        walk_time = path_optimizer.estimate_walk_time(optimized_artworks)
        narration_time = sum(a.narration_duration for a in optimized_artworks)
        observation_time = len(optimized_artworks) * 2.0  # 2 minutes par œuvre
        
        # Total en minutes
        narration_time_min = narration_time / 60
        
        # Comptage
        rooms_visited = len(set(a.position.room for a in optimized_artworks))
        floor_changes = sum(1 for i in range(len(optimized_artworks) - 1) 
                           if optimized_artworks[i].position.floor != optimized_artworks[i+1].position.floor)
        
        # Format artworks avec distances
        artworks_with_distances = []
        for idx, a in enumerate(optimized_artworks):
            distance_to_next = 0
            if idx < len(optimized_artworks) - 1:
                next_artwork = optimized_artworks[idx + 1]
                distance_to_next = a.position.distance_to(next_artwork.position, penalize_floor_change=False)
            
            artworks_with_distances.append({
                'order': idx + 1,
                'oeuvre_id': a.oeuvre_id,
                'title': a.title,
                'artist': a.artist,
                'date': getattr(a, 'date_oeuvre', ''),
                'materiaux_technique': getattr(a, 'materiaux_technique', ''),
                'artwork_type': a.artwork_type,
                'narration': a.narration,
                'narration_word_count': int(a.narration_duration / 0.5),
                'narration_duration': a.narration_duration,
                'distance_to_next': distance_to_next / 1.4 / 60,  # mètres → minutes (vitesse 1.4 m/s)
                'position': {
                    'x': a.position.x,
                    'y': a.position.y,
                    'room': a.position.room,
                    'floor': a.position.floor
                }
            })
        
        result = {
            'parcours_id': f"{seed}_{profile.get('age', 0)}_{profile.get('thematique', 0)}_{profile.get('style_texte', 0)}",
            'profile': profile,
            'duration_target': target_duration_min,
            'duration_estimated': estimated_duration,
            'artworks': artworks_with_distances,
            'waypoints': waypoints,
            'path_segments': segments,
            'total_distance': total_distance,
            'walk_time': walk_time,
            'narration_time': narration_time_min,
            'observation_time': observation_time,
            'floors_visited': floors_visited,
            'rooms_visited': rooms_visited,
            'floor_changes': floor_changes,
            'metadata': {
                'total_artworks': len(optimized_artworks),
                'total_distance': total_distance,
                'floors_visited': len(floors_visited),
                'rooms_visited': rooms_visited,
                'floor_changes': floor_changes,
                'floor_distribution': dict((f, sum(1 for a in optimized_artworks if a.position.floor == f)) for f in floors_visited),
                'floors_list': floors_visited,
                'duration_breakdown': {
                    'total_minutes': estimated_duration,
                    'walking_minutes': walk_time,
                    'narration_minutes': narration_time_min,
                    'observation_minutes': observation_time
                }
            }
        }
        
        return result
        
    finally:
        conn.close()


# Alias pour compatibilité
def generate_parcours_v2(profile: Dict, target_duration_min: int = 30, seed: int = None) -> Dict:
    """Alias pour compatibilité avec l'ancienne API"""
    return generate_parcours_v3(profile, target_duration_min, seed)


if __name__ == "__main__":
    # Test
    profile = {'age': 1, 'thematique': 5, 'style_texte': 8}
    parcours = generate_parcours_v3(profile, 30)
    
    if parcours['success']:
        print(f"\n🎉 Parcours: {len(parcours['artworks'])} œuvres, {parcours['total_distance']:.1f}m, {parcours['estimated_duration_min']:.1f} min")
    else:
        print(f"❌ Erreur: {parcours.get('error')}")
