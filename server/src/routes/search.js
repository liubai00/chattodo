import { search, mentions } from '../services/search.js'

export default async function searchRoutes(app) {
  const { repos } = app
  app.get('/api/search', async (req) => search(repos, req.query?.q))
  app.get('/api/mentions', async (req) => mentions(repos, req.query?.q))
}
