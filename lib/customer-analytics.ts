// =============================================
// Customer Analytics - Shared types & utilities
// =============================================

// --- Interfaces ---

export interface CustomerMonthlyStat {
  customer_id: string
  customer_name: string
  month: string // DATE dạng 'YYYY-MM-01'
  monthly_revenue: number
  monthly_orders: number
  monthly_avg_order_value: number
  monthly_outstanding_debt: number
}

export type MetricKey = 'revenue' | 'orders' | 'avg_order_value' | 'debt'

export interface MetricOption {
  value: MetricKey
  label: string
  yAxisLabel: string
  formatValue: (v: number) => string
}

export interface TrendChartDataPoint {
  month: string // display label (e.g. '15/4', 'T4', '2025')
  monthDate: string // raw date string for sorting
  [customerName: string]: number | string
}

export interface CustomerPerformance {
  customer_id: string
  customer_name: string
  total_revenue: number
  total_orders: number
  avg_order_value: number
  outstanding_debt: number
  trend: 'up' | 'down' | 'stable'
  trend_pct: number
}

export interface CustomerOption {
  value: string // customer_id
  label: string // customer_name
}

export interface TimePeriodPreset {
  value: string
  label: string
}

// --- Constants ---

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
})

export const METRIC_OPTIONS: MetricOption[] = [
  {
    value: 'revenue',
    label: 'Doanh thu',
    yAxisLabel: 'Doanh thu (VND)',
    formatValue: (v: number) => vndFormatter.format(v),
  },
  {
    value: 'orders',
    label: 'Số đơn hàng',
    yAxisLabel: 'Số đơn hàng',
    formatValue: (v: number) => Math.round(v).toLocaleString('vi-VN'),
  },
  {
    value: 'avg_order_value',
    label: 'Giá trị TB/đơn',
    yAxisLabel: 'Giá trị TB/đơn (VND)',
    formatValue: (v: number) => vndFormatter.format(v),
  },
  {
    value: 'debt',
    label: 'Công nợ',
    yAxisLabel: 'Công nợ (VND)',
    formatValue: (v: number) => vndFormatter.format(v),
  },
]

export const TIME_PERIOD_PRESETS: TimePeriodPreset[] = [
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: '3_months', label: '3 tháng' },
  { value: '6_months', label: '6 tháng' },
  { value: 'this_year', label: 'Năm nay' },
  { value: 'custom', label: 'Tuỳ chọn' },
]

// --- Utility Functions ---

/**
 * Calculate start/end dates for a given time period preset.
 * Dates are in 'YYYY-MM-DD' format, based on Vietnam timezone.
 */
export function getTimePeriodDateRange(preset: string): {
  startDate: string
  endDate: string
} {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })
  )
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case 'this_month': {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0) // last day of current month
      return { startDate: fmt(start), endDate: fmt(end) }
    }
    case 'last_month': {
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 0) // last day of previous month
      return { startDate: fmt(start), endDate: fmt(end) }
    }
    case '3_months': {
      const start = new Date(year, month - 2, 1)
      const end = new Date(year, month + 1, 0)
      return { startDate: fmt(start), endDate: fmt(end) }
    }
    case '6_months': {
      const start = new Date(year, month - 5, 1)
      const end = new Date(year, month + 1, 0)
      return { startDate: fmt(start), endDate: fmt(end) }
    }
    case 'this_year': {
      const start = new Date(year, 0, 1)
      const end = new Date(year, month + 1, 0)
      return { startDate: fmt(start), endDate: fmt(end) }
    }
    default:
      // 'custom' or unknown — default to 3 months
      return getTimePeriodDateRange('3_months')
  }
}

/**
 * Filter stats by selected customer IDs.
 * Returns all stats when customerIds is empty.
 */
export function filterStatsByCustomers(
  stats: CustomerMonthlyStat[],
  customerIds: string[]
): CustomerMonthlyStat[] {
  if (customerIds.length === 0) return stats
  const idSet = new Set(customerIds)
  return stats.filter((s) => idSet.has(s.customer_id))
}

/**
 * Extract the numeric value for a given metric key from a stat record.
 */
export function getMetricValue(
  stat: CustomerMonthlyStat,
  metric: MetricKey
): number {
  switch (metric) {
    case 'revenue':
      return stat.monthly_revenue
    case 'orders':
      return stat.monthly_orders
    case 'avg_order_value':
      return stat.monthly_avg_order_value
    case 'debt':
      return stat.monthly_outstanding_debt
  }
}

/**
 * Convert 'YYYY-MM-01' to 'T1'...'T12'.
 */
export function formatMonthLabel(monthDate: string): string {
  const monthNum = parseInt(monthDate.slice(5, 7), 10)
  return `T${monthNum}`
}

