# Implementation Plan: Customer Analytics Dashboard

## Overview

Mở rộng tab "Khách hàng" trong `/dashboard` bằng cách thêm SQL RPC mới, xóa pie chart cũ, tạo 3 bộ lọc (Customer Selector, Time Period Filter, Metric Selector), biểu đồ đường xu hướng, bảng phân tích hiệu quả, và card cảnh báo khách hàng cần hỗ trợ. Sử dụng TypeScript, Next.js App Router, Supabase, Recharts, shadcn/ui, Tailwind CSS.

## Tasks

- [x] 1. Set up SQL migration and testing infrastructure
  - [x] 1.1 Create `scripts/031_customer_monthly_stats_rpc.sql` with the `get_customer_monthly_stats` RPC function
    - Define function accepting `p_warehouse_id UUID`, `p_start_date DATE`, `p_end_date DATE`, `p_customer_ids UUID[] DEFAULT NULL`
    - Return table: `customer_id`, `customer_name`, `month`, `monthly_revenue`, `monthly_orders`, `monthly_avg_order_value`, `monthly_outstanding_debt`
    - Aggregate from `sales` table joined with `customers`, grouped by customer + month
    - Exclude cancelled sales (`status != 'CANCELLED'`)
    - Handle optional `p_customer_ids` filter (NULL or empty = all customers)
    - Order by `customer_name ASC, month ASC`
    - Use `SECURITY DEFINER` and `SET search_path = public` matching existing RPC patterns in `scripts/020_enhanced_dashboard_rpcs.sql`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 1.2 Set up Vitest and fast-check for property-based testing
    - Install `vitest` and `fast-check` as dev dependencies
    - Create `vitest.config.ts` at project root
    - _Requirements: supports testing for all properties_

