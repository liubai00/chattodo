// infrastructure/request 出口：令牌 + 通用 HTTP 客户端。
export { getToken, setToken, TOKEN_KEY } from './token'
export { request, apiUrl, type RequestError } from './client'
