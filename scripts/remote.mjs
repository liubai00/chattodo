import { spawn } from 'node:child_process'
import { loadDeploySecret, resolveSecretPath } from './secrets.mjs'

const IS_WIN = process.platform === 'win32'

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const { silent, cwd, shell } = opts
    const useShell = shell ?? (IS_WIN && cmd === 'npm')
    const child = spawn(cmd, args, {
      cwd,
      stdio: silent ? 'pipe' : 'inherit',
      shell: useShell,
    })

    let stdout = ''
    let stderr = ''
    if (silent) {
      child.stdout.on('data', d => { stdout += d })
      child.stderr.on('data', d => { stderr += d })
    }

    child.on('exit', code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`${cmd} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
    child.on('error', reject)
  })
}

export function createRemoteClient(config, root) {
  const target = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}`
  const password = loadDeploySecret(resolveSecretPath(config.DEPLOY_SECRET_FILE))

  return {
    run(cmd, args, opts = {}) {
      return run(cmd, args, { cwd: opts.cwd ?? root, ...opts })
    },
    ssh(command, opts = {}) {
      return run('plink', ['-pw', password, '-batch', target, command], opts)
    },
    scp(localFile, remotePath) {
      return run('pscp', ['-pw', password, '-batch', localFile, `${target}:${remotePath}`])
    },
  }
}
