import { ITEM_TYPES, SIZE_OPTIONS } from './itemSizes'

describe('ITEM_TYPES', () => {
  it('contains all 14 equipment types', () => {
    expect(ITEM_TYPES).toHaveLength(14)
    expect(ITEM_TYPES).toContain('Alpine Ski')
    expect(ITEM_TYPES).toContain('Ski Boot')
    expect(ITEM_TYPES).toContain('Other')
  })
})

describe('SIZE_OPTIONS', () => {
  it('has no entry for Other (free-text fallback)', () => {
    expect(SIZE_OPTIONS['Other']).toBeUndefined()
  })

  it('Alpine Ski runs 70cm–210cm in 5cm steps (29 values)', () => {
    const sizes = SIZE_OPTIONS['Alpine Ski']
    expect(sizes).toHaveLength(29)
    expect(sizes[0]).toBe('70cm')
    expect(sizes[sizes.length - 1]).toBe('210cm')
  })

  it('Ski Boot runs 15.0–33.0 Mondo in 0.5 steps (37 values)', () => {
    const sizes = SIZE_OPTIONS['Ski Boot']
    expect(sizes).toHaveLength(37)
    expect(sizes[0]).toBe('15.0 (Mondo)')
    expect(sizes[sizes.length - 1]).toBe('33.0 (Mondo)')
  })

  it('Helmet has standard alpha sizes', () => {
    expect(SIZE_OPTIONS['Helmet']).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
  })
})
