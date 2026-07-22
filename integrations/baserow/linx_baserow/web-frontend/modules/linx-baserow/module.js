import {
  addPlugin,
  addRouteMiddleware,
  createResolver,
  defineNuxtModule,
  extendPages,
} from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'linx-baserow',
  },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    let parentOrigin = 'http://localhost:5173'
    try {
      const configured = new URL(
        process.env.LINX_PARENT_ORIGIN || process.env.LINX_PUBLIC_URL || parentOrigin
      )
      if (!['http:', 'https:'].includes(configured.protocol)) throw new Error()
      parentOrigin = configured.origin
    } catch {
      // Fail closed to the local development origin for malformed deployment input.
    }

    nuxt.options.runtimeConfig.public.linxParentOrigin =
      parentOrigin
    nuxt.options.runtimeConfig.public.linxPublicUrl =
      process.env.LINX_PUBLIC_URL || 'http://localhost:5173'
    nuxt.options.routeRules = nuxt.options.routeRules || {}
    nuxt.options.routeRules['/**'] = {
      ...(nuxt.options.routeRules['/**'] || {}),
      headers: {
        ...(nuxt.options.routeRules['/**']?.headers || {}),
        'content-security-policy': `frame-ancestors 'self' ${parentOrigin}`,
      },
    }
    nuxt.options.routeRules['/linx/session'] = {
      ...(nuxt.options.routeRules['/linx/session'] || {}),
      headers: {
        ...(nuxt.options.routeRules['/linx/session']?.headers || {}),
        'referrer-policy': 'no-referrer',
        'cache-control': 'no-store',
      },
    }

    extendPages((pages) => {
      pages.push({
        name: 'linx-session',
        path: '/linx/session',
        file: resolve('./pages/session.vue'),
        meta: { layout: false },
      })
    })

    addPlugin({ src: resolve('./plugins/embed-bridge.client.js') })
    addPlugin({ src: resolve('./plugins/linx-permissions.client.js') })
    addPlugin({ src: resolve('./plugins/danger-confirmation.client.js') })
    addRouteMiddleware({
      name: 'linxOnly',
      path: resolve('./middleware/linx-only.client.js'),
      global: true,
    })
    nuxt.options.css.push(resolve('./assets/linx.scss'))
  },
})
