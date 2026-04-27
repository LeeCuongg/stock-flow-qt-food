import { describe, it, expect } from 'vitest'
import {
  filterStatsByCustomers,
  getMetricValue,
  formatMonthLabel,
  transformToChartData,
  calculateCustomerPerformance,
  getUnderperformingCustomers,
  filterCustomersBySearch,
  getTimePeriodDateRange,
  METRIC_OPTIONS,
  TIME_PERIOD_PRESETS,
  type CustomerMonthlyStat,
  type CustomerOption,
} from './customer-analytics'

// --- Test helpers ---

function makeStat(
  overrides: Partial<CustomerMonthlyStat> = {}
): CustomerMonthlyStat {
  return {
    customer_id: 'c1',
    customer_name: 'Cửa hàng A',
    month: '2025-01-01',
    monthly_revenue: 10_000_000,
    monthly_orders: 5,
    monthly_avg_order_value: 2_000_000,
    monthly_outstanding_debt: 1_000_000,
    ...overrides,
  }
}

// --- Constants ---

describe('METRIC_OPTIONS', () => {
  it('has 4 options with correct values', () => {
    expect(METRIC_OPTIONS.map((o) => o.value)).toEqual([
      'revenue',
      'orders',
      'avg_order_value',
      'debt',
    ])
  })

  it('formatValue for revenue returns VND string', () => {
    const opt = METRIC_OPTIONS.find((o) => o.value === 'revenue')!
    const formatted = opt.formatValue(1_500_000)
    expect(formatted).toContain('1.500.000')
  })

  it('formatValue for orders returns integer string', () => {
    const opt = METRIC_OPTIONS.find((o) => o.value === 'orders')!
    expect(opt.formatValue(42)).toBe('42')
  })
})

describe('TIME_PERIOD_PRESETS', () => {
  it('has 6 presets with Vietnamese labels', () => {
    expect(TIME_PERIOD_PRESETS).toHaveLength(6)
    expect(TIME_PERIOD_PRESETS[0]).toEqual({
      value: 'this_month',
      label: 'Tháng này',
    })
    expect(TIME_PERIOD_PRESETS[5]).toEqual({
      value: 'custom',
      label: 'Tuỳ chọn',
    })
  })
})

// --- formatMonthLabel ---

describe('formatMonthLabel', () => {
  it('converts YYYY-MM-01 to T1..T12', () => {
    expect(formatMonthLabel('2025-01-01')).toBe('T1')
    expect(formatMonthLabel('2025-06-01')).toBe('T6')
    expect(formatMonthLabel('2025-12-01')).toBe('T12')
  })
})

// --- getMetricValue ---

describe('getMetricValue', () => {
  const stat = makeStat()

  it('maps revenue to monthly_revenue', () => {
    expect(getMetricValue(stat, 'revenue')).toBe(10_000_000)
  })
  it('maps orders to monthly_orders', () => {
    expect(getMetricValue(stat, 'orders')).toBe(5)
  })
  it('maps avg_order_value to monthly_avg_order_value', () => {
    expect(getMetricValue(stat, 'avg_order_value')).toBe(2_000_000)
  })
  it('maps debt to monthly_outstanding_debt', () => {
    expect(getMetricValue(stat, 'debt')).toBe(1_000_000)
  })
})

// --- filterStatsByCustomers ---

describe('filterStatsByCustomers', () => {
  const stats = [
    makeStat({ customer_id: 'c1' }),
    makeStat({ customer_id: 'c2' }),
    makeStat({ customer_id: 'c3' }),
  ]

  it('returns all stats when customerIds is empty', () => {
    expect(filterStatsByCustomers(stats, [])).toEqual(stats)
  })

  it('filters to selected customer IDs', () => {
    const result = filterStatsByCustomers(stats, ['c1', 'c3'])
    expect(result).toHaveLength(2)
    expect(result.map((s) => s.customer_id)).toEqual(['c1', 'c3'])
  })

  it('returns empty when no IDs match', () => {
    expect(filterStatsByCustomers(stats, ['c99'])).toEqual([])
  })
})

