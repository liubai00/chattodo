import { describe, it, expect } from 'vitest'
import { matchProjectId, type Project } from '../src/index.js'

function proj(id: string, name: string): Project {
  return {
    id,
    name,
    description: '',
    status: 'active',
    privacyScope: 'work',
    createdAt: '',
    updatedAt: '',
  }
}

describe('matchProjectId', () => {
  const projects = [proj('p1', 'MVP 文档'), proj('p2', 'Cubox'), proj('p3', 'X')]

  it('matches a project name contained in the text (case-insensitive)', () => {
    expect(matchProjectId(projects, '下周三前提交 cubox 稍后读评审')).toBe('p2')
    expect(matchProjectId(projects, '写 MVP 文档评审')).toBe('p1')
  })
  it('ignores names shorter than 2 chars', () => {
    expect(matchProjectId(projects, '看看 X 的进展')).toBeNull()
  })
  it('returns null for empty text or no match', () => {
    expect(matchProjectId(projects, '')).toBeNull()
    expect(matchProjectId(projects, '无关文本')).toBeNull()
  })
  it('returns the first hit in list order', () => {
    expect(matchProjectId([proj('a', 'foo'), proj('b', 'foobar')], 'about foobar')).toBe('a')
  })
})
