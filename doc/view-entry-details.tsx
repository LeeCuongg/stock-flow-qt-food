"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, Printer, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { formatVNDate } from "@/lib/utils"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

interface BatchDetail {
  batch_id: number
  supplier_name: string
  supplier_phone: string
  document_date: string
  note: string
  receipt_web_view_link?: string | null
  entries: Array<{
    id: number
    product_id: number
    product_name: string
    product_unit: string
    category_name: string
    quantity: number
    price_import: number
    subtotal: number
    note?: string
  }>
  costs: Array<{
    id: string
    amount: number
    note: string | null
    is_paid: boolean
    paid_at: string | null
    document_date: string | null
    category: { id: string; name: string } | null
  }>
  payments: Array<{
    id: number
    amount: number
    paid_at: string | null
    note: string | null
    method?: string | null
  }>
  summary: {
    merchandise_total: number
    costs_total: number
    grand_total: number
    payments_total: number
    remaining: number
    is_fully_paid: boolean
  }
}

interface ViewEntryDetailsProps {
  open: boolean
  onClose: () => void
  batchId: number | null
}

export function ViewEntryDetails({ open, onClose, batchId }: ViewEntryDetailsProps) {
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState<BatchDetail | null>(null)
  const [downloading, setDownloading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()


  useEffect(() => {
    if (open && batchId) {
      fetchDetails()
    } else {
      setDetails(null)
    }
  }, [open, batchId])

  const fetchDetails = async () => {
    if (!batchId) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/stock-entries/batch/${batchId}/details`)
      if (response.ok) {
        const data = await response.json()
        setDetails(data)
      } else {
        const error = await response.json()
        toast({
          title: "Lỗi",
          description: error.error || "Không thể tải chi tiết phiếu nhập",
          variant: "destructive",
        })
        onClose()
      }
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể kết nối với máy chủ",
        variant: "destructive",
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount)
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    if (!printRef.current || !details) {
      toast({
        title: "Lỗi",
        description: "Chưa có dữ liệu để tạo PDF",
        variant: "destructive",
      })
      return
    }
    
    setDownloading(true)
    
    try {
      const element = printRef.current
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const dialogContent = element.closest('.overflow-y-auto')
      const originalOverflow = dialogContent ? (dialogContent as HTMLElement).style.overflow : null
      const originalMaxHeight = dialogContent ? (dialogContent as HTMLElement).style.maxHeight : null
      const originalWidth = element.style.width
      const originalMaxWidth = element.style.maxWidth
      
      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = 'visible'
        dialogContent.style.maxHeight = 'none'
      }
      
      element.style.width = 'auto'
      element.style.maxWidth = 'none'
      element.style.minWidth = '640px'
      element.offsetHeight
      
      const elementWidth = element.offsetWidth
      const elementHeight = element.offsetHeight
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: elementWidth,
        height: elementHeight,
        windowWidth: elementWidth,
        windowHeight: elementHeight,
        onclone: (clonedDoc) => {
          const allStyles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]')
          allStyles.forEach(style => style.remove())
          
          const style = clonedDoc.createElement('style')
          style.textContent = `
            * { box-sizing: border-box; }
            .print\\:hidden { display: none !important; }
            .invoice-container { 
              width: 100%; 
              padding: 16px; 
              font-family: Arial, sans-serif;
              color: #000;
              background: #fff;
              max-width: 680px;
              margin: 0 auto;
            }
            table { width: 100%; border-collapse: collapse; }
            table, th, td { border: 1px solid #000; }
            th { background-color: #e5e7eb; font-weight: 600; padding: 8px 12px; text-align: center; }
            td { padding: 8px 12px; }
          `
          clonedDoc.head.appendChild(style)
        }
      })
      
      if (dialogContent instanceof HTMLElement) {
        dialogContent.style.overflow = originalOverflow || ''
        dialogContent.style.maxHeight = originalMaxHeight || ''
      }
      element.style.width = originalWidth || ''
      element.style.maxWidth = originalMaxWidth || ''
      
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error("Canvas rendering failed")
      }
      
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pdfWidth
      const imgHeight = (canvas.height * pdfWidth) / canvas.width
      
      let heightLeft = imgHeight
      let position = 0
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pdfHeight
      }
      
      const fileName = `phieu-nhap-${details.batch_id}-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}.pdf`
      pdf.save(fileName)
      
      toast({ title: "Thành công", description: "Đã tải xuống file PDF" })
    } catch (error: any) {
      toast({
        title: "Lỗi tạo PDF",
        description: error?.message || "Vui lòng thử dùng chức năng In thay thế.",
        variant: "destructive",
      })
    } finally {
      setDownloading(false)
    }
  }

  const isDateOnly = (dateStr: string) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr)

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return ""
    try {
      if (isDateOnly(dateStr)) return formatVNDate(dateStr)
      return new Date(dateStr).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    } catch {
      return dateStr
    }
  }

  if (!open) return null


  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-full">
        <DialogHeader className="print:hidden">
          <DialogTitle>Chi tiết phiếu nhập #{batchId}</DialogTitle>
          <DialogDescription>Xem chi tiết, in hoặc tải xuống phiếu nhập kho</DialogDescription>
          <div className="flex gap-2 mt-2">
            <Button onClick={handlePrint} size="sm" variant="outline" disabled={downloading}>
              <Printer className="mr-2 h-4 w-4" />
              In phiếu
            </Button>
            <Button onClick={handleDownloadPDF} size="sm" variant="outline" disabled={downloading}>
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang tạo PDF...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Tải PDF
                </>
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
            {/* Invoice Header */}
            <div className="invoice-header mb-6 pb-4 border-b-2 border-gray-300 print:border-black">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 print:text-3xl">PHIẾU NHẬP KHO</h1>
                  <p className="text-sm text-gray-600 mt-1">Mã phiếu: #{details.batch_id}</p>
                  <p className="text-sm text-gray-600">Ngày nhập: {formatDate(details.document_date)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">QT FRESH FOOD</p>
                  <p className="text-sm text-gray-600">Quản lý xuất nhập kho</p>
                </div>
              </div>
            </div>

            {/* Supplier Information */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2 text-gray-900">Thông tin nhà cung cấp</h2>
              <div className="bg-gray-50 print:bg-white p-4 rounded border print:border-gray-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Tên nhà cung cấp:</p>
                    <p className="font-medium">{details.supplier_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Số điện thoại:</p>
                    <p className="font-medium">{details.supplier_phone || "---"}</p>
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
                  {details.entries.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-gray-50 print:hover:bg-white">
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">{index + 1}</td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-left">
                        {entry.product_name}
                        <span className="text-gray-500 text-xs ml-1">({entry.product_unit})</span>
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                        {new Intl.NumberFormat("vi-VN").format(entry.quantity)}
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                        {formatCurrency(entry.price_import)}
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center font-medium">
                        {formatCurrency(entry.subtotal)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 print:bg-gray-100 font-semibold">
                    <td colSpan={4} className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                      Tổng tiền hàng:
                    </td>
                    <td className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                      {formatCurrency(details.summary.merchandise_total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>


            {/* Payment History */}
            {details.payments.length > 0 && (
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
                    {details.payments.map((payment, index) => (
                      <tr key={payment.id} className="hover:bg-gray-50 print:hover:bg-white">
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">{index + 1}</td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {formatDate(payment.paid_at)}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center">
                          {payment.method || "---"}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-left text-gray-600">
                          {payment.note || "---"}
                        </td>
                        <td className="border border-gray-300 print:border-black px-3 py-2 text-sm text-center font-medium">
                          {formatCurrency(payment.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 print:bg-gray-100 font-semibold">
                      <td colSpan={4} className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                        Tổng đã thanh toán:
                      </td>
                      <td className="border border-gray-300 print:border-black px-3 py-2 text-center text-sm">
                        {formatCurrency(details.summary.payments_total)}
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
                    <span className="text-sm font-medium">{formatCurrency(details.summary.merchandise_total)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-gray-300 print:border-black">
                    <span className="text-base font-bold">TỔNG CỘNG:</span>
                    <span className="text-base font-bold text-primary">
                      {formatCurrency(details.summary.merchandise_total)}
                    </span>
                  </div>
                  {details.summary.payments_total > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-sm font-medium">Đã thanh toán:</span>
                      <span className="text-sm font-medium text-green-600">
                        {formatCurrency(details.summary.payments_total)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t border-gray-300 print:border-black">
                    <span className="text-base font-bold">
                      {details.summary.remaining > 0 ? "CÒN NỢ:" : "TRẠNG THÁI:"}
                    </span>
                    <span className={`text-base font-bold ${details.summary.remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                      {details.summary.remaining > 0 ? formatCurrency(details.summary.remaining) : "Đã thanh toán đủ"}
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
              <p>In ngày: {new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Không có dữ liệu</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
