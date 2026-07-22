import { PermissionManagerType } from '@baserow/modules/core/permissionManagerTypes'

class LinxPermissionManagerType extends PermissionManagerType {
  static getType() {
    return 'linx'
  }

  hasPermission(permissions, operation) {
    if (!permissions?.managed) return undefined
    if (permissions.denied_operations?.includes(operation)) return false
    return undefined
  }
}

export default defineNuxtPlugin({
  name: 'linx-permissions',
  dependsOn: ['core'],
  setup(nuxtApp) {
    if (!nuxtApp.$registry.exists('permissionManager', 'linx')) {
      nuxtApp.$registry.register(
        'permissionManager',
        new LinxPermissionManagerType({ app: nuxtApp })
      )
    }
  },
})
