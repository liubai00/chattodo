import { search, mentions } from '../services/search.js'

export default async function searchRoutes(app) {
  app.get('/api/search', async (req) => search(req.repos, req.query?.q))
  app.get('/api/mentions', async (req) => mentions(req.repos, req.query?.q))
}
