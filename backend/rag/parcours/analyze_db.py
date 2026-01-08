"""
Analyser les escaliers et portes de la DB
"""
import sys, psycopg2, json, os

conn = psycopg2.connect(
    host=os.getenv('DB_HOST', 'localhost'),
    port=int(os.getenv('DB_PORT', 5432)),
    database=os.getenv('DB_NAME', 'museumvoice'),
    user=os.getenv('DB_USER', 'museum_admin'),
    password=os.getenv('DB_PASSWORD', 'museum_password')
)

cur = conn.cursor()

print("=" * 80)
print("ANALYSE BASE DE DONNÉES - ESCALIERS ET PORTES")
print("=" * 80)

# Plans
print("\n📋 PLANS:")
cur.execute("SELECT plan_id, nom FROM plans ORDER BY plan_id")
for row in cur.fetchall():
    print(f"   Plan {row[0]}: {row[1]}")

# Escaliers
print("\n🪜 ESCALIERS:")
cur.execute("""
    SELECT entity_id, name, plan_id, description
    FROM entities
    WHERE entity_type = 'VERTICAL_LINK'
    ORDER BY plan_id, entity_id
""")

escaliers = cur.fetchall()
for row in escaliers:
    desc = json.loads(row[3]) if row[3] else {}
    link_group = desc.get('linkGroupId', 'N/A')[:8]
    link_num = desc.get('linkNumber', '?')
    connected = desc.get('connectedFloorIds', [])
    
    print(f"\n   ID {row[0]} - {row[1]} (Plan {row[2]})")
    print(f"      linkGroupId: {link_group}")
    print(f"      linkNumber: {link_num}")
    print(f"      connectedFloorIds: {connected}")

# Groupes
print("\n📊 GROUPES D'ESCALIERS:")
groups = {}
for row in escaliers:
    desc = json.loads(row[3]) if row[3] else {}
    group_id = desc.get('linkGroupId', 'N/A')
    if group_id not in groups:
        groups[group_id] = []
    groups[group_id].append((row[0], row[1], row[2]))

for group_id, escs in groups.items():
    print(f"\n   Groupe {group_id[:8]}:")
    for esc in escs:
        print(f"      - ID {esc[0]}: {esc[1]} (Plan {esc[2]})")

# Portes
print("\n🚪 RELATIONS DOOR:")
cur.execute("""
    SELECT DISTINCT r.source_id, r.cible_id,
           es.name as source_name, ec.name as cible_name
    FROM relations r
    JOIN entities es ON r.source_id = es.entity_id
    JOIN entities ec ON r.cible_id = ec.entity_id
    WHERE r.type_relation = 'DOOR'
    ORDER BY r.source_id, r.cible_id
""")

doors = cur.fetchall()
print(f"\n   Total: {len(doors)} relations")

# Dédupliquer
unique_doors = set()
for row in doors:
    pair = tuple(sorted([row[0], row[1]]))
    unique_doors.add(pair)

print(f"   Uniques (après déduplication): {len(unique_doors)} portes")
for pair in sorted(unique_doors):
    names = [d[2] if d[0] == pair[0] else d[3] for d in doors if pair[0] in (d[0], d[1]) and pair[1] in (d[0], d[1])]
    print(f"      - {names[0] if names else pair[0]} ↔ {names[1] if len(names) > 1 else pair[1]}")

# Compter doublons
print("\n⚠️ DOUBLONS DÉTECTÉS:")
cur.execute("""
    SELECT source_id, cible_id, COUNT(*) as cnt
    FROM relations
    WHERE type_relation = 'DOOR'
    GROUP BY source_id, cible_id
    HAVING COUNT(*) > 1
""")
doublons = cur.fetchall()
if doublons:
    for row in doublons:
        print(f"   - Salle {row[0]} → {row[1]}: {row[2]} fois")
else:
    print("   Aucun doublon exact")

conn.close()
