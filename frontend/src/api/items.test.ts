/**
 * Tests for downloadImportTemplate — verifies the correct URL, auth header,
 * and download trigger. Regression for the dual bug where the function used the
 * wrong localStorage key ('token' instead of 'auth_token') and the wrong URL
 * path ('/api/items/...' instead of '/items/...').
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { setToken } from './client'
import { downloadImportTemplate } from './items'

describe('downloadImportTemplate', () => {
  let lastRequest: Request | null = null

  beforeEach(() => {
    lastRequest = null
    server.use(
      http.get('/items/import-template', ({ request }) => {
        lastRequest = request
        return new HttpResponse(new ArrayBuffer(8), {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        })
      }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(document.body, 'appendChild').mockImplementation(node => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(node => node)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setToken(null)
  })

  it('sends the Bearer token from the shared client token store', async () => {
    setToken(ADMIN_TOKEN)
    await downloadImportTemplate()
    expect(lastRequest?.headers.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
  })

  it('requests /items/import-template — no /api/ prefix', async () => {
    setToken(ADMIN_TOKEN)
    await downloadImportTemplate()
    expect(lastRequest?.url).toMatch(/\/items\/import-template$/)
    expect(lastRequest?.url).not.toContain('/api/')
  })

  it('triggers a file download via an anchor element', async () => {
    setToken(ADMIN_TOKEN)
    const mockLink = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink)
    await downloadImportTemplate()
    expect(mockLink.download).toBe('import-template.xlsx')
    expect(mockLink.click).toHaveBeenCalledOnce()
  })
})