// --- filterCustomersBySearch ---

describe('filterCustomersBySearch', () => {
  const customers: CustomerOption[] = [
    { value: 'c1', label: 'Cửa hàng ABC' },
    { value: 'c2', label: 'Đại lý XYZ' },
    { value: 'c3', label: 'abc shop' },
  ]

  it('returns all when search is empty', () => {
    expect(filterCustomersBySearch(customers, '')).toEqual(customers)
  })

  it('filters case-insensitively', () => {
    const result = filterCustomersBySearch(customers, 'abc')
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.value)).toEqual(['c1', 'c3'])
  })

  it('returns empty when nothing matches', () => {
    expect(filterCustomersBySearch(customers, 'zzz')).toEqual([])
  })
})

// --- transformToChartData ---

describe('transformToChartData', () => {
  it('groups by month and creates customer name keys', () => {
    const stats = [
      makeStat({
        customer_name: 'A',
        month: '2025-01-01',
        monthly_revenue: 100,
      }),
      makeStat({
        customer_name: 'B',
        month: '2025-01-01',
        monthly_revenue: 200,
      }),
      makeStat({
        customer_name: 'A',
        month: '2025-02-01',
        monthly_revenue: 150,
      }),
    ]
    const result = transformToChartData(stats, 'revenue')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      month: 'T1',
      monthDate: '2025-01-01',
      A: 100,
      B: 200,
    })
    expect(result[1]).toMatchObject({
      month: 'T2',
      monthDate: '2025-02-01',
      A: 150,
    })
  })

  it('sorts by monthDate ascending', () => {
    const stats = [
      makeStat({ month: '2025-03-01' }),
      makeStat({ month: '2025-01-01' }),
    ]
    const result = transformToChartData(stats, 'revenue')
    expect(result[0].monthDate).toBe('2025-01-01')
    expect(result[1].monthDate).toBe('2025-03-01')
  })

  it('returns empty array for empty input', () => {
    expect(transformToChartData([], 'revenue')).toEqual([])
  })
})

// --- calculateCustomerPerformance ---

describe('calculateCustomerPerformance', () => {
  it('calculates totals and sorts by revenue DESC', () => {
    const stats = [
      makeStat({
        customer_id: 'c1',
        customer_name: 'A',
        month: '2025-01-01',
        monthly_revenue: 100,
        monthly_orders: 2,
      }),
      makeStat({
        customer_id: 'c1',
        customer_name: 'A',
        month: '2025-02-01',
        monthly_revenue: 200,
        monthly_orders: 3,
      }),
      makeStat({
        customer_id: 'c2',
        customer_name: 'B',
        month: '2025-01-01',
        monthly_revenue: 500,
        monthly_orders: 10,
      }),
    ]
    const result = calculateCustomerPerformance(stats)
    expect(result).toHaveLength(2)
    // B has higher total revenue, should be first
    expect(result[0].customer_id).toBe('c2')
    expect(result[0].total_revenue).toBe(500)
    expect(result[1].customer_id).toBe('c1')
    expect(result[1].total_revenue).toBe(300)
    expect(result[1].total_orders).toBe(5)
  })

  it('marks trend as up when last month > 20% above average', () => {
    const stats = [
      makeStat({
        customer_id: 'c1',
        month: '2025-01-01',
        monthly_revenue: 100,
      }),
      makeStat({
        customer_id: 'c1',
        month: '2025-02-01',
        monthly_revenue: 100,
      }),
      makeStat({
        customer_id: 'c1',
        month: '2025-03-01',
        monthly_revenue: 200,
      }),
    ]
    const result = calculateCustomerPerformance(stats)
    expect(result[0].trend).toBe('up')
    expect(result[0].trend_pct).toBe(100) // 200 vs avg(100,100)=100 → +100%
  })

  it('marks trend as down when last month < -20% below average', () => {
    const stats = [
      makeStat({
        customer_id: 'c1',
        month: '2025-01-01',
        monthly_revenue: 100,
      }),
      makeStat({
        customer_id: 'c1',
        month: '2025-02-01',
        monthly_revenue: 100,
      }),
      makeStat({
        customer_id: 'c1',
        month: '2025-03-01',
        monthly_revenue: 50,
      }),
    ]
    const result = calculateCustomerPerformance(stats)
    expect(result[0].trend).toBe('down')
    expect(result[0].trend_pct).toBe(-50) // 50 vs avg(100,100)=100 → -50%
  })

  it('marks trend as stable when within ±20%', () => {
    const stats = [
      makeStat({
        customer_id: 'c1',
        month: '2025-01-01',
        monthly_revenue: 100,
      }),
      makeStat({
        customer_id: 'c1',
        month: '2025-02-01',
        monthly_revenue: 110,
      }),
    ]
    const result = calculateCustomerPerformance(stats)
    expect(result[0].trend).toBe('stable')
  })

  it('marks trend as stable when only 1 month', () => {
    const stats = [
      makeStat({ customer_id: 'c1', month: '2025-01-01' }),
    ]
    const result = calculateCustomerPerformance(stats)
    expect(result[0].trend).toBe('stable')
    expect(result[0].trend_pct).toBe(0)
  })

  it('marks trend as stable when previousMonthsAvg is 0', () => {
    const stats = [
      makeStat({
        customer_id: 'c1',
        month: '2025-01-01',
        monthly_revenue: 0,
      }),
      makeStat({
        customer_id: 'c1',
        month: '2025-02-01',
        monthly_revenue: 100,
      }),
    ]
    const result = calculateCustomerPerformance(stats)
    expect(result[0].trend).toBe('stable')
  })
})

