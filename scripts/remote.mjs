import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'

const IS_WIN = process.platform === 'win32'

export function resolveSshKeyPath(configPath, root) {
  const p = configPath || '.ssh/chattodo_deploy'
  return isAbsolute(p) ? p : resolve(root, p)
}

function sshCommonArgs(keyPath) {
  return [
    '-i', keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'IdentitiesOnly=yes',
  ]
}

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
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
      if (code === 0) resolvePromise(stdout.trim())
      else reject(new Error(`${cmd} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
    child.on('error', reject)
  })
}

export function createRemoteClient(config, root) {
  const keyPath = resolveSshKeyPath(config.DEPLOY_SSH_KEY, root)
  if (!existsSync(keyPath)) {
    throw new Error(
      `SSH 私钥不存在: ${keyPath}\n请先运行: npm run deploy:setup-ssh`,
    )
  }

  const target = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}`
  const base = sshCommonArgs(keyPath)

  return {
    run(cmd, args, opts = {}) {
      return run(cmd, args, { cwd: opts.cwd ?? root, ...opts })
    },
    ssh(command, opts = {}) {
      return run('ssh', [...base, target, command], opts)
    },
    scp(localFile, remotePath, opts = {}) {
      return run('scp', [...base, localFile, `${target}:${remotePath}`], opts)
    },
  }
}
