/**
 * Reusable "Import Items" control — a button that opens a file picker for the
 * bulk item template (.xlsx / .csv / .tsv), posts it to the intake import
 * endpoint, and shows a summary (imported / skipped + per-row errors).
 *
 * Used in the intake items step (individual consignors and vendors) and the
 * admin seller detail page, so both intake paths can bulk-import from a filled
 * template.
 *
 * @module ImportItemsButton
 */
import { useRef, useState, type ChangeEvent } from 'react'
import { importItems } from '../api/intakes'
import { downloadImportTemplate } from '../api/items'
import type { ImportResult } from '../types'

const NAVY = '#1e3a8a'

/**
 * @param props.intakeId - ID of the intake session to import items into.
 * @param props.onImported - Callback invoked with the import result after a successful import (e.g. to refresh the item list).
 */
export function ImportItemsButton({ intakeId, onImported }: {
  intakeId: number
  onImported: (result: ImportResult) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    try {
      const r = await importItems(intakeId, file)
      setResult(r)
      onImported(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDownloadTemplate() {
    try {
      await downloadImportTemplate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Template download failed')
    }
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
        >
          Import Items
        </button>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          title="Download the blank .xlsx bulk-import template to fill out"
          style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
        >
          Download Template
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv,.tsv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: 13, marginTop: 6 }}>{error}</div>}
      {result && (
        <div style={{ fontSize: 13, marginTop: 6, color: '#334155' }}>
          Imported <strong>{result.imported}</strong>{result.skipped > 0 && <>; skipped <strong>{result.skipped}</strong></>}.
          {result.errors.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 20, color: '#ef4444' }}>
              {result.errors.map((er, idx) => <li key={idx}>Row {er.row}: {er.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}