import { ITEM_TYPES, SIZE_OPTIONS, CATEGORIES, CATEGORY_TYPES, typesForCategory } from './itemSizes'

describe('ITEM_TYPES', () => {
  it('contains all 15 equipment types (incl. Skate/Classic XC)', () => {
    expect(ITEM_TYPES).toHaveLength(15)
    expect(ITEM_TYPES).toContain('Alpine Ski')
    expect(ITEM_TYPES).toContain('Skate')
    expect(ITEM_TYPES).toContain('Classic')
    expect(ITEM_TYPES).toContain('Ski Boot')
    expect(ITEM_TYPES).toContain('Other')
    expect(ITEM_TYPES).not.toContain('Snowboard Pole')
  })
})

describe('CATEGORY_TYPES', () => {
  it('categories stay in sync with ITEM_TYPES/CATEGORY_TYPES expectations', () => {
    expect(CATEGORIES).toContain('Skis')
    expect(CATEGORIES).toContain('Clothing')
    expect(CATEGORY_TYPES['Skis']).toEqual(['Alpine Ski', 'Nordic/XC Ski', 'Skate', 'Classic'])
    expect(typesForCategory('Skis')).toContain('Other')
  })

  it('typesForCategory falls back to the full list for empty/unknown/unmapped', () => {
    expect(typesForCategory(null)).toEqual(ITEM_TYPES)
    expect(typesForCategory('Bindings')).toEqual(ITEM_TYPES)
    expect(typesForCategory('Mystery')).toEqual(ITEM_TYPES)
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
