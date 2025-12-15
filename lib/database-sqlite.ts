import sqlite3 from 'sqlite3'
import { Database } from 'sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'database', 'museum_v1.db')

let db: Database | null = null

// Fonction pour obtenir une connexion à la base de données
export function getDatabase(): Promise<Database> {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db)
    }

    // Créer le répertoire database s'il n'existe pas
    const fs = require('fs')
    const dbDir = path.dirname(DB_PATH)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Erreur connexion SQLite:', err)
        reject(err)
      } else {
        console.log('Connecté à la base de données SQLite museum_v1.db')
        
        // Créer la table qr_codes si elle n'existe pas
        initializeDatabase()
          .then(() => resolve(db!))
          .catch(reject)
      }
    })
  })
}

// Initialiser la base de données avec les tables nécessaires
async function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Base de données non initialisée'))
      return
    }

    const createQRCodesTable = `
      CREATE TABLE IF NOT EXISTS qr_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token VARCHAR(64) UNIQUE NOT NULL,
        created_by VARCHAR(100) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_used BOOLEAN DEFAULT 0,
        used_at DATETIME NULL
      )
    `

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_qr_codes_token ON qr_codes(token)',
      'CREATE INDEX IF NOT EXISTS idx_qr_codes_is_used ON qr_codes(is_used)',
      'CREATE INDEX IF NOT EXISTS idx_qr_codes_created_by ON qr_codes(created_by)'
    ]

    db.run(createQRCodesTable, (err) => {
      if (err) {
        console.error('Erreur création table qr_codes:', err)
        reject(err)
        return
      }

      // Créer les index
      let indexCount = 0
      const totalIndexes = createIndexes.length

      if (totalIndexes === 0) {
        resolve()
        return
      }

      createIndexes.forEach((indexSQL) => {
        db!.run(indexSQL, (err) => {
          if (err) {
            console.error('Erreur création index:', err)
          }
          
          indexCount++
          if (indexCount === totalIndexes) {
            console.log('Base de données museum_v1 initialisée avec succès')
            resolve()
          }
        })
      })
    })
  })
}

// Fonction utilitaire pour exécuter une requête avec promesse
export function runQuery(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    getDatabase()
      .then((database) => {
        database.run(sql, params, function(err) {
          if (err) {
            reject(err)
          } else {
            resolve({ 
              changes: this.changes, 
              lastID: this.lastID 
            })
          }
        })
      })
      .catch(reject)
  })
}

// Fonction utilitaire pour obtenir une seule ligne
export function getRow(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    getDatabase()
      .then((database) => {
        database.get(sql, params, (err, row) => {
          if (err) {
            reject(err)
          } else {
            resolve(row)
          }
        })
      })
      .catch(reject)
  })
}

// Fonction utilitaire pour obtenir plusieurs lignes
export function getRows(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    getDatabase()
      .then((database) => {
        database.all(sql, params, (err, rows) => {
          if (err) {
            reject(err)
          } else {
            resolve(rows)
          }
        })
      })
      .catch(reject)
  })
}

// Fermer la connexion à la base de données
export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          reject(err)
        } else {
          console.log('Connexion SQLite fermée')
          db = null
          resolve()
        }
      })
    } else {
      resolve()
    }
  })
}