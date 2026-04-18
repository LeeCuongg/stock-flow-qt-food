import * as XLSX from 'xlsx'

// ============ Interfaces ============

export interface ExportItem {
  product_id: string
  product_name: string
  quantity: number
  price: number // sale_price or unit_price
}

export interface ExportRecord {
  created_at: string
  customer_name?: string | null
  supplier_name?: string | null
  customer_id?: string | null
  supplier_id?: string | null
  items: ExportItem[]
}

export interface AggregatedData {
  dates: string[] // Sorted unique dates (dd/mm/yyyy format)
  products: Array<{ id: string; name: string }> // Sorted by name
  matrix: Map<string, Map<string, number>> // date -> product_id -> quantity
  totals: Map<string, number> // date -> total amount
  priceMatrix: Map<string, Map<string, number>> // date -> product_id -> total price for that product on that date
}

// ============ Helper Functions ============

/** Convert ISO date string to dd/mm/yyyy format in Vietnam timezone */
function formatDateVN(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

/** Parse dd/mm/yyyy to Date for sorting */
function parseDateVN(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map(Number)
  return new Date(year, month - 1, day)
}

// ============ Data Aggregation ============

export function aggregateExportData(records: ExportRecord[]): AggregatedData {
  const dateSet = new Set<string>()
  const productMap = new Map<string, string>() // product_id -> product_name
  const matrix = new Map<string, Map<string, number>>() // date -> product_id -> quantity
  const totals = new Map<string, number>() // date -> total amount
  const priceMatrix = new Map<string, Map<string, number>>() // date -> product_id -> total price

  for (const record of records) {
    const dateKey = formatDateVN(record.created_at)
    dateSet.add(dateKey)

    if (!matrix.has(dateKey)) {
      matrix.set(dateKey, new Map())
      priceMatrix.set(dateKey, new Map())
      totals.set(dateKey, 0)
    }

    const dateMatrix = matrix.get(dateKey)!
    const datePriceMatrix = priceMatrix.get(dateKey)!

    for (const item of record.items) {
      // Track product
      productMap.set(item.product_id, item.product_name)

      // Sum quantity
      const currentQty = dateMatrix.get(item.product_id) || 0
      dateMatrix.set(item.product_id, currentQty + item.quantity)

      // Sum price for this product on this date
      const currentPrice = datePriceMatrix.get(item.product_id) || 0
      const itemTotal = item.quantity * item.price
      datePriceMatrix.set(item.product_id, currentPrice + itemTotal)

      // Sum total for the date
      totals.set(dateKey, totals.get(dateKey)! + itemTotal)
    }
  }

  // Sort dates chronologically
  const dates = Array.from(dateSet).sort((a, b) => {
    return parseDateVN(a).getTime() - parseDateVN(b).getTime()
  })

  // Sort products alphabetically by name
  const products = Array.from(productMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  return { dates, products, matrix, totals, priceMatrix }
}


// ============ Title Generation ============

export function generateExportTitle(
  records: ExportRecord[],
  type: 'stock-in' | 'sales'
): string {
  const nameField = type === 'sales' ? 'customer_name' : 'supplier_name'
  const idField = type === 'sales' ? 'customer_id' : 'supplier_id'
  const multipleLabel = type === 'sales' ? 'NHIỀU KHÁCH HÀNG' : 'NHIỀU NHÀ CUNG CẤP'
  const unknownLabel = 'KHÔNG XÁC ĐỊNH'

  // Collect unique names
  const uniqueIds = new Set<string | null>()
  let singleName: string | null = null

  for (const record of records) {
    const id = record[idField] as string | null
    const name = record[nameField] as string | null
    uniqueIds.add(id)
    if (name) singleName = name
  }

  let entityName: string
  if (uniqueIds.size === 0 || (uniqueIds.size === 1 && uniqueIds.has(null))) {
    entityName = unknownLabel
  } else if (uniqueIds.size === 1) {
    entityName = singleName || unknownLabel
  } else {
    entityName = multipleLabel
  }

  return `TỔNG HỢP TIỀN HÀNG TỪNG ĐẠI LÝ ${entityName}`
}

// ============ Filename Generation ============

export function generateExportFilename(
  type: 'stock-in' | 'sales',
  fromDate: string | null,
  toDate: string | null
): string {
  const prefix = type === 'stock-in' ? 'nhap-kho' : 'xuat-kho'

  if (!fromDate && !toDate) {
    return `${prefix}-tat-ca.xlsx`
  }

  const from = fromDate || 'tat-ca'
  const to = toDate || 'tat-ca'

  return `${prefix}-${from}-${to}.xlsx`
}

// ============ Excel File Generation ============

export function generateExcelFile(
  data: AggregatedData,
  title: string,
  filename: string
): void {
  const { dates, products, matrix, totals } = data

  // Build worksheet data
  const wsData: (string | number | null)[][] = []

  // Row 1: Title (merged across all columns)
  const totalColumns = 1 + products.length + 1 // Date + products + Tiền hàng
  const titleRow: (string | null)[] = [title]
  for (let i = 1; i < totalColumns; i++) {
    titleRow.push(null)
  }
  wsData.push(titleRow)

  // Row 2: Headers
  const headerRow: string[] = ['Ngày', ...products.map((p) => p.name), 'Tiền hàng']
  wsData.push(headerRow)

  // Data rows
  for (const date of dates) {
    const row: (string | number | null)[] = [date]
    const dateMatrix = matrix.get(date)!

    for (const product of products) {
      const qty = dateMatrix.get(product.id)
      row.push(qty !== undefined ? qty : null)
    }

    // Total amount for the date
    const total = totals.get(date) || 0
    row.push(total)

    wsData.push(row)
  }

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths
  const colWidths: XLSX.ColInfo[] = [
    { wch: 12 }, // Date column
    ...products.map(() => ({ wch: 15 })), // Product columns
    { wch: 18 }, // Tiền hàng column
  ]
  ws['!cols'] = colWidths

  // Merge title row
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } }]

  // Create workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')

  // Trigger download
  XLSX.writeFile(wb, filename)
}

