"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, Printer, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

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
        .select('id, customer_name, customer_id, note, total_revenue, total_cost_estimated, profit, amount_paid, payment_status, status, created_at, sales_items(quantity, sale_price, cost_price, total_price, products(name, unit), inventory_batches(batch_code, expiry_date)), customers(phone)')
        .eq('id', saleId)
        .single()
      if (error) throw error
      setDetails(data as unknown as SaleBatchDetail)

      const { data: payData } = await supabase
        .from('sale_payments')
        .select('id, amount, payment_method, note, created_at')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: true })
      setPayments(payData || [])
    } catch {
      toast.error("Không thể tải chi tiết đơn xuất")
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const fmt = (amount: number) =>
    new Intl.NumberFormat("vi-VN").format(amount) + " đ"

  const fmtDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString("vi-VN") } catch { return dateStr }
  }

  const fmtDateTime = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleString("vi-VN") } catch { return dateStr }
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
      element.offsetHeight

      const canvas = await html2canvas(element, {
        scale: 2, useCORS: true, allowTaint: true, logging: false, backgroundColor: '#ffffff',
        width: element.offsetWidth, height: element.offsetHeight,
        windowWidth: element.offsetWidth, windowHeight: element.offsetHeight,
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

      pdf.save(`phieu-xuat-${details.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`)
      toast.success("Đã tải xuống file PDF")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tạo PDF, thử dùng In thay thế.")
    } finally {
      setDownloading(false)
    }
  }

  if (!open) return null

  const merchandiseTotal = details ? details.sales_items.reduce((s, i) => s + Number(i.total_price), 0) : 0
  const paymentsTotal = payments.reduce((s, p) => s + Number(p.amount), 0)
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
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Số lượng</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Đơn giá</th>
                    <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {details.sales_items.map((entry, index) => (
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
                        {fmt(entry.sale_price)}
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
                      <th className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm font-semibold">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment, index) => (
                      <tr key={payment.id} className="hover:bg-gray-50 print:hover:bg-white">
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">{index + 1}</td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {fmtDateTime(payment.created_at)}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {payment.payment_method || "---"}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-left text-gray-600">
                          {payment.note || "---"}
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
                    <span className="text-sm font-medium">{fmt(merchandiseTotal)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-gray-300 print:border-black">
                    <span className="text-base font-bold">TỔNG CỘNG:</span>
                    <span className="text-base font-bold text-primary">{fmt(Number(details.total_revenue))}</span>
                  </div>
                  {paymentsTotal > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm font-medium">Đã thanh toán:</span>
                      <span className="text-sm font-medium text-green-600">{fmt(paymentsTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t border-gray-300 print:border-black">
                    <span className="text-base font-bold">
                      {remaining > 0 ? "CÒN NỢ:" : "TRẠNG THÁI:"}
                    </span>
                    <span className={`text-base font-bold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                      {remaining > 0 ? fmt(remaining) : "Đã thanh toán đủ"}
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
