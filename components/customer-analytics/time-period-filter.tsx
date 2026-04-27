'use client'

import * as React from 'react'

import {
  TIME_PERIOD_PRESETS,
  getTimePeriodDateRange,
} from '@/lib/customer-analytics'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface TimePeriodFilterProps {
  value: string
  onChange: (preset: string, startDate: string, endDate: string) => void
}

export function TimePeriodFilter({ value, onChange }: TimePeriodFilterProps) {
  const [customStartDate, setCustomStartDate] = React.useState('')
  const [customEndDate, setCustomEndDate] = React.useState('')

  function handlePresetChange(preset: string) {
    if (preset === 'custom') {
      onChange(preset, customStartDate, customEndDate)
    } else {
      const { startDate, endDate } = getTimePeriodDateRange(preset)
      onChange(preset, startDate, endDate)
    }
  }

  function handleStartDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newStart = e.target.value
    setCustomStartDate(newStart)
    if (newStart && customEndDate) {
      onChange('custom', newStart, customEndDate)
    }
  }

  function handleEndDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newEnd = e.target.value
    setCustomEndDate(newEnd)
    if (customStartDate && newEnd) {
      onChange('custom', customStartDate, newEnd)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={handlePresetChange}>
        <SelectTrigger className="min-w-[150px]">
          <SelectValue placeholder="Chọn khoảng thời gian" />
        </SelectTrigger>
        <SelectContent>
          {TIME_PERIOD_PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value === 'custom' && (
        <>
          <Input
            type="date"
            value={customStartDate}
            onChange={handleStartDateChange}
            className="w-[150px]"
          />
          <Input
            type="date"
            value={customEndDate}
            onChange={handleEndDateChange}
            className="w-[150px]"
          />
        </>
      )}
    </div>
  )
}
