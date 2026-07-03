// Back-compat surface: the DB layer is now the async driver (pg / PGlite).
// createDb → an async driver instance; applySchema/getDb re-exported.
export { createDriver as createDb, applySchema, getDriver as getDb } from './driver.js'
