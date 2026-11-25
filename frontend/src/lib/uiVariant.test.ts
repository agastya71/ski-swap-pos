/**
 * Tests for the A/B UI-variant flag (lib/uiVariant.ts) — URL param, storage
 * persistence, default behavior, and root-class application.
 * See docs/ui-overhaul-ab-plan-2026-11-24.md.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyVariantRootClass,
  clearUiVariant,
  resolveUiVariant,
  variantFromSearch,
  storedVariant,
  type UiVariant,
} from './uiVariant'

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

describe('variantFromSearch', () => {
  it('parses ?ui=v2 and ?ui=v1', () => {
    expect(variantFromSearch('?ui=v2')).toBe('v2')
    expect(variantFromSearch('?ui=v1')).toBe('v1')
  })

  it('returns null when absent or unknown', () => {
    expect(variantFromSearch('')).toBeNull()
    expect(variantFromSearch('?other=1')).toBeNull()
    expect(variantFromSearch('?ui=v3')).toBeNull()
    // hash-router URLs carry the param before the hash
    expect(variantFromSearch('?ui=v2')).toBe('v2')
  })
})

describe('storedVariant / clearUiVariant', () => {
  let storage: Storage
  beforeEach(() => { storage = fakeStorage() })

  it('reads a persisted v2 flag and tolerates junk values', () => {
    storage.setItem('ui-variant', 'v2')
    expect(storedVariant(storage)).toBe('v2')
    storage.setItem('ui-variant', 'bogus')
    expect(storedVariant(storage)).toBeNull()
    expect(storedVariant(null)).toBeNull()
  })

  it('clearUiVariant removes the key silently', () => {
    storage.setItem('ui-variant', 'v2')
    clearUiVariant(storage)
    expect(storage.getItem('ui-variant')).toBeNull()
    expect(() => clearUiVariant(null)).not.toThrow()
  })
})

describe('resolveUiVariant', () => {
  let storage: Storage
  beforeEach(() => { storage = fakeStorage() })

  it('defaults to v1 with no URL param and nothing stored', () => {
    expect(resolveUiVariant('', storage)).toBe('v1')
  })

  it('URL param wins over storage and is written through', () => {
    storage.setItem('ui-variant', 'v1')
    expect(resolveUiVariant('?ui=v2', storage)).toBe('v2')
    expect(storage.getItem('ui-variant')).toBe('v2')
  })

  it('?ui=v1 switches back and clears the stored v2 choice', () => {
    storage.setItem('ui-variant', 'v2')
    expect(resolveUiVariant('?ui=v1', storage)).toBe('v1')
    expect(storage.getItem('ui-variant')).toBe('v1')
  })

  it('falls back to storage when the URL has no param', () => {
    storage.setItem('ui-variant', 'v2')
    expect(resolveUiVariant('', storage)).toBe('v2')
  })

  it('still honors the URL when storage is unavailable', () => {
    expect(resolveUiVariant('?ui=v2', null)).toBe('v2')
  })
})

describe('applyVariantRootClass', () => {
  it('toggles the ui-v2 root class on and off', () => {
    applyVariantRootClass('v2' as UiVariant)
    expect(document.documentElement.classList.contains('ui-v2')).toBe(true)
    applyVariantRootClass('v1' as UiVariant)
    expect(document.documentElement.classList.contains('ui-v2')).toBe(false)
  })
})