- [x] 2. Create TypeScript interfaces and utility functions
  - [x] 2.1 Create `lib/customer-analytics.ts` with shared types and data transformation utilities
    - Define `CustomerMonthlyStat`, `MetricKey`, `MetricOption`, `TrendChartDataPoint`, `CustomerPerformance`, `CustomerOption`, `TimePeriodPreset` interfaces as specified in design
    - Implement `METRIC_OPTIONS` constant array with label, yAxisLabel, formatValue for each metric
    - Implement `TIME_PERIOD_PRESETS` constant array with Vietnamese labels
    - Implement `getTimePeriodDateRange(preset: string): { startDate: string; endDate: string }` for preset date calculations
    - Implement `filterStatsByCustomers(stats: CustomerMonthlyStat[], customerIds: string[]): CustomerMonthlyStat[]` — returns all stats when customerIds is empty, otherwise filters
    - Implement `getMetricValue(stat: CustomerMonthlyStat, metric: MetricKey): number` — maps metric key to the correct field
    - Implement `transformToChartData(stats: CustomerMonthlyStat[], metric: MetricKey): TrendChartDataPoint[]` — groups by month, creates dynamic customer name keys
    - Implement `calculateCustomerPerformance(stats: CustomerMonthlyStat[]): CustomerPerformance[]` — groups by customer, sums revenue/orders, calculates trend (±20% threshold), sorts by total_revenue DESC
    - Implement `getUnderperformingCustomers(performances: CustomerPerformance[]): CustomerPerformance[]` — filters trend === 'down', sorts by trend_pct ASC
    - Implement `filterCustomersBySearch(customers: CustomerOption[], search: string): CustomerOption[]` — case-insensitive name search
    - Implement `formatMonthLabel(monthDate: string): string` — converts 'YYYY-MM-01' to 'T1'...'T12'
    - _Requirements: 2.3, 2.5, 2.6, 3.2, 3.3, 4.2, 4.3, 4.4, 4.5, 5.4, 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.4_

  - [ ]* 2.2 Write property test: Customer search filtering (Property 1)
    - **Property 1: Customer search filtering is correct**
    - Generate random customer names and search strings with fast-check
    - Verify filtered result contains exactly customers whose name includes search string (case-insensitive)
    - Verify no false positives (non-matching customers excluded)
    - **Validates: Requirements 2.3**

  - [ ]* 2.3 Write property test: Customer selection filters data correctly (Property 2)
    - **Property 2: Customer selection filters data correctly**
    - Generate random `CustomerMonthlyStat[]` and random subset of customer_ids
    - Verify every entry in result has customer_id in selected set
    - Verify no entries for non-selected customers
    - Verify empty selection returns all entries
    - **Validates: Requirements 2.6, 5.3, 6.3**

  - [ ]* 2.4 Write property test: Metric selection maps to correct data field (Property 3)
    - **Property 3: Metric selection maps to correct data field**
    - Generate random `CustomerMonthlyStat` and random `MetricKey`
    - Verify `getMetricValue` returns the correct field value for each metric key
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**

  - [ ]* 2.5 Write property test: Trend calculation and underperforming classification (Property 4)
    - **Property 4: Trend calculation and underperforming classification**
    - Generate random monthly revenue sequences (at least 2 months)
    - Verify trend classification: down if < -20%, up if > +20%, stable otherwise
    - Verify underperforming list contains exactly customers with trend === 'down'
    - Verify underperforming list sorted by trend_pct ascending
    - **Validates: Requirements 6.4, 6.5, 6.6, 6.7, 7.1, 7.4**

  - [ ]* 2.6 Write property test: Performance table default sort order (Property 5)
    - **Property 5: Performance table default sort order**
    - Generate random `CustomerPerformance[]` data
    - Verify output sorted by total_revenue descending (each row >= next row)
    - **Validates: Requirements 6.8**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Remove pie chart and create Filter Bar components
  - [x] 4.1 Remove the "Cơ cấu công nợ phải thu" pie chart from `app/dashboard/page.tsx`
    - Remove the `<Card>` containing the PieChart with title "Cơ cấu công nợ phải thu" from the Customer tab
    - Adjust the grid layout so the Top Customers bar chart takes full width or shares space with the new Revenue Trend Chart
    - Retain all other existing components (KPI cards, top customers bar chart, daily cash flow chart, receivables table, payables table)
    - _Requirements: 1.1, 1.2_

  - [x] 4.2 Create `components/customer-analytics/customer-selector.tsx` — multi-select combobox
    - Use `cmdk` (already in dependencies) + Popover pattern from shadcn/ui
    - Accept `customers: CustomerOption[]`, `selectedIds: string[]`, `onSelectionChange: (ids: string[]) => void`
    - Implement search input that filters customer list case-insensitively
    - Support multi-select with checkboxes
    - Display badge with count of selected customers
    - Include "Xóa bộ lọc" clear button when customers are selected
    - Show placeholder "Chọn khách hàng..." when none selected
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 4.3 Create `components/customer-analytics/time-period-filter.tsx`
    - Accept `value: string`, `onChange: (preset: string, startDate: string, endDate: string) => void`
    - Render Select with presets: "Tháng này", "Tháng trước", "3 tháng" (default), "6 tháng", "Năm nay", "Tuỳ chọn"
    - When "Tuỳ chọn" selected, show two date Input fields for start_date and end_date
    - Calculate date ranges using `getTimePeriodDateRange` from `lib/customer-analytics.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.4 Create `components/customer-analytics/metric-selector.tsx`
    - Accept `value: MetricKey`, `onChange: (metric: MetricKey) => void`
    - Render Select with options: "Doanh thu" (default), "Số đơn hàng", "Giá trị TB/đơn", "Công nợ"
    - Use `METRIC_OPTIONS` from `lib/customer-analytics.ts`
    - _Requirements: 4.1, 4.6_

  - [x] 4.5 Create `components/customer-analytics/filter-bar.tsx` — wrapper composing all 3 filters
    - Arrange CustomerSelector, TimePeriodFilter, MetricSelector in a horizontal row on desktop (lg:flex-row)
    - Stack vertically on mobile (flex-col)
    - _Requirements: 9.1, 9.2_

- [x] 5. Create chart and table components
  - [x] 5.1 Create `components/customer-analytics/revenue-trend-chart.tsx` — line chart
    - Accept `data: TrendChartDataPoint[]`, `metric: MetricKey`, `customerNames: string[]`, `loading: boolean`
    - Use Recharts `LineChart` with `ChartContainer` from shadcn/ui
    - X-axis: monthly labels "T1"..."T12", Y-axis: metric value
    - Separate colored line per customer using `COLORS` array
    - Tooltip showing customer name, month, formatted value (VND for monetary, integer for orders)
    - Legend identifying each customer line
    - Update chart title and Y-axis label based on selected metric
    - Show Skeleton while loading, NoData when empty
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x] 5.2 Create `components/customer-analytics/customer-performance-table.tsx`
    - Accept `data: CustomerPerformance[]`, `loading: boolean`
    - Columns: Tên khách hàng, Tổng doanh thu, Số đơn hàng, Giá trị TB/đơn, Xu hướng, Công nợ
    - Trend indicators: red downward arrow + "Giảm" for down, green upward arrow + "Tăng" for up, neutral "Ổn định" for stable
    - Highlight underperforming rows (trend === 'down') with subtle warning background (e.g., `bg-red-50 dark:bg-red-950/20`)
    - Default sort by total_revenue descending
    - Client-side pagination when > 20 rows (20 per page)
    - Show Skeleton while loading, NoData when empty
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x] 5.3 Create `components/customer-analytics/underperforming-customers-card.tsx`
    - Accept `data: CustomerPerformance[]`, `loading: boolean`
    - Display card listing customers with trend === 'down'
    - Show each customer's name, total revenue, percentage change, outstanding debt
    - Sort by magnitude of decline (largest decline first = trend_pct ascending)
    - When no underperforming customers, show positive message "Tất cả khách hàng đều hoạt động tốt"
    - Show Skeleton while loading
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 6. Integrate everything into the dashboard page
  - [x] 6.1 Add new state variables and RPC call to `app/dashboard/page.tsx`
    - Add state: `customerMonthlyStats`, `selectedCustomerIds`, `customerTimePeriod` (default "3_months"), `selectedMetric` (default "revenue"), `customerAnalyticsLoading`, `customerAnalyticsError`
    - Add `loadCustomerAnalytics` function that calls `get_customer_monthly_stats` RPC with warehouse_id and date range
    - Trigger `loadCustomerAnalytics` on tab switch to "customers" and when time period changes
    - Derive `filteredStats`, `chartData`, `performanceData`, `underperformingData` using utility functions from `lib/customer-analytics.ts`
    - Extract unique customer list from stats for CustomerSelector
    - Handle loading and error states independently from existing dashboard data
    - _Requirements: 8.1, 2.5, 2.6, 3.5, 4.7, 5.7, 9.5, 9.6_

  - [x] 6.2 Wire Filter Bar and new components into the Customer tab
    - Insert FilterBar at the top of the Customer tab, above existing KPI cards
    - Place RevenueTrendChart in a 2-column grid alongside existing Top Customers bar chart (desktop) or stacked (mobile)
    - Place CustomerPerformanceTable below the charts grid
    - Place UnderperformingCustomersCard below the performance table
    - Keep existing Daily Cash Flow chart, Receivables table, and Payables table below the new components
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 6.3 Write unit tests for dashboard integration
    - Test that filter state changes trigger correct data re-derivation
    - Test loading skeleton display during fetch
    - Test error message display on RPC failure
    - _Requirements: 9.5, 9.6_

- [x] 7. Responsive layout adjustments
  - [x] 7.1 Verify and adjust responsive layout in `app/dashboard/page.tsx` Customer tab
    - Filter bar: horizontal row on desktop (lg:flex-row), vertical stack on mobile (flex-col)
    - Charts: 2-column grid on desktop (lg:grid-cols-2), single column on mobile
    - Ensure all new components show loading skeletons while data is fetching
    - Ensure error states display within affected card without breaking other components
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate the 5 correctness properties defined in the design document using `fast-check`
- The RPC is called only when the time period changes; customer filtering and metric switching are client-side operations
- Existing dashboard components (KPI cards, top customers bar chart, daily cash flow, receivables/payables tables) are preserved
