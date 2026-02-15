'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts'
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Package, ShoppingCart,
  ArrowDownCircle, ArrowUpCircle, HandCoins, Banknote,
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface Summary {
  revenue_total: number
  cost_total: number
  profit_total: number
  loss_total: number
}

interface DailySales { date: string; revenue: number; cost: number; profit: number }
interface DailyLoss { date: string; loss_cost: number }
interface TopProductSales { product_id: string; product_name: string; quantity_sold: number; revenue: number; profit: number }
interface TopProductLoss { product_id: string; product_name: string; quantity_lost: number; loss_cost: number }
interface ExpiringBatch { product_id: string; product_name: string; batch_code: string; expired_date: string; quantity_remaining: number }
interface ReceivableRow { customer_id: string | null; customer_name: string; total_receivable: number }
interface PayableRow { supplier_id: string | null; supplier_name: string; total_payable: number }

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

const DATE_PRESETS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7days', label: '7 ngày' },
  { value: '30days', label: '30 ngày' },
  { value: '90days', label: '90 ngày' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: '3months_ago', label: '3 tháng trước' },
  { value: 'last_year', label: 'Năm trước' },
  { value: 'custom', label: 'Tuỳ chọn' },
]

function getPresetDateRange(preset: string): { from: string; to: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const todayStr = fmt(today)
  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case '7days': {
      const d = new Date(today); d.setDate(d.getDate() - 6)
      return { from: fmt(d), to: todayStr }
    }
    case '30days': {
      const d = new Date(today); d.setDate(d.getDate() - 29)
      return { from: fmt(d), to: todayStr }
    }
    case '90days': {
      const d = new Date(today); d.setDate(d.getDate() - 89)
      return { from: fmt(d), to: todayStr }
    }
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case '3months_ago': {
      const first = new Date(today.getFullYear(), today.getMonth() - 3, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case 'last_year': {
      const first = new Date(today.getFullYear() - 1, 0, 1)
      const last = new Date(today.getFullYear() - 1, 11, 31)
      return { from: fmt(first), to: fmt(last) }
    }
    case 'all':
      return { from: '', to: '' }
    default:
      return { from: '', to: '' }
  }
}

function formatVN(n: number): string {
  return Number(n).toLocaleString('vi-VN')
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export default function DashboardPage() {
  const supabase = createClient()
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Date range
  const today = new Date()
  const [datePreset, setDatePreset] = useState('30days')
  const [startDate, setStartDate] = useState(formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)))
  const [endDate, setEndDate] = useState(formatDate(today))

  // Data
  const [summary, setSummary] = useState<Summary | null>(null)
  const [dailySales, setDailySales] = useState<DailySales[]>([])
  const [dailyLoss, setDailyLoss] = useState<DailyLoss[]>([])
  const [topSales, setTopSales] = useState<TopProductSales[]>([])
  const [topLoss, setTopLoss] = useState<TopProductLoss[]>([])
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([])
  const [receivables, setReceivables] = useState<ReceivableRow[]>([])
  const [payables, setPayables] = useState<PayableRow[]>([])
  const [cashIn, setCashIn] = useState(0)
  const [cashOut, setCashOut] = useState(0)
  const loadWarehouses = useCallback(async () => {
    const { data } = await supabase.from('warehouses').select('id, name').order('name')
    if (data && data.length > 0) {
      setWarehouses(data)
      if (!warehouseId) setWarehouseId(data[0].id)
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    if (!warehouseId) return
    setLoading(true)
    setError('')
    const qStart = startDate || '2000-01-01'
    const qEnd = endDate || '2099-12-31'
    try {
      const [summaryRes, salesRes, lossRes, topSalesRes, topLossRes, expiringRes, receivableRes, payableRes, paymentsInRes, paymentsOutRes] = await Promise.all([
        supabase.rpc('get_dashboard_summary', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_daily_sales_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_daily_loss_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_top_products_sales', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd, p_limit_n: 10 }),
        supabase.rpc('get_top_products_loss', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd, p_limit_n: 10 }),
        supabase.rpc('get_expiring_batches', { p_warehouse_id: warehouseId, p_days_threshold: 30 }),
        supabase.rpc('get_receivable_report', { p_warehouse_id: warehouseId }),
        supabase.rpc('get_payable_report', { p_warehouse_id: warehouseId }),
        supabase.from('payments').select('amount').eq('warehouse_id', warehouseId).eq('payment_type', 'IN').gte('created_at', `${qStart}T00:00:00`).lte('created_at', `${qEnd}T23:59:59`),
        supabase.from('payments').select('amount').eq('warehouse_id', warehouseId).eq('payment_type', 'OUT').gte('created_at', `${qStart}T00:00:00`).lte('created_at', `${qEnd}T23:59:59`),
      ])

      if (summaryRes.error) throw summaryRes.error
      if (salesRes.error) throw salesRes.error
      if (lossRes.error) throw lossRes.error
      if (topSalesRes.error) throw topSalesRes.error
      if (topLossRes.error) throw topLossRes.error
      if (expiringRes.error) throw expiringRes.error

      setSummary(summaryRes.data as Summary)
      setDailySales(salesRes.data as DailySales[])
      setDailyLoss(lossRes.data as DailyLoss[])
      setTopSales(topSalesRes.data as TopProductSales[])
      setTopLoss(topLossRes.data as TopProductLoss[])
      setExpiringBatches(expiringRes.data as ExpiringBatch[])
      setReceivables((receivableRes.data as ReceivableRow[]) || [])
      setPayables((payableRes.data as PayableRow[]) || [])
      setCashIn((paymentsInRes.data || []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0))
      setCashOut((paymentsOutRes.data || []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải dữ liệu'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [warehouseId, startDate, endDate])

  useEffect(() => { loadWarehouses() }, [loadWarehouses])
  useEffect(() => { if (warehouseId) loadDashboard() }, [warehouseId, loadDashboard])

  const getExpiryStatus = (expiryDate: string) => {
    const diffDays = Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'expired'
    if (diffDays <= 7) return 'critical'
    return 'warning'
  }

  const salesChartConfig = {
    revenue: { label: 'Doanh thu', color: 'hsl(142, 76%, 36%)' },
    profit: { label: 'Lợi nhuận', color: 'hsl(221, 83%, 53%)' },
  }

  const lossChartConfig = {
    loss_cost: { label: 'Thiệt hại', color: 'hsl(0, 84%, 60%)' },
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        {warehouses.length > 1 && (
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Kho</Label>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-background h-9"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              aria-label="Chọn kho"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Thời gian</Label>
          <Select value={datePreset} onValueChange={(val) => {
            setDatePreset(val)
            if (val !== 'custom') {
              const range = getPresetDateRange(val)
              setStartDate(range.from)
              setEndDate(range.to)
            }
          }}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {datePreset === 'custom' && (
          <div className="flex items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Từ ngày</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[150px] h-9" aria-label="Từ ngày" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Đến ngày</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[150px] h-9" aria-label="Đến ngày" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-1" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Doanh thu</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatVN(summary?.revenue_total || 0)}</div>
                <p className="text-xs text-muted-foreground">VND</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Giá vốn</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatVN(summary?.cost_total || 0)}</div>
                <p className="text-xs text-muted-foreground">VND</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Lợi nhuận</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${(summary?.profit_total || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {formatVN(summary?.profit_total || 0)}
                </div>
                <p className="text-xs text-muted-foreground">VND</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Hao hụt</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{formatVN(summary?.loss_total || 0)}</div>
                <p className="text-xs text-muted-foreground">VND</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Debt & Cash KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-1" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Phải thu</CardTitle>
                <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{formatVN(receivables.reduce((s, r) => s + Number(r.total_receivable), 0))}</div>
                <p className="text-xs text-muted-foreground">{receivables.length} khách hàng</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Phải trả</CardTitle>
                <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatVN(payables.reduce((s, r) => s + Number(r.total_payable), 0))}</div>
                <p className="text-xs text-muted-foreground">{payables.length} nhà cung cấp</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tiền thu</CardTitle>
                <HandCoins className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatVN(cashIn)}</div>
                <p className="text-xs text-muted-foreground">VND trong kỳ</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tiền chi</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{formatVN(cashOut)}</div>
                <p className="text-xs text-muted-foreground">VND trong kỳ</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue & Profit chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Doanh thu & Lợi nhuận theo ngày</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : dailySales.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu</p>
            ) : (
              <ChartContainer config={salesChartConfig} className="h-[250px] w-full">
                <BarChart data={dailySales} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="var(--color-profit)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Loss chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Hao hụt theo ngày</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : dailyLoss.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu</p>
            ) : (
              <ChartContainer config={lossChartConfig} className="h-[250px] w-full">
                <LineChart data={dailyLoss} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="loss_cost" stroke="var(--color-loss_cost)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top products tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top sales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" /> Top sản phẩm bán chạy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : topSales.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="text-right">SL bán</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className="text-right">Lợi nhuận</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSales.map((p) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="font-medium">{p.product_name}</TableCell>
                      <TableCell className="text-right">{formatVN(p.quantity_sold)}</TableCell>
                      <TableCell className="text-right">{formatVN(p.revenue)}</TableCell>
                      <TableCell className="text-right">
                        <span className={Number(p.profit) >= 0 ? 'text-green-600' : 'text-destructive'}>
                          {formatVN(p.profit)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top loss */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Top sản phẩm hao hụt
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : topLoss.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="text-right">SL hao hụt</TableHead>
                    <TableHead className="text-right">Thiệt hại</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topLoss.map((p) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="font-medium">{p.product_name}</TableCell>
                      <TableCell className="text-right">{formatVN(p.quantity_lost)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatVN(p.loss_cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expiring batches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" /> Cảnh báo hạn sử dụng (30 ngày tới)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : expiringBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Không có lô hàng nào sắp hết hạn</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Mã lô</TableHead>
                  <TableHead>Hạn sử dụng</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringBatches.map((b, i) => {
                  const status = getExpiryStatus(b.expired_date)
                  return (
                    <TableRow key={i} className={
                      status === 'expired' ? 'bg-destructive/5' :
                      status === 'critical' ? 'bg-destructive/5' :
                      'bg-yellow-50 dark:bg-yellow-950/20'
                    }>
                      <TableCell className="font-medium">{b.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{b.batch_code || '-'}</TableCell>
                      <TableCell>{new Date(b.expired_date).toLocaleDateString('vi-VN')}</TableCell>
                      <TableCell className="text-right">{formatVN(b.quantity_remaining)}</TableCell>
                      <TableCell>
                        {status === 'expired' ? (
                          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Hết hạn</Badge>
                        ) : status === 'critical' ? (
                          <Badge variant="destructive">Sắp hết hạn</Badge>
                        ) : (
                          <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Gần hạn</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
