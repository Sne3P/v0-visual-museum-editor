"""
Analyse des escaliers et ascenseurs en base de données
"""

import psycopg2
import psycopg2.extras
import json
import os

db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'museumvoice'),
    'user': os.getenv('DB_USER', 'museum_admin'),
    'password': os.getenv('DB_PASSWORD', 'museum_password')
}

conn = psycopg2.connect(**db_config)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=" * 80)
print("ANALYSE VERTICAL_LINKS (Escaliers et Ascenseurs)")
print("=" * 80)

# Plans
cur.execute("SELECT plan_id, nom FROM plans ORDER BY plan_id")
plans = cur.fetchall()
print(f"\n📋 PLANS ({len(plans)}):")
for p in plans:
    print(f"   Plan {p['plan_id']}: {p['nom']}")

# Mapping plan_id → floor
plan_to_floor = {}
for idx, p in enumerate(plans):
    plan_to_floor[p['plan_id']] = idx

# Compter les entités par type et plan
cur.execute("""
    SELECT entity_type, plan_id, COUNT(*) as count
    FROM entities
    GROUP BY entity_type, plan_id
    ORDER BY entity_type, plan_id
""")

print(f"\n📊 ENTITÉS PAR TYPE ET PLAN:")
for row in cur.fetchall():
    floor = plan_to_floor.get(row['plan_id'], '?')
    print(f"   {row['entity_type']:20s} Plan {row['plan_id']} (Étage {floor}): {row['count']}")

# Détails VERTICAL_LINK
cur.execute("""
    SELECT e.entity_id, e.name, e.plan_id, e.description,
           array_agg(p.x ORDER BY p.ordre) as xs,
           array_agg(p.y ORDER BY p.ordre) as ys
    FROM entities e
    LEFT JOIN points p ON e.entity_id = p.entity_id
    WHERE e.entity_type = 'VERTICAL_LINK'
    GROUP BY e.entity_id, e.name, e.plan_id, e.description
    ORDER BY e.entity_id
""")

vertical_links = cur.fetchall()
print(f"\n🔗 VERTICAL_LINKS DÉTAILLÉS ({len(vertical_links)}):")

# Grouper par linkGroupId
groups = {}
for vl in vertical_links:
    floor = plan_to_floor.get(vl['plan_id'], '?')
    desc = {}
    if vl['description']:
        try:
            desc = json.loads(vl['description'])
        except:
            pass
    
    link_group = desc.get('linkGroupId', 'NO_GROUP')
    vl_type = desc.get('type', 'unknown')
    
    if link_group not in groups:
        groups[link_group] = []
    
    groups[link_group].append({
        'entity_id': vl['entity_id'],
        'name': vl['name'],
        'plan_id': vl['plan_id'],
        'floor': floor,
        'type': vl_type,
        'description': desc,
        'xs': vl['xs'],
        'ys': vl['ys']
    })

for group_id, links in groups.items():
    print(f"\n   Groupe '{group_id}' ({len(links)} éléments):")
    for link in links:
        center_x = sum(link['xs']) / len(link['xs']) if link['xs'] else 0
        center_y = sum(link['ys']) / len(link['ys']) if link['ys'] else 0
        print(f"      - Entity {link['entity_id']}: {link['name']}")
        print(f"        Plan {link['plan_id']} (Étage {link['floor']}), Type: {link['type']}")
        print(f"        Position: ({center_x:.0f}, {center_y:.0f})")
        print(f"        Description: {link['description']}")

# Vérifier les salles
cur.execute("""
    SELECT e.entity_id, e.name, e.plan_id,
           array_agg(p.x ORDER BY p.ordre) as xs,
           array_agg(p.y ORDER BY p.ordre) as ys
    FROM entities e
    LEFT JOIN points p ON e.entity_id = p.entity_id
    WHERE e.entity_type = 'ROOM'
    GROUP BY e.entity_id, e.name, e.plan_id
    ORDER BY e.entity_id
""")

rooms = cur.fetchall()
print(f"\n🏠 SALLES ({len(rooms)}):")
for room in rooms:
    floor = plan_to_floor.get(room['plan_id'], '?')
    point_count = len(room['xs']) if room['xs'] else 0
    print(f"   Entity {room['entity_id']}: {room['name']} - Plan {room['plan_id']} (Étage {floor}), {point_count} points")

# Vérifier les portes
cur.execute("""
    SELECT e.entity_id, e.name, e.plan_id, e.description
    FROM entities
    WHERE e.entity_type = 'DOOR'
    ORDER BY e.entity_id
""")

doors = cur.fetchall()
print(f"\n🚪 PORTES ({len(doors)}):")
for door in doors:
    floor = plan_to_floor.get(door['plan_id'], '?')
    desc = {}
    if door['description']:
        try:
            desc = json.loads(door['description'])
        except:
            pass
    room_a = desc.get('room_a', '?')
    room_b = desc.get('room_b', '?')
    print(f"   Entity {door['entity_id']}: {door['name']} - Plan {door['plan_id']} (Étage {floor})")
    print(f"      Relie salles: {room_a} ↔ {room_b}")

# Vérifier les relations
cur.execute("""
    SELECT r.relation_id, r.source_id, r.cible_id, r.type_relation,
           e1.entity_type as source_type, e1.name as source_name,
           e2.entity_type as cible_type, e2.name as cible_name
    FROM relations r
    LEFT JOIN entities e1 ON r.source_id = e1.entity_id
    LEFT JOIN entities e2 ON r.cible_id = e2.entity_id
    ORDER BY r.relation_id
""")

relations = cur.fetchall()
print(f"\n🔗 RELATIONS ({len(relations)}):")
for rel in relations:
    print(f"   {rel['source_name']} ({rel['source_type']}) --{rel['type_relation']}--> {rel['cible_name']} ({rel['cible_type']})")

cur.close()
conn.close()

print("\n" + "=" * 80)
print("ANALYSE TERMINÉE")
print("=" * 80)
