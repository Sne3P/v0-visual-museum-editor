"""
Comparaison V2 vs V3 - Génération de parcours
"""

import json
import sys
import os

# V2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from intelligent_parcours_v2 import generate_parcours_v2
from intelligent_parcours_v3 import generate_parcours_v3

profile = {'age': 1, 'thematique': 5, 'style_texte': 8}
seed = 42

print("="*80)
print("GÉNÉRATION PARCOURS V2")
print("="*80)

parcours_v2 = generate_parcours_v2(profile, 30, seed)

print(f"\n📊 RÉSULTATS V2:")
print(f"   Œuvres: {len(parcours_v2.get('artworks', []))}")
print(f"   Distance: {parcours_v2.get('total_distance', 0):.1f}m")
print(f"   Waypoints: {len(parcours_v2.get('waypoints', []))}")
print(f"   Segments: {len(parcours_v2.get('path_segments', []))}")

print(f"\n🗺️ WAYPOINTS V2 (tous):")
for i, wp in enumerate(parcours_v2.get('waypoints', [])):
    print(f"   {i+1}. Type: {wp.get('type')}, Floor: {wp['position']['floor']}, Room: {wp['position'].get('room', '?')}, Pos: ({wp['position']['x']:.0f}, {wp['position']['y']:.0f})")

print(f"\n📏 SEGMENTS V2 (premiers 15):")
for i, seg in enumerate(parcours_v2.get('path_segments', [])[:15]):
    print(f"   {i+1}. Floor: {seg['floor']}, From ({seg['from']['x']:.0f},{seg['from']['y']:.0f}) → To ({seg['to']['x']:.0f},{seg['to']['y']:.0f}), Dist: {seg['distance']:.1f}m")

print("\n" + "="*80)
print("GÉNÉRATION PARCOURS V3")
print("="*80)

parcours_v3 = generate_parcours_v3(profile, 30, seed)

print(f"\n📊 RÉSULTATS V3:")
print(f"   Œuvres: {len(parcours_v3.get('artworks', []))}")
print(f"   Distance: {parcours_v3.get('total_distance', 0):.1f}m")
print(f"   Waypoints: {len(parcours_v3.get('waypoints', []))}")
print(f"   Segments: {len(parcours_v3.get('path_segments', []))}")

print(f"\n🗺️ WAYPOINTS V3 (tous):")
for i, wp in enumerate(parcours_v3.get('waypoints', [])):
    print(f"   {i+1}. Type: {wp.get('type')}, Floor: {wp['position']['floor']}, Room: {wp['position'].get('room', '?')}, Pos: ({wp['position']['x']:.0f}, {wp['position']['y']:.0f})")

print(f"\n📏 SEGMENTS V3 (premiers 15):")
for i, seg in enumerate(parcours_v3.get('path_segments', [])[:15]):
    print(f"   {i+1}. Floor: {seg['floor']}, From ({seg['from']['x']:.0f},{seg['from']['y']:.0f}) → To ({seg['to']['x']:.0f},{seg['to']['y']:.0f}), Dist: {seg['distance']:.1f}m")

# Sauvegarder pour analyse détaillée
with open('parcours_v2_output.json', 'w', encoding='utf-8') as f:
    json.dump(parcours_v2, f, indent=2, ensure_ascii=False)

with open('parcours_v3_output.json', 'w', encoding='utf-8') as f:
    json.dump(parcours_v3, f, indent=2, ensure_ascii=False)

print("\n" + "="*80)
print("COMPARAISON")
print("="*80)

# Comparer waypoints
print(f"\n🔍 COMPARAISON WAYPOINTS:")
print(f"   V2: {len(parcours_v2.get('waypoints', []))} waypoints")
print(f"   V3: {len(parcours_v3.get('waypoints', []))} waypoints")

v2_types = {}
for wp in parcours_v2.get('waypoints', []):
    t = wp.get('type', 'unknown')
    v2_types[t] = v2_types.get(t, 0) + 1

v3_types = {}
for wp in parcours_v3.get('waypoints', []):
    t = wp.get('type', 'unknown')
    v3_types[t] = v3_types.get(t, 0) + 1

print(f"\n   V2 types: {v2_types}")
print(f"   V3 types: {v3_types}")

# Vérifier si les portes sont aux mêmes positions
print(f"\n🚪 POSITIONS DES PORTES:")
v2_doors = [wp for wp in parcours_v2.get('waypoints', []) if wp.get('type') == 'door']
v3_doors = [wp for wp in parcours_v3.get('waypoints', []) if wp.get('type') == 'door']

print(f"\n   V2 Doors ({len(v2_doors)}):")
for d in v2_doors:
    print(f"      Floor {d['position']['floor']}: ({d['position']['x']:.0f}, {d['position']['y']:.0f})")

print(f"\n   V3 Doors ({len(v3_doors)}):")
for d in v3_doors:
    print(f"      Floor {d['position']['floor']}: ({d['position']['x']:.0f}, {d['position']['y']:.0f})")

print("\n✅ Outputs sauvegardés: parcours_v2_output.json, parcours_v3_output.json")
