-- ============================================
-- TEST CYCLE SAVE/LOAD - VÉRIFICATION DONNÉES
-- ============================================

\echo '===== ÉTAT INITIAL ====='
\echo ''
\echo '📊 OEUVRES (avec métadonnées):'
SELECT 
    oeuvre_id, 
    title, 
    artist, 
    date_oeuvre, 
    materiaux_technique,
    CASE WHEN pdf_link IS NOT NULL THEN '✅ PDF' ELSE '❌ No PDF' END as pdf_status
FROM oeuvres 
ORDER BY oeuvre_id;

\echo ''
\echo '📖 NARRATIONS (pregenerations):'
SELECT COUNT(*) as total_narrations FROM pregenerations;

\echo ''
\echo '🏛️ ENTITIES (artworks):'
SELECT 
    entity_id, 
    name, 
    entity_type,
    oeuvre_id,
    CASE WHEN oeuvre_id IS NOT NULL THEN '✅ Linked' ELSE '❌ No link' END as link_status
FROM entities 
WHERE entity_type = 'ARTWORK'
ORDER BY entity_id;

\echo ''
\echo '📍 POINTS (par artwork):'
SELECT 
    e.entity_id,
    e.name,
    COUNT(p.point_id) as nb_points,
    CASE WHEN COUNT(p.point_id) = 4 THEN '✅ OK' ELSE '❌ Missing' END as status
FROM entities e
LEFT JOIN points p ON e.entity_id = p.entity_id
WHERE e.entity_type = 'ARTWORK'
GROUP BY e.entity_id, e.name
ORDER BY e.entity_id;

\echo ''
\echo '✅ Test complet - Tout doit être présent'
\echo 'Attendu:'
\echo '  - 4 oeuvres avec artist = "Eugène Leroy"'
\echo '  - 144 narrations'
\echo '  - 4 entities ARTWORK avec oeuvre_id NOT NULL'
\echo '  - 4 points par artwork (16 total)'
