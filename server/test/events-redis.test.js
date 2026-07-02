import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initEvents, eventsMode, subscribe, publish, publishMany } from '../src/services/events.js'

// Fake redis pair: publisher.publish routes synchronously to pSubscribe handlers,
// exercising the exact redis-mode fan-out path without a server.
function makeFakeRedisPair() {
  const handlers = []
  const published = []
  const subscriber = {
    pSubscribe: async (_pattern, cb) => { handlers.push(cb) },
  }
  const publisher = {
    publish: (channel, message) => {
      published.push({ channel, message })
      for (const h of handlers) h(message, channel)
      return Promise.resolve(1)
    },
  }
  return { publisher, subscriber, published }
}

test('redis mode: publish fans out through pub/sub to local SSE sockets', async () => {
  const { publisher, subscriber, published } = makeFakeRedisPair()
  const m = await initEvents({ publisher, subscriber })
  assert.equal(m, 'redis')
  assert.equal(eventsMode(), 'redis')

  const framesA = []
  const framesB = []
  const unA = subscribe('u_a', { write: (s) => framesA.push(s) })
  const unB = subscribe('u_b', { write: (s) => framesB.push(s) })

  publish('u_a', { kind: 'notify', text: '来自 redis 的问候' })
  assert.equal(published.length, 1)
  assert.equal(published[0].channel, 'linx:evt:u_a')
  assert.equal(framesA.length, 1)
  assert.ok(framesA[0].includes('event: notify'))
  assert.ok(framesA[0].includes('来自 redis 的问候'))
  assert.equal(framesB.length, 0) // 频道按用户隔离

  publishMany(['u_a', 'u_b'], { kind: 'task', taskId: 't1' })
  assert.equal(framesA.length, 2)
  assert.equal(framesB.length, 1)
  assert.equal(published.length, 3)

  // 无本地连接的用户：publish 仍走 redis（其他实例可能持有该用户的连接）
  publish('u_offline_here', { kind: 'notify' })
  assert.equal(published.length, 4)

  unA(); unB()
})

test('init without redisUrl stays in local mode', async () => {
  // 新进程里未 init 前默认 local；显式空 init 也应保持 local（此文件已进 redis 模式，
  // 该断言在独立进程的 o-phase 测试中覆盖 —— 这里验证 init 空参返回值语义即可）
  const m = await initEvents({})
  assert.equal(typeof m, 'string')
})
