import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

type RedirectRule = {
  from: string
  to: string
  status: string
}

function readRedirectRules(): RedirectRule[] {
  const redirectsPath = path.resolve(process.cwd(), 'public/_redirects')
  const raw = readFileSync(redirectsPath, 'utf8')

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [from, to, status] = line.split(/\s+/)
      return {
        from: from ?? '',
        to: to ?? '',
        status: status ?? '',
      }
    })
}

describe('snapshot redirect rules', () => {
  it('prioritizes static asset serving before snapshot deep-link fallbacks', () => {
    const rules = readRedirectRules()

    expect(rules).toEqual([
      { from: '/static/*', to: '/static/:splat', status: '200' },
      { from: '/s/*', to: '/', status: '200' },
      { from: '/:payload', to: '/', status: '200' },
    ])
  })
})
