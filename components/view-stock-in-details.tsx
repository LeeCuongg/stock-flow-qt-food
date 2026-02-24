"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, Printer, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"
import { vnToday } from "@/lib/utils"

interface StockInBatchDetail {
  id: string
  supplier_name: string | null
  supplier_id: string | null
  note: string | null
  total_amount: number
  amount_paid: number
  payment_status: string
  status: string
  created_at: string
  stock_in_items: Array<{
    quantity: number
    cost_price: number
    total_price: number
    batch_code: string | null
    expired_date: string | null
    note: string | null
    products: { name: string; unit: string } | null
  }>
  suppliers: { phone: string | null } | null
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

interface ViewStockInDetailsProps {
  open: boolean
  onClose: () => void
  stockInId: string | null
}

export function ViewStockInDetails({ open, onClose, stockInId }: ViewStockInDetailsProps) {
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState<StockInBatchDetail | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [downloading, setDownloading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open && stockInId) {
      fetchDetails()
    } else {
      setDetails(null)
      setPayments([])
    }
  }, [open, stockInId])

  const fetchDetails = async () => {
    if (!stockInId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('stock_in')
        .select('id, supplier_name, supplier_id, note, total_amount, amount_paid, payment_status, status, created_at, stock_in_items(quantity, cost_price, total_price, batch_code, expired_date, note, products(name, unit)), suppliers(phone)')
        .eq('id', stockInId)
        .single()
      if (error) throw error
      setDetails(data as unknown as StockInBatchDetail)

      // Load payments
      const { data: payData } = await supabase
        .from('payments')
        .select('id, amount, payment_method, note, created_at, status, void_reason')
        .eq('source_type', 'STOCK_IN')
        .eq('source_id', stockInId)
        .order('created_at', { ascending: true })
      setPayments((payData as unknown as Payment[]) || [])
    } catch {
      toast.error("Không thể tải chi tiết phiếu nhập")
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
    try {
      return new Date(dateStr).toLocaleDateString("vi-VN")
    } catch {
      return dateStr
    }
  }

  const fmtDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("vi-VN")
    } catch {
      return dateStr
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
      await new Promise(resolve => setTimeout(resolve, 100))

      const dialogContent = element.closest('.overflow-y-auto')
      const origOverflow = dialogContent ? (dialogContent as HTMLElement).style.overflow : null
      const origMaxH = dialogContent ? (dialogContent as HTMLElement).style.maxHeight : null

      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = 'visible'
        dialogContent.style.maxHeight = 'none'
      }

      element.style.width = 'auto'
      element.style.maxWidth = 'none'
      element.style.minWidth = '640px'
      element.offsetHeight // force reflow

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: element.offsetWidth,
        height: element.offsetHeight,
        windowWidth: element.offsetWidth,
        windowHeight: element.offsetHeight,
        onclone: (clonedDoc: Document) => {
          clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((s: Element) => s.remove())
          const style = clonedDoc.createElement('style')
          style.textContent = `
            * { box-sizing: border-box; }
            .print\\:hidden { display: none !important; }
            .invoice-container { width: 100%; padding: 16px; font-family: Arial, sans-serif; color: #000; background: #fff; max-width: 680px; margin: 0 auto; }
            table { width: 100%; border-collapse: collapse; }
            table, th, td { border: 1px solid #000; }
            th { background-color: #e5e7eb; font-weight: 600; padding: 8px 12px; text-align: center; }
            td { padding: 8px 12px; }
          `
          clonedDoc.head.appendChild(style)
        }
      })

      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = origOverflow || ''
        dialogContent.style.maxHeight = origMaxH || ''
      }
      element.style.width = ''
      element.style.maxWidth = ''

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgW = pdfW
      const imgH = (canvas.height * pdfW) / canvas.width

      let heightLeft = imgH
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH)
      heightLeft -= pdfH
      while (heightLeft > 0) {
        position = heightLeft - imgH
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH)
        heightLeft -= pdfH
      }

      pdf.save(`phieu-nhap-${details.id.slice(0, 8)}-${vnToday()}.pdf`)
      toast.success("Đã tải xuống file PDF")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tạo PDF, thử dùng In thay thế.")
    } finally {
      setDownloading(false)
    }
  }

  if (!open) return null

  const merchandiseTotal = details ? details.stock_in_items.reduce((s, i) => s + Number(i.total_price), 0) : 0
  const paymentsTotal = payments.filter(p => p.status !== 'VOIDED').reduce((s, p) => s + Number(p.amount), 0)
  const remaining = details ? Number(details.total_amount) - paymentsTotal : 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-full">
        <DialogHeader className="print:hidden">
          <DialogTitle>Chi tiết phiếu nhập #{stockInId?.slice(0, 8)}</DialogTitle>
          <DialogDescription>Xem chi tiết, in hoặc tải xuống phiếu nhập kho</DialogDescription>
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
                  <h1 className="text-2xl font-bold text-gray-900 print:text-3xl">PHIẾU NHẬP KHO</h1>
                  <p className="text-sm text-gray-600 mt-1">Mã phiếu: #{details.id.slice(0, 8)}</p>
                  <p className="text-sm text-gray-600">Ngày nhập: {fmtDate(details.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">QT FRESH FOOD</p>
                  <p className="text-sm text-gray-600">Quản lý xuất nhập kho</p>
                </div>
              </div>
            </div>

            {/* Supplier Info */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2 text-gray-900">Thông tin nhà cung cấp</h2>
              <div className="bg-gray-50 print:bg-white p-4 rounded border print:border-gray-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Tên nhà cung cấp:</p>
                    <p className="font-medium">{details.supplier_name || "---"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Số điện thoại:</p>
                    <p className="font-medium">{details.suppliers?.phone || "---"}</p>
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
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Số lượng</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold whitespace-nowrap">Đơn giá</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold whitespace-nowrap">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {details.stock_in_items.map((entry, index) => (
                    <tr key={index} className="hover:bg-gray-50 print:hover:bg-white">
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">{index + 1}</td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-left">
                        {entry.products?.name || "-"}
                        <span className="text-gray-500 text-xs ml-1">({entry.products?.unit})</span>
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                        {new Intl.NumberFormat("vi-VN").format(entry.quantity)}
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                        {fmt(entry.cost_price)}
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center font-medium">
                        {fmt(entry.total_price)}
                      </td>
                    </tr>
                  ))}
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
              <div className="flex justify-end">
                <div className="w-full max-w-md space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm font-medium">Tổng tiền hàng:</span>
                    <span className="text-sm font-medium">{fmtVND(merchandiseTotal)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-gray-300 print:border-black">
                    <span className="text-base font-bold">TỔNG CỘNG:</span>
                    <span className="text-base font-bold text-primary">{fmtVND(Number(details.total_amount))}</span>
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

            {/* Print timestamp */}
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
