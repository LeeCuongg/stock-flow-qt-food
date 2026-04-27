"use client"

import { TrendingDown, CheckCircle2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { CustomerPerformance } from "@/lib/customer-analytics"

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
})

interface UnderperformingCustomersCardProps {
  data: CustomerPerformance[]
  loading: boolean
}

export function UnderperformingCustomersCard({
  data,
  loading,
}: UnderperformingCustomersCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="size-5 text-red-500" />
          Khách hàng cần hỗ trợ
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 py-4">
            <CheckCircle2 className="size-5" />
            <span>Tất cả khách hàng đều hoạt động tốt</span>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {data.map((customer) => (
              <div
                key={customer.customer_id}
                className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{customer.customer_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Doanh thu: {vndFormatter.format(customer.total_revenue)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                    {Math.round(customer.trend_pct)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Nợ: {vndFormatter.format(customer.outstanding_debt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
