"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, Printer, Loader2, Copy, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import jsPDF from "jspdf"
import { toPng } from "html-to-image"
import { vnToday } from "@/lib/utils"

interface SaleBatchDetail {
  id: string
  customer_name: string | null
  customer_id: string | null
  note: string | null
  total_revenue: number
  total_cost_estimated: number
  profit: number
  amount_paid: number
  payment_status: string
  status: string
  created_at: string
  sales_items: Array<{
    quantity: number
    sale_price: number
    cost_price: number
    total_price: number
    note: string | null
    products: { name: string; unit: string } | null
    inventory_batches: { batch_code: string | null; expiry_date: string | null } | null
  }>
  customers: { phone: string | null } | null
}

interface Payment {
  id: string
  amount: number
  payment_method: string | null
  note: string | null
  created_at: string
  status: string
  void_reason: string | null
}

interface ViewSaleDetailsProps {
  open: boolean
  onClose: () => void
  saleId: string | null
}

export function ViewSaleDetails({ open, onClose, saleId }: ViewSaleDetailsProps) {
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState<SaleBatchDetail | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [downloading, setDownloading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open && saleId) {
      fetchDetails()
    } else {
      setDetails(null)
      setPayments([])
    }
  }, [open, saleId])

  const fetchDetails = async () => {
    if (!saleId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id, customer_name, customer_id, note, total_revenue, total_cost_estimated, profit, amount_paid, payment_status, status, created_at, sales_items(quantity, sale_price, cost_price, total_price, note, products(name, unit), inventory_batches(batch_code, expiry_date)), customers(phone)')
        .eq('id', saleId)
        .single()
      if (error) throw error
      setDetails(data as unknown as SaleBatchDetail)

      const { data: payData } = await supabase
        .from('payments')
        .select('id, amount, payment_method, note, created_at, status, void_reason')
        .eq('source_type', 'SALE')
        .eq('source_id', saleId)
        .order('created_at', { ascending: true })
      setPayments((payData as unknown as Payment[]) || [])
    } catch {
      toast.error("Không thể tải chi tiết đơn xuất")
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const fmt = (amount: number) =>
    new Intl.NumberFormat("vi-VN").format(amount)

  const fmtVND = (amount: number) =>
    new Intl.NumberFormat("vi-VN").format(amount) + " VNĐ"

  const fmtDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString("vi-VN") } catch { return dateStr }
  }

  const fmtDateTime = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleString("vi-VN") } catch { return dateStr }
  }

  const handleCopyImage = async () => {
    if (!printRef.current || !details) {
      toast.error("Chưa có dữ liệu để copy")
      return
    }
    setCopying(true)
    try {
      const element = printRef.current

      const dialogContent = element.closest('.overflow-y-auto')
      const origOverflow = dialogContent ? (dialogContent as HTMLElement).style.overflow : null
      const origMaxH = dialogContent ? (dialogContent as HTMLElement).style.maxHeight : null

      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = 'visible'
        dialogContent.style.maxHeight = 'none'
      }

      // Add padding for nicer image output
      const origPadding = element.style.padding
      const origFont = element.style.fontFamily
      element.style.padding = '24px'
      element.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      element.offsetHeight

      const dataUrl = await toPng(element, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      })

      element.style.padding = origPadding
      element.style.fontFamily = origFont
      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = origOverflow || ''
        dialogContent.style.maxHeight = origMaxH || ''
      }

      const res = await fetch(dataUrl)
      const blob = await res.blob()

      // Try clipboard first (desktop), fallback to share/download (mobile)
      let copied = false
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          copied = true
        } catch { /* clipboard not supported, fallback below */ }
      }

      if (!copied && navigator.share) {
        const file = new File([blob], 'hoa-don.png', { type: 'image/png' })
        await navigator.share({ files: [file] })
        setCopied(true)
        toast.success("Đã mở chia sẻ ảnh hoá đơn")
        setTimeout(() => setCopied(false), 2000)
      } else if (!copied) {
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `phieu-xuat-${details.id.slice(0, 8)}.png`
        link.click()
        setCopied(true)
        toast.success("Đã tải ảnh hoá đơn")
        setTimeout(() => setCopied(false), 2000)
      } else {
        setCopied(true)
        toast.success("Đã copy ảnh hoá đơn vào clipboard")
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Không thể copy ảnh. Trình duyệt có thể không hỗ trợ.")
    } finally {
      setCopying(false)
    }
  }

  const handlePrint = () => window.print()

  const handleDownloadPDF = async () => {
    if (!printRef.current || !details) {
      toast.error("Chưa có dữ liệu để tạo PDF")
      return
    }
    setDownloading(true)
    try {
      const element = printRef.current

      const dialogContent = element.closest('.overflow-y-auto')
      const origOverflow = dialogContent ? (dialogContent as HTMLElement).style.overflow : null
      const origMaxH = dialogContent ? (dialogContent as HTMLElement).style.maxHeight : null

      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = 'visible'
        dialogContent.style.maxHeight = 'none'
      }

      const origPadding = element.style.padding
      const origFont = element.style.fontFamily
      element.style.padding = '24px'
      element.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      element.offsetHeight

      const dataUrl = await toPng(element, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      })

      element.style.padding = origPadding
      element.style.fontFamily = origFont
      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = origOverflow || ''
        dialogContent.style.maxHeight = origMaxH || ''
      }

      const img = new Image()
      img.src = dataUrl
      await new Promise((resolve) => { img.onload = resolve })

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgW = pdfW
      const imgH = (img.height * pdfW) / img.width

      let heightLeft = imgH
      let position = 0
      pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH)
      heightLeft -= pdfH
      while (heightLeft > 0) {
        position = heightLeft - imgH
        pdf.addPage()
        pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH)
        heightLeft -= pdfH
      }

      pdf.save(`phieu-xuat-${details.id.slice(0, 8)}-${vnToday()}.pdf`)
      toast.success("Đã tải xuống file PDF")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tạo PDF, thử dùng In thay thế.")
    } finally {
      setDownloading(false)
    }
  }

  if (!open) return null

  const merchandiseTotal = details ? details.sales_items.reduce((s, i) => s + Number(i.total_price), 0) : 0
  const paymentsTotal = payments.filter(p => p.status !== 'VOIDED').reduce((s, p) => s + Number(p.amount), 0)
  const remaining = details ? Number(details.total_revenue) - paymentsTotal : 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-full">
        <DialogHeader className="print:hidden">
          <DialogTitle>Chi tiết đơn xuất #{saleId?.slice(0, 8)}</DialogTitle>
          <DialogDescription>Xem chi tiết, in hoặc tải xuống phiếu xuất kho</DialogDescription>
          <div className="flex gap-2 mt-2">
            <Button onClick={handlePrint} size="sm" variant="outline" disabled={downloading}>
              <Printer className="mr-2 h-4 w-4" /> In phiếu
            </Button>
            <Button onClick={handleDownloadPDF} size="sm" variant="outline" disabled={downloading}>
              {downloading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tạo PDF...</>
              ) : (
                <><Download className="mr-2 h-4 w-4" /> Tải PDF</>
              )}
            </Button>
            <Button onClick={handleCopyImage} size="sm" variant="outline" disabled={copying || downloading}>
              {copying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang copy...</>
              ) : copied ? (
                <><Check className="mr-2 h-4 w-4 text-green-600" /> Đã copy</>
              ) : (
                <><Copy className="mr-2 h-4 w-4" /> Copy ảnh</>
              )}
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : details ? (
          <div ref={printRef} className="invoice-container">
            {/* Header */}
            <div className="mb-6 pb-4 border-b-2 border-gray-300 print:border-black">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 print:text-3xl">PHIẾU XUẤT KHO</h1>
                  <p className="text-sm text-gray-600 mt-1">Mã phiếu: #{details.id.slice(0, 8)}</p>
                  <p className="text-sm text-gray-600">Ngày xuất: {fmtDate(details.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">QT FRESH FOOD</p>
                  <p className="text-sm text-gray-600">Quản lý xuất nhập kho</p>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2 text-gray-900">Thông tin khách hàng</h2>
              <div className="bg-gray-50 print:bg-white p-4 rounded border print:border-gray-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Tên khách hàng:</p>
                    <p className="font-medium">{details.customer_name || "---"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Số điện thoại:</p>
                    <p className="font-medium">{details.customers?.phone || "---"}</p>
                  </div>
                </div>
                {details.note && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600">Ghi chú:</p>
                    <p className="text-sm">{details.note}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Products Table */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2 text-gray-900">Danh sách sản phẩm</h2>
              <table className="w-full border-collapse border border-gray-300 print:border-black">
                <thead>
                  <tr className="bg-gray-100 print:bg-gray-200">
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">STT</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Sản phẩm</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">SL</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold whitespace-nowrap">Đơn giá</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold whitespace-nowrap">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group items by product name + unit + sale_price + note
                    const grouped: { name: string; unit: string; sale_price: number; quantity: number; total_price: number; note: string | null }[] = []
                    details.sales_items.forEach((entry) => {
                      const key = `${entry.products?.name}|${entry.products?.unit}|${entry.sale_price}|${entry.note || ''}`
                      const existing = grouped.find(g => `${g.name}|${g.unit}|${g.sale_price}|${g.note || ''}` === key)
                      if (existing) {
                        existing.quantity += Number(entry.quantity)
                        existing.total_price += Number(entry.total_price)
                      } else {
                        grouped.push({
                          name: entry.products?.name || "-",
                          unit: entry.products?.unit || "",
                          sale_price: entry.sale_price,
                          quantity: Number(entry.quantity),
                          total_price: Number(entry.total_price),
                          note: entry.note || null,
                        })
                      }
                    })
                    return grouped.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 print:hover:bg-white">
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">{index + 1}</td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-left">
                          {row.name}
                          <span className="text-gray-500 text-xs ml-1">({row.unit})</span>
                          {row.note && (
                            <div className="text-gray-500 text-xs mt-0.5 italic">{row.note}</div>
                          )}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {new Intl.NumberFormat("vi-VN").format(row.quantity)}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {fmt(row.sale_price)}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center font-medium">
                          {fmt(row.total_price)}
                        </td>
                      </tr>
                    ))
                  })()}
                  <tr className="bg-gray-50 print:bg-gray-100 font-semibold">
                    <td colSpan={4} className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                      Tổng tiền hàng:
                    </td>
                    <td className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                      {fmt(merchandiseTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Payment History */}
            {payments.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2 text-gray-900">Lịch sử thanh toán</h2>
                <table className="w-full border-collapse border border-gray-300 print:border-black">
                  <thead>
                    <tr className="bg-gray-100 print:bg-gray-200">
                      <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">STT</th>
                      <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Ngày thanh toán</th>
                      <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Phương thức</th>
                      <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Ghi chú</th>
                      <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold whitespace-nowrap">Số tiền (VNĐ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment, index) => (
                      <tr key={payment.id} className={`hover:bg-gray-50 print:hover:bg-white ${payment.status === 'VOIDED' ? 'opacity-50 line-through' : ''}`}>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">{index + 1}</td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {fmtDateTime(payment.created_at)}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {payment.payment_method || "---"}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-left text-gray-600">
                          {payment.status === 'VOIDED' ? `[Đã huỷ] ${payment.void_reason || ''}` : (payment.note || "---")}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center font-medium">
                          {fmt(payment.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 print:bg-gray-100 font-semibold">
                      <td colSpan={4} className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                        Tổng đã thanh toán:
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                        {fmt(paymentsTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary */}
            <div className="border-t-2 border-gray-300 print:border-black pt-4">
              <div className="w-full space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm font-medium">Tổng tiền hàng:</span>
                    <span className="text-sm font-medium">{fmtVND(merchandiseTotal)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-gray-300 print:border-black">
                    <span className="text-base font-bold">TỔNG CỘNG:</span>
                    <span className="text-base font-bold text-primary">{fmtVND(Number(details.total_revenue))}</span>
                  </div>
                  {paymentsTotal > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm font-medium">Đã thanh toán:</span>
                      <span className="text-sm font-medium text-green-600">{fmtVND(paymentsTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t border-gray-300 print:border-black">
                    <span className="text-base font-bold">
                      {remaining > 0 ? "CÒN NỢ:" : "TRẠNG THÁI:"}
                    </span>
                    <span className={`text-base font-bold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                      {remaining > 0 ? fmtVND(remaining) : "Đã thanh toán đủ"}
                    </span>
                  </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-300 print:border-black">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <p className="font-semibold mb-12">Người giao hàng</p>
                  <p className="text-sm text-gray-600">(Ký, ghi rõ họ tên)</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold mb-12">Người nhận hàng</p>
                  <p className="text-sm text-gray-600">(Ký, ghi rõ họ tên)</p>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-gray-500 print:block hidden">
              <p>In ngày: {new Date().toLocaleString("vi-VN")}</p>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Không có dữ liệu</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
