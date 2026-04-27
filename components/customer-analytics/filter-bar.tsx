'use client'

import type { CustomerOption, MetricKey } from '@/lib/customer-analytics'
import { CustomerSelector } from './customer-selector'
import { MetricSelector } from './metric-selector'

interface FilterBarProps {
  customers: CustomerOption[]
  selectedCustomerIds: string[]
  onCustomerSelectionChange: (ids: string[]) => void
  metric: MetricKey
  onMetricChange: (metric: MetricKey) => void
}

export function FilterBar({
  customers,
  selectedCustomerIds,
  onCustomerSelectionChange,
  metric,
  onMetricChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
      <CustomerSelector
        customers={customers}
        selectedIds={selectedCustomerIds}
        onSelectionChange={onCustomerSelectionChange}
      />
      <MetricSelector value={metric} onChange={onMetricChange} />
    </div>
  )
}
