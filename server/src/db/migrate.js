import { config } from '../config.js'
import { createDb, applySchema } from './index.js'

const db = createDb(config.dbPath)
applySchema(db)
console.log(`migrated: ${config.dbPath}`)
db.close()
