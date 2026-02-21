'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  PieChart, Pie, Cell, ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts'
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Package, ShoppingCart,
  ArrowDownCircle, ArrowUpCircle, HandCoins, Banknote, Users, Warehouse,
  ReceiptText,
} from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

// ── Interfaces ──
interface Summary {
  revenue_total: number; cost_total: number; profit_total: number; loss_total: number
}
interface FinancialSummary {
  revenue: number; extra_charge: number; discount: number; cogs: number
  gross_profit: number; operating_expense: number; net_profit: number
}
interface DailySales { date: string; revenue: number; cost: number; profit: number }
interface DailyLoss { date: string; loss_cost: number }
interface TopProductSales { product_id: string; product_name: string; quantity_sold: number; revenue: number; profit: number }
interface TopProductLoss { product_id: string; product_name: string; quantity_lost: number; loss_cost: number }
interface ExpiringBatch { product_id: string; product_name: string; batch_code: string; expired_date: string; quantity_remaining: number }
interface ReceivableRow { customer_id: string | null; customer_name: string; total_receivable: number }
interface PayableRow { supplier_id: string | null; supplier_name: string; total_payable: number }
interface SalesByCategory { category_name: string; revenue: number; profit: number; quantity_sold: number }
interface TopCustomer { customer_id: string; customer_name: string; total_revenue: number; total_orders: number }
interface InventoryByCategory { category_name: string; total_quantity: number; total_value: number; product_count: number }
interface DailyStockIn { date: string; total_cost: number; item_count: number }
interface ExpenseByCategory { category_name: string; total_amount: number; record_count: number }
interface DailyExpense { date: string; total_amount: number }
interface DailyPayments { date: string; cash_in: number; cash_out: number }
interface ProductInventoryReport {
  product_id: string; product_name: string; category_name: string; unit: string
  qty_in: number; qty_sold: number; qty_lost: number; loss_pct: number
  current_cost_price: number; avg_cost_in: number; avg_sale_price: number; qty_remaining: number
}

// ── Helpers ──
function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
// Format tiền: luôn số nguyên (110.234)
function formatVN(n: number): string { return Math.round(Number(n)).toLocaleString('vi-VN') }
// Format số lượng: giữ lẻ nếu có (4,326 hoặc 0.5)
function formatQty(n: number): string {
  const v = Number(n)
  if (Number.isInteger(v)) return v.toLocaleString('vi-VN')
  return v.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}
function shortDate(dateStr: string): string {
  const d = new Date(dateStr); return `${d.getDate()}/${d.getMonth() + 1}`
}
function shortMoney(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) { const n = v / 1_000_000_000; return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}tỷ` }
  if (abs >= 1_000_000) { const n = v / 1_000_000; return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}tr` }
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return `${v}`
}

const COLORS = [
  'hsl(142, 76%, 36%)', 'hsl(221, 83%, 53%)', 'hsl(0, 84%, 60%)',
  'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(180, 60%, 45%)',
  'hsl(330, 70%, 55%)', 'hsl(60, 70%, 45%)', 'hsl(200, 70%, 50%)',
  'hsl(100, 60%, 40%)',
]

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
    case 'today': return { from: todayStr, to: todayStr }
    case '7days': { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: fmt(d), to: todayStr } }
    case '30days': { const d = new Date(today); d.setDate(d.getDate() - 29); return { from: fmt(d), to: todayStr } }
    case '90days': { const d = new Date(today); d.setDate(d.getDate() - 89); return { from: fmt(d), to: todayStr } }
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
    case 'all': return { from: '', to: '' }
    default: return { from: '', to: '' }
  }
}