// --- getUnderperformingCustomers ---

describe('getUnderperformingCustomers', () => {
  it('returns only customers with trend down, sorted by trend_pct ASC', () => {
    const performances = [
      {
        customer_id: 'c1',
        customer_name: 'A',
        total_revenue: 100,
        total_orders: 5,
        avg_order_value: 20,
        outstanding_debt: 0,
        trend: 'down' as const,
        trend_pct: -30,
      },
      {
        customer_id: 'c2',
        customer_name: 'B',
        total_revenue: 200,
        total_orders: 10,
        avg_order_value: 20,
        outstanding_debt: 0,
        trend: 'up' as const,
        trend_pct: 50,
      },
      {
        customer_id: 'c3',
        customer_name: 'C',
        total_revenue: 50,
        total_orders: 2,
        avg_order_value: 25,
        outstanding_debt: 0,
        trend: 'down' as const,
        trend_pct: -60,
      },
    ]
    const result = getUnderperformingCustomers(performances)
    expect(result).toHaveLength(2)
    expect(result[0].customer_id).toBe('c3') // -60 first
    expect(result[1].customer_id).toBe('c1') // -30 second
  })

  it('returns empty when no customers are declining', () => {
    const performances = [
      {
        customer_id: 'c1',
        customer_name: 'A',
        total_revenue: 100,
        total_orders: 5,
        avg_order_value: 20,
        outstanding_debt: 0,
        trend: 'stable' as const,
        trend_pct: 0,
      },
    ]
    expect(getUnderperformingCustomers(performances)).toEqual([])
  })
})

// --- getTimePeriodDateRange ---

describe('getTimePeriodDateRange', () => {
  it('returns valid date strings for all presets', () => {
    const presets = [
      'this_month',
      'last_month',
      '3_months',
      '6_months',
      'this_year',
    ]
    for (const preset of presets) {
      const { startDate, endDate } = getTimePeriodDateRange(preset)
      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(startDate <= endDate).toBe(true)
    }
  })

  it('defaults to 3_months for custom preset', () => {
    const custom = getTimePeriodDateRange('custom')
    const threeMonths = getTimePeriodDateRange('3_months')
    expect(custom).toEqual(threeMonths)
  })
})
