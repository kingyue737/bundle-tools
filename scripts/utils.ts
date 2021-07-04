import 'zx'
import path from 'path'
import semver from 'semver'
import prompts from 'prompts'
import { loadConfig, Changelog } from '@kazupon/lerna-changelog'

export type PackageJson = {
  name: string
  version: string
  private?: boolean
  workspaces?: string[]
}

export type Mode = 'package' | 'batch'
export type Logger = (...args: any[]) => void // eslint-disable-line @typescript-eslint/no-explicit-any
export type Incrementer = (i: any) => string // eslint-disable-line @typescript-eslint/no-explicit-any

const VersionIncrements = [
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease'
] as const

export const run = (bin, args) => {
  const q = $.quote
  const v = $.verbose
  $.quote = v => v
  $.verbose = false
  try {
    return $`${bin} ${args.join(' ')}`
  } finally {
    $.quote = q
    $.verbose = v
  }
}

export async function getRootPath() {
  const { stdout: rootPath } = await run('git', [
    'rev-parse',
    '--show-toplevel'
  ])
  return rootPath.split('\n')[0]
}

export async function getRelativePath() {
  const { stdout } = await run('git', ['rev-parse', '--show-prefix'])
  return stdout.split('\n')[0]
}

export async function readPackageJson(path: string) {
  const data = await fs.readFile(path, 'utf8')
  const json = JSON.parse(data)
  if (isPackageJson(json)) {
    return json
  } else {
    throw new Error(`Invalid package: ${path}`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPackageJson(pkg: any): pkg is PackageJson {
  return pkg && typeof pkg === 'object' && pkg.name
}

export async function getRepoName() {
  const rootPath = await getRootPath()
  return path.parse(rootPath).name
}

export function getIncrementer(
  currentVersion: string,
  release = 'beta'
): Incrementer {
  return i => semver.inc(currentVersion, i, release)
}

export function getTags(
  pkgName: string,
  currentVersion: string,
  targetVersion = ''
) {
  const tag =
    pkgName === 'intlify' ? `v${targetVersion}` : `${pkgName}@${targetVersion}`
  const fromTag =
    pkgName === 'intlify'
      ? `v${currentVersion}`
      : `${pkgName}@${currentVersion}`
  return { tag, fromTag }
}

export async function getTargetVersion(
  currentVersion: string,
  inc: Incrementer
) {
  const { release } = await prompts({
    type: 'select',
    name: 'release',
    message: 'Select release type',
    choices: VersionIncrements.map(i => `${i} (${inc(i)})`)
      .concat(['custom'])
      .map(i => ({ value: i, title: i }))
  })

  if (release === 'custom') {
    const res = await prompts({
      type: 'text',
      name: 'version',
      message: 'Input custom version',
      initial: currentVersion
    })
    return res.version as string
  } else {
    return release.match(/\((.*)\)/)[1] as string
  }
}

export async function renderChangelog(from: string, next: string, pkg: string) {
  const config = await loadConfig()
  config.nextVersion = next
  config.package = pkg
  const changelog = new Changelog(config)
  return await changelog.createMarkdown({ tagFrom: from })
}

export async function writeChangelog(
  pkgDir: string,
  log: string,
  next: string
) {
  const escapedVersion = next.replace(/\./g, '\\.')
  const regex = new RegExp(
    `(#+?\\s\\[?v?${escapedVersion}\\]?[\\s\\S]*?)(#+?\\s\\[?v?\\d\\.\\d\\.\\d\\]?)`,
    'g'
  )
  const matches = regex.exec(log.toString())
  const head = matches ? matches[1] : log

  const changelogPath = path.resolve(pkgDir, 'CHANGELOG.md')
  const changelog = await fs.readFile(changelogPath, 'utf8')
  return await fs.writeFile(changelogPath, `${head}\n\n${changelog}`)
}
