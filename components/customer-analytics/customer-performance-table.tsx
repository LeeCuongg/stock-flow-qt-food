"use client"

import { useMemo, useState } from "react"
import { TrendingDown, TrendingUp, Minus, ArrowUpDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { CustomerPerformance } from "@/lib/customer-analytics"

const ROWS_PER_PAGE = 20

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
})

type TrendFilter = "all" | "up" | "down" | "stable"
type SortKey = "revenue" | "orders" | "trend_pct" | "debt"
type SortDir = "asc" | "desc"

function TrendIndicator({ trend, trendPct }: { trend: CustomerPerformance["trend"]; trendPct: number }) {
  const pctStr = `${trendPct > 0 ? "+" : ""}${Math.round(trendPct)}%`
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
        <TrendingDown className="size-4" />
        Giảm {pctStr}
      </span>
    )
  }
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
        <TrendingUp className="size-4" />
        Tăng {pctStr}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Minus className="size-4" />
      Ổn định {pctStr}
    </span>
  )
}

interface CustomerPerformanceTableProps {
  data: CustomerPerformance[]
  loading: boolean
}

export function CustomerPerformanceTable({
  data,
  loading,
}: CustomerPerformanceTableProps) {
  const [page, setPage] = useState(0)
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("revenue")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const filteredAndSorted = useMemo(() => {
    let result = data
    if (trendFilter !== "all") {
      result = result.filter((r) => r.trend === trendFilter)
    }
    result = [...result].sort((a, b) => {
      let aVal: number, bVal: number
      switch (sortKey) {
        case "revenue": aVal = a.total_revenue; bVal = b.total_revenue; break
        case "orders": aVal = a.total_orders; bVal = b.total_orders; break
        case "trend_pct": aVal = a.trend_pct; bVal = b.trend_pct; break
        case "debt": aVal = a.outstanding_debt; bVal = b.outstanding_debt; break
      }
      return sortDir === "desc" ? bVal - aVal : aVal - bVal
    })
    return result
  }, [data, trendFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / ROWS_PER_PAGE))
  const paginatedData = filteredAndSorted.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)
  const showPagination = filteredAndSorted.length > ROWS_PER_PAGE

  // Reset page when filter changes
  function handleTrendFilterChange(v: string) {
    setTrendFilter(v as TrendFilter)
    setPage(0)
  }

  function handleSortChange(v: string) {
    setSortKey(v as SortKey)
    setPage(0)
  }

  function toggleSortDir() {
    setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    setPage(0)
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          Phân tích hiệu quả khách hàng
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-normal text-muted-foreground cursor-help">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[300px] text-xs">
                <p>% Xu hướng = ((Doanh thu kỳ cuối − TB các kỳ trước) / TB các kỳ trước) × 100</p>
                <p className="mt-1">Giảm: dưới -20% · Tăng: trên +20% · Ổn định: ±20%</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={trendFilter} onValueChange={handleTrendFilterChange}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="up">Tăng</SelectItem>
              <SelectItem value="stable">Ổn định</SelectItem>
              <SelectItem value="down">Giảm</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Doanh thu</SelectItem>
              <SelectItem value="orders">Số đơn</SelectItem>
              <SelectItem value="trend_pct">% Xu hướng</SelectItem>
              <SelectItem value="debt">Công nợ</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={toggleSortDir}>
            <ArrowUpDown className="size-4" />
            <span className="text-xs ml-1">{sortDir === "desc" ? "Giảm dần" : "Tăng dần"}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Chưa có dữ liệu</EmptyTitle>
              <EmptyDescription>
                Không có dữ liệu khách hàng phù hợp bộ lọc.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên khách hàng</TableHead>
                  <TableHead className="text-right">Tổng doanh thu</TableHead>
                  <TableHead className="text-right">Số đơn hàng</TableHead>
                  <TableHead className="text-right">Giá trị TB/đơn</TableHead>
                  <TableHead>Xu hướng</TableHead>
                  <TableHead className="text-right">Công nợ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((row) => (
                  <TableRow
                    key={row.customer_id}
                    className={row.trend === "down" ? "bg-red-50 dark:bg-red-950/20" : undefined}
                  >
                    <TableCell className="font-medium">{row.customer_name}</TableCell>
                    <TableCell className="text-right">{vndFormatter.format(row.total_revenue)}</TableCell>
                    <TableCell className="text-right">{row.total_orders.toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right">{vndFormatter.format(row.avg_order_value)}</TableCell>
                    <TableCell>
                      <TrendIndicator trend={row.trend} trendPct={row.trend_pct} />
                    </TableCell>
                    <TableCell className="text-right">{vndFormatter.format(row.outstanding_debt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {showPagination && (
              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Trang trước
                </Button>
                <span className="text-sm text-muted-foreground">
                  Trang {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Trang sau
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