export default function DashboardPage() {
  const supabase = createClient()
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = new Date()
  const [datePreset, setDatePreset] = useState('30days')
  const [startDate, setStartDate] = useState(formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)))
  const [endDate, setEndDate] = useState(formatDate(today))

  // ── Overview data ──
  const [summary, setSummary] = useState<Summary | null>(null)
  const [dailySales, setDailySales] = useState<DailySales[]>([])
  const [dailyLoss, setDailyLoss] = useState<DailyLoss[]>([])
  const [receivables, setReceivables] = useState<ReceivableRow[]>([])
  const [payables, setPayables] = useState<PayableRow[]>([])
  const [cashIn, setCashIn] = useState(0)
  const [cashOut, setCashOut] = useState(0)
  const [financial, setFinancial] = useState<FinancialSummary | null>(null)

  // ── Product data ──
  const [topSales, setTopSales] = useState<TopProductSales[]>([])
  const [topLoss, setTopLoss] = useState<TopProductLoss[]>([])
  const [salesByCategory, setSalesByCategory] = useState<SalesByCategory[]>([])
  const [productInventory, setProductInventory] = useState<ProductInventoryReport[]>([])

  // ── Customer data ──
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [dailyPayments, setDailyPayments] = useState<DailyPayments[]>([])

  // ── Warehouse data ──
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([])
  const [inventoryByCategory, setInventoryByCategory] = useState<InventoryByCategory[]>([])
  const [dailyStockIn, setDailyStockIn] = useState<DailyStockIn[]>([])

  // ── Expense data ──
  const [expenseByCategory, setExpenseByCategory] = useState<ExpenseByCategory[]>([])
  const [dailyExpense, setDailyExpense] = useState<DailyExpense[]>([])

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
      const [
        summaryRes, salesRes, lossRes, topSalesRes, topLossRes, expiringRes,
        receivableRes, payableRes, paymentsInRes, paymentsOutRes, financialRes,
        salesByCatRes, topCustRes, invByCatRes, dailyStockInRes,
        expByCatRes, dailyExpRes, dailyPayRes, productInvRes,
      ] = await Promise.all([
        supabase.rpc('get_dashboard_summary', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_daily_sales_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_daily_loss_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_top_products_sales', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd, p_limit_n: 10 }),
        supabase.rpc('get_top_products_loss', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd, p_limit_n: 10 }),
        supabase.rpc('get_expiring_batches', { p_warehouse_id: warehouseId, p_days_threshold: 30 }),
        supabase.rpc('get_receivable_report', { p_warehouse_id: warehouseId }),
        supabase.rpc('get_payable_report', { p_warehouse_id: warehouseId }),
        supabase.from('payments').select('amount').eq('warehouse_id', warehouseId).eq('payment_type', 'IN').eq('status', 'ACTIVE').gte('created_at', `${qStart}T00:00:00+07:00`).lte('created_at', `${qEnd}T23:59:59+07:00`),
        supabase.from('payments').select('amount').eq('warehouse_id', warehouseId).eq('payment_type', 'OUT').eq('status', 'ACTIVE').gte('created_at', `${qStart}T00:00:00+07:00`).lte('created_at', `${qEnd}T23:59:59+07:00`),
        supabase.rpc('get_financial_summary', { p_warehouse_id: warehouseId, p_date_from: qStart, p_date_to: qEnd }),
        // New RPCs
        supabase.rpc('get_sales_by_category', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_top_customers', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd, p_limit_n: 10 }),
        supabase.rpc('get_inventory_by_category', { p_warehouse_id: warehouseId }),
        supabase.rpc('get_daily_stock_in_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_expense_by_category', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_daily_expense_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_daily_payments_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
        supabase.rpc('get_product_inventory_report', { p_warehouse_id: warehouseId, p_start_date: qStart, p_end_date: qEnd }),
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
      setFinancial(financialRes.error ? null : (financialRes.data as FinancialSummary))
      setSalesByCategory((salesByCatRes.data as SalesByCategory[]) || [])
      setTopCustomers((topCustRes.data as TopCustomer[]) || [])
      setInventoryByCategory((invByCatRes.data as InventoryByCategory[]) || [])
      setDailyStockIn((dailyStockInRes.data as DailyStockIn[]) || [])
      setExpenseByCategory((expByCatRes.data as ExpenseByCategory[]) || [])
      setDailyExpense((dailyExpRes.data as DailyExpense[]) || [])
      setDailyPayments((dailyPayRes.data as DailyPayments[]) || [])
      setProductInventory((productInvRes.data as ProductInventoryReport[]) || [])
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
  const lossChartConfig = { loss_cost: { label: 'Thiệt hại', color: 'hsl(0, 84%, 60%)' } }
  const stockInChartConfig = { total_cost: { label: 'Giá trị nhập', color: 'hsl(38, 92%, 50%)' } }
  const expenseChartConfig = { total_amount: { label: 'Chi phí', color: 'hsl(0, 84%, 60%)' } }
  const cashFlowConfig = {
    cash_in: { label: 'Tiền thu', color: 'hsl(142, 76%, 36%)' },
    cash_out: { label: 'Tiền chi', color: 'hsl(0, 84%, 60%)' },
  }

  const SkeletonCard = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent><Skeleton className="h-8 w-32 mb-1" /><Skeleton className="h-3 w-16" /></CardContent>
    </Card>
  )

  const NoData = () => <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu</p>

  const totalReceivable = receivables.reduce((s, r) => s + Number(r.total_receivable), 0)
  const totalPayable = payables.reduce((s, r) => s + Number(r.total_payable), 0)

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        {warehouses.length > 1 && (
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Kho</Label>
            <select className="border rounded-md px-3 py-2 text-sm bg-background h-9" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} aria-label="Chọn kho">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Thời gian</Label>
          <Select value={datePreset} onValueChange={(val) => {
            setDatePreset(val)
            if (val !== 'custom') { const range = getPresetDateRange(val); setStartDate(range.from); setEndDate(range.to) }
          }}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
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
        <Card className="border-destructive"><CardContent className="pt-4"><p className="text-sm text-destructive">{error}</p></CardContent></Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="products">Sản phẩm</TabsTrigger>
          <TabsTrigger value="customers">Khách hàng</TabsTrigger>
          <TabsTrigger value="warehouse">Kho hàng</TabsTrigger>
          <TabsTrigger value="expenses">Chi phí</TabsTrigger>
        </TabsList>

        {/* ═══════════════ TAB 1: TỔNG QUAN ═══════════════ */}
        <TabsContent value="overview" className="space-y-4">
          {/* KPI Cards Row 1 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {loading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (<>
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
            </>)}
          </div>

          {/* KPI Cards Row 2: Debt & Cash */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {loading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (<>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Khách hàng nợ</CardTitle>
                  <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{formatVN(totalReceivable)}</div>
                  <p className="text-xs text-muted-foreground">{receivables.length} khách hàng</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Giá vốn nợ</CardTitle>
                  <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{formatVN(totalPayable)}</div>
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
            </>)}
          </div>

          {/* Financial Summary */}
          {!loading && financial && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Chi phí vận hành</CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{formatVN(financial.operating_expense)}</div>
                  <p className="text-xs text-muted-foreground">VND</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Lợi nhuận ròng</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${financial.net_profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {formatVN(financial.net_profit)}
                  </div>
                  <p className="text-xs text-muted-foreground">VND (sau chi phí)</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Revenue & Profit + Loss charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Doanh thu & Lợi nhuận theo ngày</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[250px] w-full" /> : dailySales.length === 0 ? <NoData /> : (
                  <ChartContainer config={salesChartConfig} className="h-[250px] w-full">
                    <BarChart data={dailySales} margin={{ top: 5, right: 5, bottom: 5, left: 5 }} maxBarSize={50}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={shortMoney} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" fill="var(--color-profit)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Hao hụt theo ngày</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[250px] w-full" /> : dailyLoss.length === 0 ? <NoData /> : (
                  <ChartContainer config={lossChartConfig} className="h-[250px] w-full">
                    <LineChart data={dailyLoss} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={shortMoney} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="loss_cost" stroke="var(--color-loss_cost)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Financial breakdown bar chart */}
          {!loading && financial && (
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Cơ cấu tài chính trong kỳ</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={{
                  value: { label: 'Giá trị', color: 'hsl(221, 83%, 53%)' },
                }} className="h-[250px] w-full">
                  <BarChart data={[
                    { name: 'Doanh thu', value: financial.revenue, fill: 'hsl(142, 76%, 36%)' },
                    { name: 'Phụ thu', value: financial.extra_charge, fill: 'hsl(38, 92%, 50%)' },
                    { name: 'Giảm giá', value: financial.discount, fill: 'hsl(280, 65%, 60%)' },
                    { name: 'Giá vốn', value: financial.cogs, fill: 'hsl(0, 84%, 60%)' },
                    { name: 'LN gộp', value: financial.gross_profit, fill: 'hsl(221, 83%, 53%)' },
                    { name: 'CP vận hành', value: financial.operating_expense, fill: 'hsl(330, 70%, 55%)' },
                    { name: 'LN ròng', value: financial.net_profit, fill: financial.net_profit >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)' },
                  ]} margin={{ top: 5, right: 5, bottom: 5, left: 5 }} maxBarSize={50}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={shortMoney} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {[0,1,2,3,4,5,6].map((i) => <Cell key={i} />)}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Top sản phẩm + Top khách hàng cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top sản phẩm theo doanh thu */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Top sản phẩm theo doanh thu</CardTitle></CardHeader>
              <CardContent>
                {loading ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : topSales.length === 0 ? <NoData /> : (
                  <div className="space-y-0">
                    {topSales.map((p, i) => (
                      <div key={p.product_id} className={`flex items-center justify-between px-3 py-2.5 rounded ${i % 2 === 0 ? 'bg-muted/50' : ''}`}>
                        <div>
                          <div className="font-medium text-sm">{p.product_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {salesByCategory.find(c => topSales.some(ts => ts.product_id === p.product_id) ) ? '' : ''}
                            Lợi nhuận: {formatVN(p.profit)} đ
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-green-600">{formatVN(p.revenue)} đ</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top khách hàng theo doanh thu */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Top khách hàng theo doanh thu</CardTitle></CardHeader>
              <CardContent>
                {loading ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : topCustomers.length === 0 ? <NoData /> : (
                  <div className="space-y-0">
                    {topCustomers.map((c, i) => {
                      const debt = receivables.find(r => r.customer_id === c.customer_id)
                      return (
                        <div key={c.customer_id || c.customer_name} className={`flex items-center justify-between px-3 py-2.5 rounded ${i % 2 === 0 ? 'bg-muted/50' : ''}`}>
                          <div>
                            <div className="font-medium text-sm">{c.customer_name}</div>
                            <div className="text-xs text-muted-foreground">{c.total_orders} đơn hàng</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-sm text-green-600">{formatVN(c.total_revenue)} đ</div>
                            {debt && Number(debt.total_receivable) > 0 && (
                              <div className="text-xs text-orange-600">Nợ: {formatVN(debt.total_receivable)} đ</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Thống kê theo từng sản phẩm */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Thống kê theo từng sản phẩm</CardTitle></CardHeader>
            <CardContent>
              {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : topSales.length === 0 ? <NoData /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead className="text-right">SL bán</TableHead>
                      <TableHead className="text-right">Giá vốn</TableHead>
                      <TableHead className="text-right">Doanh thu</TableHead>
                      <TableHead className="text-right">Lợi nhuận</TableHead>
                      <TableHead className="text-right">Tỷ lệ LN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSales.map((p) => {
                      const cost = Number(p.revenue) - Number(p.profit)
                      const marginPct = Number(p.revenue) > 0 ? (Number(p.profit) / Number(p.revenue) * 100).toFixed(1) : '0'
                      return (
                        <TableRow key={p.product_id}>
                          <TableCell className="font-medium">{p.product_name}</TableCell>
                          <TableCell className="text-right">{formatQty(p.quantity_sold)}</TableCell>
                          <TableCell className="text-right">{formatVN(cost)} đ</TableCell>
                          <TableCell className="text-right">{formatVN(p.revenue)} đ</TableCell>
                          <TableCell className="text-right">
                            <span className={Number(p.profit) >= 0 ? 'text-green-600' : 'text-destructive'}>{formatVN(p.profit)} đ</span>
                          </TableCell>
                          <TableCell className="text-right">{marginPct}%</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════ TAB 2: SẢN PHẨM ═══════════════ */}
        <TabsContent value="products" className="space-y-4">
          {/* Charts row: Revenue by category + Top sales */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Doanh thu theo danh mục</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : salesByCategory.length === 0 ? <NoData /> : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={salesByCategory} dataKey="revenue" nameKey="category_name" cx="50%" cy="50%" outerRadius={100}
                          label={({ category_name, percent }) => `${category_name} ${(percent * 100).toFixed(0)}%`}>
                          {salesByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" /> Top sản phẩm bán chạy
              </CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : topSales.length === 0 ? <NoData /> : (
                  <ChartContainer config={{
                    revenue: { label: 'Doanh thu', color: 'hsl(142, 76%, 36%)' },
                    profit: { label: 'Lợi nhuận', color: 'hsl(221, 83%, 53%)' },
                  }} className="h-[300px] w-full">
                    <BarChart data={topSales} layout="vertical" margin={{ top: 5, right: 5, bottom: 5, left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tickFormatter={shortMoney} />
                      <YAxis type="category" dataKey="product_name" className="text-xs" width={75} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="profit" fill="var(--color-profit)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Báo cáo tồn kho - Full inventory report table */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" /> Báo cáo tồn kho
            </CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : productInventory.length === 0 ? <NoData /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Sản phẩm</TableHead>
                        <TableHead className="whitespace-nowrap">Danh mục</TableHead>
                        <TableHead className="whitespace-nowrap">Đơn vị</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Nhập</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Xuất thực tế</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Hao hụt</TableHead>
                        <TableHead className="text-right whitespace-nowrap">% Hao hụt</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Giá nhập hiện tại</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Giá nhập TB</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Giá xuất TB</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Tồn kho</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productInventory.map((p) => (
                        <TableRow key={p.product_id}>
                          <TableCell className="font-medium whitespace-nowrap">{p.product_name}</TableCell>
                          <TableCell className="whitespace-nowrap">{p.category_name}</TableCell>
                          <TableCell>{p.unit}</TableCell>
                          <TableCell className="text-right">{formatQty(p.qty_in)}</TableCell>
                          <TableCell className="text-right">{formatQty(p.qty_sold)}</TableCell>
                          <TableCell className="text-right text-destructive">{formatQty(p.qty_lost)}</TableCell>
                          <TableCell className="text-right">
                            {Number(p.loss_pct) > 5 ? (
                              <span className="text-destructive font-medium">{p.loss_pct}%</span>
                            ) : Number(p.loss_pct) > 0 ? (
                              <span className="text-yellow-600">{p.loss_pct}%</span>
                            ) : (
                              <span>0%</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatVN(p.current_cost_price)}</TableCell>
                          <TableCell className="text-right">{formatVN(p.avg_cost_in)}</TableCell>
                          <TableCell className="text-right">{formatVN(p.avg_sale_price)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {Number(p.qty_remaining) <= 0 ? (
                              <span className="text-destructive">{formatQty(p.qty_remaining)}</span>
                            ) : (
                              formatQty(p.qty_remaining)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}

                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top loss chart + table */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Top sản phẩm hao hụt
              </CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : topLoss.length === 0 ? <NoData /> : (
                  <ChartContainer config={{
                    loss_cost: { label: 'Thiệt hại', color: 'hsl(0, 84%, 60%)' },
                  }} className="h-[300px] w-full">
                    <BarChart data={topLoss} layout="vertical" margin={{ top: 5, right: 5, bottom: 5, left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tickFormatter={shortMoney} />
                      <YAxis type="category" dataKey="product_name" className="text-xs" width={75} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="loss_cost" fill="var(--color-loss_cost)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Lợi nhuận theo danh mục</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : salesByCategory.length === 0 ? <NoData /> : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={salesByCategory.filter(c => c.profit > 0)} dataKey="profit" nameKey="category_name" cx="50%" cy="50%" outerRadius={100}
                          label={({ category_name, percent }) => `${category_name} ${(percent * 100).toFixed(0)}%`}>
                          {salesByCategory.filter(c => c.profit > 0).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════ TAB 3: KHÁCH HÀNG ═══════════════ */}
        <TabsContent value="customers" className="space-y-4">
          {/* KPI cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {loading ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />) : (<>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tổng công nợ phải thu</CardTitle>
                  <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">{formatVN(totalReceivable)}</div>
                  <p className="text-xs text-muted-foreground">{receivables.length} khách hàng còn nợ</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tiền thu trong kỳ</CardTitle>
                  <HandCoins className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatVN(cashIn)}</div>
                  <p className="text-xs text-muted-foreground">VND</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Số khách hàng mua</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{topCustomers.length}</div>
                  <p className="text-xs text-muted-foreground">trong kỳ</p>
                </CardContent>
              </Card>
            </>)}
          </div>

          {/* Top customers bar chart + Receivables pie chart */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Top khách hàng theo doanh thu
              </CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : topCustomers.length === 0 ? <NoData /> : (
                  <ChartContainer config={{
                    total_revenue: { label: 'Doanh thu', color: 'hsl(221, 83%, 53%)' },
                  }} className="h-[300px] w-full">
                    <BarChart data={topCustomers} layout="vertical" margin={{ top: 5, right: 5, bottom: 5, left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tickFormatter={shortMoney} />
                      <YAxis type="category" dataKey="customer_name" className="text-xs" width={75} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total_revenue" fill="var(--color-total_revenue)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Cơ cấu công nợ phải thu</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : receivables.length === 0 ? <NoData /> : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={receivables}
                          dataKey="total_receivable"
                          nameKey="customer_name"
                          cx="50%" cy="50%"
                          outerRadius={100}
                          label={({ customer_name, percent }) => `${customer_name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {receivables.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Daily cash in/out chart */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Tiền thu / chi theo ngày</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-[250px] w-full" /> : dailyPayments.length === 0 ? <NoData /> : (
                <ChartContainer config={cashFlowConfig} className="h-[250px] w-full">
                  <AreaChart data={dailyPayments} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={shortMoney} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="cash_in" stroke="var(--color-cash_in)" fill="var(--color-cash_in)" fillOpacity={0.2} strokeWidth={2} />
                    <Area type="monotone" dataKey="cash_out" stroke="var(--color-cash_out)" fill="var(--color-cash_out)" fillOpacity={0.2} strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Receivables & Payables tables */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Chi tiết công nợ phải thu</CardTitle></CardHeader>
              <CardContent>
                {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : receivables.length === 0 ? <NoData /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead className="text-right">Công nợ</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {receivables.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.customer_name}</TableCell>
                          <TableCell className="text-right text-orange-600">{formatVN(r.total_receivable)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Chi tiết công nợ phải trả</CardTitle></CardHeader>
              <CardContent>
                {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : payables.length === 0 ? <NoData /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nhà cung cấp</TableHead>
                      <TableHead className="text-right">Công nợ</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {payables.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.supplier_name}</TableCell>
                          <TableCell className="text-right text-red-600">{formatVN(r.total_payable)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════ TAB 4: KHO HÀNG ═══════════════ */}
        <TabsContent value="warehouse" className="space-y-4">
          {/* KPI cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {loading ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />) : (<>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tổng giá trị tồn kho</CardTitle>
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatVN(inventoryByCategory.reduce((s, c) => s + Number(c.total_value), 0))}</div>
                  <p className="text-xs text-muted-foreground">VND</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Số sản phẩm trong kho</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{inventoryByCategory.reduce((s, c) => s + Number(c.product_count), 0)}</div>
                  <p className="text-xs text-muted-foreground">sản phẩm</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Lô sắp hết hạn</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{expiringBatches.length}</div>
                  <p className="text-xs text-muted-foreground">trong 30 ngày tới</p>
                </CardContent>
              </Card>
            </>)}
          </div>

          {/* Inventory by category pie + Daily stock-in chart */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Giá trị tồn kho theo danh mục</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : inventoryByCategory.length === 0 ? <NoData /> : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={inventoryByCategory}
                          dataKey="total_value"
                          nameKey="category_name"
                          cx="50%" cy="50%"
                          outerRadius={100}
                          label={({ category_name, percent }) => `${category_name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {inventoryByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Nhập kho theo ngày</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : dailyStockIn.length === 0 ? <NoData /> : (
                  <ChartContainer config={stockInChartConfig} className="h-[300px] w-full">
                    <BarChart data={dailyStockIn} margin={{ top: 5, right: 5, bottom: 5, left: 5 }} maxBarSize={50}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={shortMoney} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total_cost" fill="var(--color-total_cost)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Inventory table by category */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Tồn kho chi tiết theo danh mục</CardTitle></CardHeader>
            <CardContent>
              {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : inventoryByCategory.length === 0 ? <NoData /> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-right">Số SP</TableHead>
                    <TableHead className="text-right">Tổng SL</TableHead>
                    <TableHead className="text-right">Giá trị</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {inventoryByCategory.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.category_name}</TableCell>
                        <TableCell className="text-right">{c.product_count}</TableCell>
                        <TableCell className="text-right">{formatQty(c.total_quantity)}</TableCell>
                        <TableCell className="text-right">{formatVN(c.total_value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Expiring batches */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" /> Cảnh báo hạn sử dụng (30 ngày tới)
            </CardTitle></CardHeader>
            <CardContent>
              {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : expiringBatches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Không có lô hàng nào sắp hết hạn</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Mã lô</TableHead>
                    <TableHead>Hạn sử dụng</TableHead>
                    <TableHead className="text-right">Tồn kho</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow></TableHeader>
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
                          <TableCell className="text-right">{formatQty(b.quantity_remaining)}</TableCell>
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
        </TabsContent>

        {/* ═══════════════ TAB 5: CHI PHÍ ═══════════════ */}
        <TabsContent value="expenses" className="space-y-4">
          {/* KPI cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {loading ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />) : (<>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tổng chi phí vận hành</CardTitle>
                  <ReceiptText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{formatVN(financial?.operating_expense || 0)}</div>
                  <p className="text-xs text-muted-foreground">VND trong kỳ</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tổng tiền chi</CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{formatVN(cashOut)}</div>
                  <p className="text-xs text-muted-foreground">VND (thanh toán NCC + chi phí)</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Lợi nhuận ròng</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${(financial?.net_profit || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {formatVN(financial?.net_profit || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">VND (sau chi phí)</p>
                </CardContent>
              </Card>
            </>)}
          </div>

          {/* Expense by category pie + Daily expense line chart */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Chi phí theo danh mục</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : expenseByCategory.length === 0 ? <NoData /> : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseByCategory}
                          dataKey="total_amount"
                          nameKey="category_name"
                          cx="50%" cy="50%"
                          outerRadius={100}
                          label={({ category_name, percent }) => `${category_name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {expenseByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Chi phí vận hành theo ngày</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[300px] w-full" /> : dailyExpense.length === 0 ? <NoData /> : (
                  <ChartContainer config={expenseChartConfig} className="h-[300px] w-full">
                    <LineChart data={dailyExpense} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={shortMoney} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="total_amount" stroke="var(--color-total_amount)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Revenue vs Expense comparison area chart */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">So sánh Doanh thu vs Chi phí theo ngày</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-[250px] w-full" /> : (dailySales.length === 0 && dailyExpense.length === 0) ? <NoData /> : (
                <ChartContainer config={{
                  revenue: { label: 'Doanh thu', color: 'hsl(142, 76%, 36%)' },
                  expense: { label: 'Chi phí', color: 'hsl(0, 84%, 60%)' },
                }} className="h-[250px] w-full">
                  <AreaChart
                    data={dailySales.map((s, i) => ({
                      date: s.date,
                      revenue: s.revenue,
                      expense: dailyExpense[i]?.total_amount || 0,
                    }))}
                    margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={shortDate} className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={shortMoney} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="expense" stroke="var(--color-expense)" fill="var(--color-expense)" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Expense detail table */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Chi tiết chi phí theo danh mục</CardTitle></CardHeader>
            <CardContent>
              {loading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : expenseByCategory.length === 0 ? <NoData /> : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-right">Số giao dịch</TableHead>
                    <TableHead className="text-right">Tổng chi phí</TableHead>
                    <TableHead className="text-right">Tỷ trọng</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(() => {
                      const totalExp = expenseByCategory.reduce((s, c) => s + Number(c.total_amount), 0)
                      return expenseByCategory.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{c.category_name}</TableCell>
                          <TableCell className="text-right">{c.record_count}</TableCell>
                          <TableCell className="text-right text-destructive">{formatVN(c.total_amount)}</TableCell>
                          <TableCell className="text-right">{totalExp > 0 ? `${((Number(c.total_amount) / totalExp) * 100).toFixed(1)}%` : '0%'}</TableCell>
                        </TableRow>
                      ))
                    })()}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