export type Granularity = 'day' | 'month' | 'year'

/**
 * Determine granularity based on date range span.
 * < 2 months → day, 2 months to 2 years → month, > 2 years → year
 */
export function getGranularity(startDate: string, endDate: string): Granularity {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffMs = end.getTime() - start.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays < 60) return 'day'
  if (diffDays <= 730) return 'month'
  return 'year'
}

/**
 * Format a date string for chart X-axis label based on granularity.
 * day: '15/4', month: 'T4', year: '2025'
 */
export function formatDateLabel(dateStr: string, granularity: Granularity): string {
  switch (granularity) {
    case 'day': {
      const d = new Date(dateStr)
      return `${d.getDate()}/${d.getMonth() + 1}`
    }
    case 'month':
      return formatMonthLabel(dateStr)
    case 'year':
      return dateStr.slice(0, 4)
  }
}

/**
 * Transform raw stats into chart-ready data points.
 * Groups by date key, creates dynamic customer name keys.
 * Granularity determines the X-axis label format.
 */
export function transformToChartData(
  stats: CustomerMonthlyStat[],
  metric: MetricKey,
  granularity: Granularity = 'month'
): TrendChartDataPoint[] {
  const byDate = new Map<string, TrendChartDataPoint>()

  for (const stat of stats) {
    let point = byDate.get(stat.month)
    if (!point) {
      point = {
        month: formatDateLabel(stat.month, granularity),
        monthDate: stat.month,
      }
      byDate.set(stat.month, point)
    }
    point[stat.customer_name] = getMetricValue(stat, metric)
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.monthDate.localeCompare(b.monthDate)
  )
}

/**
 * Calculate performance metrics per customer.
 * Groups by customer, sums revenue/orders, calculates trend, sorts by total_revenue DESC.
 */
export function calculateCustomerPerformance(
  stats: CustomerMonthlyStat[]
): CustomerPerformance[] {
  // Group stats by customer_id
  const byCustomer = new Map<
    string,
    { name: string; months: CustomerMonthlyStat[] }
  >()

  for (const stat of stats) {
    let entry = byCustomer.get(stat.customer_id)
    if (!entry) {
      entry = { name: stat.customer_name, months: [] }
      byCustomer.set(stat.customer_id, entry)
    }
    entry.months.push(stat)
  }

  const performances: CustomerPerformance[] = []

  for (const [customerId, { name, months }] of byCustomer) {
    const totalRevenue = months.reduce((s, m) => s + m.monthly_revenue, 0)
    const totalOrders = months.reduce((s, m) => s + m.monthly_orders, 0)
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    // Outstanding debt: use the most recent month's value
    const sortedMonths = [...months].sort((a, b) =>
      a.month.localeCompare(b.month)
    )
    const outstandingDebt =
      sortedMonths[sortedMonths.length - 1].monthly_outstanding_debt

    // Trend calculation
    let trend: 'up' | 'down' | 'stable' = 'stable'
    let trendPct = 0

    if (sortedMonths.length >= 2) {
      const lastMonthRevenue =
        sortedMonths[sortedMonths.length - 1].monthly_revenue
      const previousMonths = sortedMonths.slice(0, -1)
      const previousMonthsAvg =
        previousMonths.reduce((s, m) => s + m.monthly_revenue, 0) /
        previousMonths.length

      if (previousMonthsAvg !== 0) {
        trendPct =
          ((lastMonthRevenue - previousMonthsAvg) / previousMonthsAvg) * 100
        if (trendPct < -20) trend = 'down'
        else if (trendPct > 20) trend = 'up'
        else trend = 'stable'
      }
    }

    performances.push({
      customer_id: customerId,
      customer_name: name,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_order_value: avgOrderValue,
      outstanding_debt: outstandingDebt,
      trend,
      trend_pct: trendPct,
    })
  }

  // Sort by total_revenue DESC
  performances.sort((a, b) => b.total_revenue - a.total_revenue)

  return performances
}

/**
 * Filter performances to only underperforming customers (trend === 'down').
 * Sorted by trend_pct ASC (largest decline first, i.e. most negative first).
 */
export function getUnderperformingCustomers(
  performances: CustomerPerformance[]
): CustomerPerformance[] {
  return performances
    .filter((p) => p.trend === 'down')
    .sort((a, b) => a.trend_pct - b.trend_pct)
}

/**
 * Case-insensitive search filter for customer options.
 */
export function filterCustomersBySearch(
  customers: CustomerOption[],
  search: string
): CustomerOption[] {
  if (!search) return customers
  const lower = search.toLowerCase()
  return customers.filter((c) => c.label.toLowerCase().includes(lower))
}
