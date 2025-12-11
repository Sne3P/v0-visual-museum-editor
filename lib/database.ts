import { Client } from 'pg'

// Configuration de la base de données
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'museum_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
}

export async function getDbClient() {
  const client = new Client(dbConfig)
  await client.connect()
  return client
}

export async function executeQuery(query: string, params: any[] = []) {
  const client = await getDbClient()
  try {
    const result = await client.query(query, params)
    return result
  } finally {
    await client.end()
  }
}

export async function executeTransaction(queries: Array<{ text: string, params?: any[] }>) {
  const client = await getDbClient()
  try {
    await client.query('BEGIN')
    
    for (const query of queries) {
      await client.query(query.text, query.params || [])
    }
    
    await client.query('COMMIT')
    return { success: true }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}