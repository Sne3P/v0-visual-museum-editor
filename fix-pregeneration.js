const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const dbPath = path.join(__dirname, 'database', 'museum_v1.db')
console.log(`🔧 Ajout de la table pregeneration: ${dbPath}`)

const db = new sqlite3.Database(dbPath)

db.serialize(() => {
  console.log('🏗️ Création de la table pregeneration...\n')
  
  // Table pregenerations selon le schéma bdd v2
  db.run(`
    CREATE TABLE IF NOT EXISTS pregenerations (
      pregeneration_id INTEGER PRIMARY KEY AUTOINCREMENT,
      oeuvre_id INTEGER NOT NULL,
      pregeneration_text TEXT,
      voice_link TEXT,
      FOREIGN KEY (oeuvre_id) REFERENCES oeuvres(oeuvre_id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Erreur pregenerations:', err)
    else console.log('✅ Table pregenerations créée')
  })
  
  // Table criterias_pregeneration
  db.run(`
    CREATE TABLE IF NOT EXISTS criterias_pregeneration (
      criterias_pregeneration_id INTEGER PRIMARY KEY AUTOINCREMENT,
      criteria_id INTEGER NOT NULL,
      pregeneration_id INTEGER NOT NULL,
      FOREIGN KEY (criteria_id) REFERENCES criterias(criteria_id) ON DELETE CASCADE,
      FOREIGN KEY (pregeneration_id) REFERENCES pregenerations(pregeneration_id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('❌ Erreur criterias_pregeneration:', err)
    else console.log('✅ Table criterias_pregeneration créée')
  })
  
  // Vérifier que les tables existent
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pregenerations', 'criterias_pregeneration')", (err, rows) => {
    if (err) {
      console.error('❌ Erreur vérification:', err)
    } else {
      console.log('📊 Tables trouvées:', rows.map(r => r.name))
    }
  })
})

db.close((err) => {
  if (err) console.error('❌ Erreur fermeture DB:', err)
  else console.log('\n🎉 Table pregeneration ajoutée avec succès!')
})