// ============ Main Export Function ============

export async function exportToExcel(
  records: ExportRecord[],
  type: 'stock-in' | 'sales',
  fromDate: string | null,
  toDate: string | null,
  isAllCustomers?: boolean // true when no customer filter is applied
): Promise<void> {
  if (records.length === 0) {
    throw new Error('Không có dữ liệu để xuất')
  }

  const filename = generateExportFilename(type, fromDate, toDate)

  // Check if we should use aggregate by customer format (sales only, all customers)
  if (type === 'sales' && isAllCustomers) {
    generateAggregateByCustomerExcel(records, filename)
  } else {
    const data = aggregateExportData(records)
    const title = generateExportTitle(records, type)
    generateExcelFile(data, title, filename)
  }
}

// ============ Aggregate By Customer Data ============

interface CustomerAggregatedData {
  dates: string[] // Sorted unique dates (dd/mm/yyyy format)
  customers: Array<{ id: string | null; name: string }> // Sorted by name
  matrix: Map<string, Map<string | null, number>> // date -> customer_id -> total amount
  customerTotals: Map<string | null, number> // customer_id -> grand total
}

function aggregateByCustomer(records: ExportRecord[]): CustomerAggregatedData {
  const dateSet = new Set<string>()
  const customerMap = new Map<string | null, string>() // customer_id -> customer_name
  const matrix = new Map<string, Map<string | null, number>>() // date -> customer_id -> total amount
  const customerTotals = new Map<string | null, number>() // customer_id -> grand total

  for (const record of records) {
    const dateKey = formatDateVN(record.created_at)
    dateSet.add(dateKey)

    const customerId = record.customer_id || null
    const customerName = record.customer_name || 'Không xác định'

    // Track customer
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, customerName)
      customerTotals.set(customerId, 0)
    }

    if (!matrix.has(dateKey)) {
      matrix.set(dateKey, new Map())
    }

    const dateMatrix = matrix.get(dateKey)!

    // Calculate total for this record
    const recordTotal = record.items.reduce((sum, item) => sum + item.quantity * item.price, 0)

    // Add to date-customer matrix
    const currentAmount = dateMatrix.get(customerId) || 0
    dateMatrix.set(customerId, currentAmount + recordTotal)

    // Add to customer grand total
    customerTotals.set(customerId, customerTotals.get(customerId)! + recordTotal)
  }

  // Sort dates chronologically
  const dates = Array.from(dateSet).sort((a, b) => {
    return parseDateVN(a).getTime() - parseDateVN(b).getTime()
  })

  // Sort customers alphabetically by name
  const customers = Array.from(customerMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  return { dates, customers, matrix, customerTotals }
}

// ============ Generate Aggregate By Customer Excel ============

function generateAggregateByCustomerExcel(
  records: ExportRecord[],
  filename: string
): void {
  const data = aggregateByCustomer(records)
  const { dates, customers, matrix, customerTotals } = data

  // Build worksheet data
  const wsData: (string | number | null)[][] = []

  // Row 1: Title
  const totalColumns = 1 + customers.length // Date + customers
  const titleRow: (string | null)[] = ['Tiền hàng đại lý tổng hợp']
  for (let i = 1; i < totalColumns; i++) {
    titleRow.push(null)
  }
  wsData.push(titleRow)

  // Row 2: Headers (empty cell + customer names)
  const headerRow: (string | null)[] = [null, ...customers.map((c) => c.name)]
  wsData.push(headerRow)

  // Data rows (date + amounts per customer)
  for (const date of dates) {
    const row: (string | number | null)[] = [date]
    const dateMatrix = matrix.get(date)!

    for (const customer of customers) {
      const amount = dateMatrix.get(customer.id)
      row.push(amount !== undefined ? amount : null)
    }

    wsData.push(row)
  }

  // Last row: Totals
  const totalRow: (string | number)[] = ['Tổng tiền']
  for (const customer of customers) {
    totalRow.push(customerTotals.get(customer.id) || 0)
  }
  wsData.push(totalRow)

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths
  const colWidths: XLSX.ColInfo[] = [
    { wch: 12 }, // Date column
    ...customers.map(() => ({ wch: 18 })), // Customer columns
  ]
  ws['!cols'] = colWidths

  // Merge title row
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } }]

  // Create workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')

  // Trigger download
  XLSX.writeFile(wb, filename)
}
