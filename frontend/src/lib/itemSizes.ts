export const ITEM_TYPES: string[] = [
  'Alpine Ski',
  'Snowboard',
  'Nordic/XC Ski',
  'Ski Boot',
  'Snowboard Boot',
  'Ski Pole',
  'Helmet',
  'Goggles',
  'Jacket',
  'Pants',
  'Base Layer',
  'Gloves',
  'Other',
]

function cmRange(start: number, end: number, step: number): string[] {
  const out: string[] = []
  for (let n = start; n <= end; n += step) out.push(`${n}cm`)
  return out
}

function mondoRange(startTenths: number, endTenths: number): string[] {
  const out: string[] = []
  for (let n = startTenths; n <= endTenths; n += 5) {
    out.push(`${(n / 10).toFixed(1)} (Mondo)`)
  }
  return out
}

export const SIZE_OPTIONS: Record<string, string[]> = {
  'Alpine Ski':     cmRange(70, 210, 5),
  'Snowboard':      cmRange(70, 175, 5),
  'Nordic/XC Ski':  cmRange(90, 215, 5),
  'Ski Pole':       cmRange(70, 140, 5),
  'Ski Boot':       mondoRange(150, 330),
  'Snowboard Boot': ['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'],
  'Helmet':         ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'Goggles':        ['Youth', 'One Size', 'S', 'M', 'L'],
  'Jacket':         ['4', '6', '8', '10', '12', '14', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  'Pants':          ['4', '6', '8', '10', '12', '14', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  'Base Layer':     ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'Gloves':         ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
}
