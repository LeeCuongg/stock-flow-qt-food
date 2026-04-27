'use client'

import * as React from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { CustomerOption } from '@/lib/customer-analytics'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

interface CustomerSelectorProps {
  customers: CustomerOption[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function CustomerSelector({
  customers,
  selectedIds,
  onSelectionChange,
}: CustomerSelectorProps) {
  const [open, setOpen] = React.useState(false)

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds])

  function handleToggle(customerId: string) {
    if (selectedSet.has(customerId)) {
      onSelectionChange(selectedIds.filter((id) => id !== customerId))
    } else {
      onSelectionChange([...selectedIds, customerId])
    }
  }

  function handleClear() {
    onSelectionChange([])
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="min-w-[200px] justify-between"
          >
            {selectedIds.length > 0 ? (
              <span className="flex items-center gap-2">
                <span className="truncate">Khách hàng</span>
                <Badge variant="secondary">{selectedIds.length}</Badge>
              </span>
            ) : (
              <span className="text-muted-foreground">Chọn khách hàng...</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm khách hàng..." />
            <CommandList>
              <CommandEmpty>Không tìm thấy khách hàng.</CommandEmpty>
              <CommandGroup>
                {customers.map((customer) => {
                  const isSelected = selectedSet.has(customer.value)
                  return (
                    <CommandItem
                      key={customer.value}
                      value={customer.label}
                      onSelect={() => handleToggle(customer.value)}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="pointer-events-none"
                      />
                      <span className="truncate">{customer.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedIds.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
          <span>Xóa bộ lọc</span>
        </Button>
      )}
    </div>
  )
}
