'use client'

import { type MetricKey, METRIC_OPTIONS } from '@/lib/customer-analytics'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MetricSelectorProps {
  value: MetricKey
  onChange: (metric: MetricKey) => void
}

export function MetricSelector({ value, onChange }: MetricSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MetricKey)}>
      <SelectTrigger className="min-w-[150px]">
        <SelectValue placeholder="Chọn chỉ số" />
      </SelectTrigger>
      <SelectContent>
        {METRIC_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
