/**
 * 根据 Conventional Commits 生成分类 Release Notes。
 * 用法：node scripts/gen-release-notes.mjs <tag>   （tag 缺省取 GITHUB_REF_NAME）
 * 输出到 stdout，由调用方重定向到 RELEASE_BODY.md。
 */
import { execFileSync } from 'node:child_process'

/** 静默执行 git 命令，失败时返回 null（例如首个版本找不到上个 tag） */
function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

const tag = process.argv[2] || process.env['GITHUB_REF_NAME']
if (!tag) throw new Error('缺少 tag 参数（例：node scripts/gen-release-notes.mjs v0.2.0）')

// 往上找最近的祖先 tag；首个版本则用根提交作为起点
const previous = git(['describe', '--tags', '--abbrev=0', `${tag}^`])
const range = previous ? `${previous}..${tag}` : tag
const subjects = (git(['log', '--format=%s', range]) || '').split('\n').filter(Boolean)

// 前缀 -> 展示分组
const GROUPS = [
  { key: 'feat', title: '🚀 新增功能' },
  { key: 'perf', title: '⚡ 优化改进' },
  { key: 'style', title: '⚡ 优化改进' },
  { key: 'refactor', title: '⚡ 优化改进' },
  { key: 'fix', title: '🐛 问题修复' },
  { key: 'docs', title: '📦 其他变更' },
  { key: 'build', title: '📦 其他变更' },
  { key: 'chore', title: '📦 其他变更' },
  { key: 'ci', title: '📦 其他变更' },
  { key: 'test', title: '📦 其他变更' },
]
const bucket = new Map()
for (const g of GROUPS) if (!bucket.has(g.title)) bucket.set(g.title, [])

for (const subject of subjects) {
  // 纯版本号 bump（chore: 0.2.0）不进发布说明
  if (/^chore:\s*\d+\.\d+\.\d+\s*$/i.test(subject)) continue
  // 兼容 feat(scope)!: 描述 与 feat: 描述
  const m = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:\s*(.+)$/i)
  const group = m ? (GROUPS.find((g) => g.key === m[1].toLowerCase())?.title ?? '📦 其他变更') : '📦 其他变更'
  const text = m ? m[2] : subject
  bucket.get(group).push(text)
}

const count = (title) => bucket.get(title).length
const lines = [`## MemoTrail ${tag}`, '']

if (previous) {
  lines.push(
    `相比 ${previous}，本次更新包含 ${count('🚀 新增功能')} 项新功能、${count('⚡ 优化改进')} 项优化、${count('🐛 问题修复')} 项修复。`,
    '',
  )
} else {
  lines.push('首个正式版本。', '')
}

for (const title of ['🚀 新增功能', '⚡ 优化改进', '🐛 问题修复']) {
  const items = bucket.get(title)
  if (!items.length) continue
  lines.push(`### ${title}`, '', ...items.map((s) => `- ${s}`), '')
}

// 版本 bump、文档、构建类变更折叠，避免发布页噪音过大
const misc = bucket.get('📦 其他变更')
if (misc.length) {
  lines.push('<details>', '<summary>📦 其他变更</summary>', '', ...misc.map((s) => `- ${s}`), '', '</details>', '')
}

lines.push(`**Full Changelog**: ${previous ? `${previous}...${tag}` : tag}`)
process.stdout.write(lines.join('\n') + '\n')
