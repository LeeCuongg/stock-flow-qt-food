'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function formatCurrency(value: number): string {
  if (!value && value !== 0) return ''
  return value.toLocaleString('vi-VN')
}

function parseCurrency(str: string): number {
  const cleaned = str.replace(/\./g, '').replace(/,/g, '')
  const num = Number(cleaned)
  return isNaN(num) ? 0 : num
}

interface CurrencyInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  value: number
  onValueChange: (value: number) => void
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, ...props }, ref) => {
    const [display, setDisplay] = React.useState(formatCurrency(value))
    const [focused, setFocused] = React.useState(false)

    React.useEffect(() => {
      if (!focused) {
        setDisplay(formatCurrency(value))
      }
    }, [value, focused])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      // Allow only digits and dots (as thousand separator)
      const cleaned = raw.replace(/[^\d]/g, '')
      const num = Number(cleaned)
      if (!isNaN(num)) {
        onValueChange(num)
        // Format while typing
        setDisplay(num === 0 && cleaned === '' ? '' : num.toLocaleString('vi-VN'))
      }
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true)
      // Select all on focus for easy replacement
      setTimeout(() => e.target.select(), 0)
    }

    const handleBlur = () => {
      setFocused(false)
      setDisplay(formatCurrency(value))
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        className={cn('text-right', className)}
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
CurrencyInput.displayName = 'CurrencyInput'

export { CurrencyInput, formatCurrency, parseCurrency }
