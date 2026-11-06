import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  formatMw,
  formatPct,
  formatBias,
  formatDate,
  formatUtcDateTime,
} from '@/lib/formatters'

describe('Formatters', () => {
  it('formats plain numbers with configurable decimals and grouping', () => {
    expect(formatNumber(12345.6789, 2)).toBe('12,345.68')
    expect(formatNumber(12345.6789, 4)).toBe('12,345.6789')
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
  })

  it('formats MW values correctly with commas and unit', () => {
    expect(formatMw(2038.9126, 2)).toBe('2,038.91 MW')
    expect(formatMw(2038.9126, 4)).toBe('2,038.9126 MW')
    expect(formatMw(null)).toBe('— MW')
    expect(formatMw(undefined)).toBe('— MW')
  })

  it('formats percentages correctly', () => {
    expect(formatPct(22.0446, 2)).toBe('22.04%')
    expect(formatPct(22.0446, 4)).toBe('22.0446%')
    expect(formatPct(null)).toBe('— %')
  })

  it('formats signed bias with positive and negative indicators', () => {
    const positiveBias = formatBias(1747.8871, 2)
    expect(positiveBias.text).toBe('+1,747.89 MW')
    expect(positiveBias.direction).toBe('positive')

    const negativeBias = formatBias(-86.1458, 2)
    expect(negativeBias.text).toBe('-86.15 MW')
    expect(negativeBias.direction).toBe('negative')

    const zeroBias = formatBias(0.0, 2)
    expect(zeroBias.text).toBe('0.00 MW')
    expect(zeroBias.direction).toBe('neutral')
  })

  it('formats ISO calendar dates cleanly for Europe/London delivery display', () => {
    expect(formatDate('2026-01-02')).toBe('02 Jan 2026')
    expect(formatDate('2026-02-01')).toBe('01 Feb 2026')
    expect(formatDate(null)).toBe('—')
  })

  it('formats UTC ISO datetimes with explicit timezone identifier', () => {
    const formatted = formatUtcDateTime('2026-11-03T16:38:11Z')
    expect(formatted).toContain('03 Nov 2026')
    expect(formatted).toContain('16:38:11 UTC')
  })
})
