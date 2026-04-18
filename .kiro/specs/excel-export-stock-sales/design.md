# Design Document: Excel Export for Stock-In and Sales

## Overview

This feature adds Excel export functionality to the stock-in and sales pages, allowing users to export filtered records into a structured Excel format. The export will aggregate data by date and product, presenting it in a matrix format with dates in rows and products in columns, plus a total amount column.

The implementation will use the xlsx (SheetJS) library for Excel generation, with all processing happening client-side to avoid server load. The export will respect all active filters (date range, customer/supplier, payment status, product, batch code) to ensure users get exactly the data they're viewing.

### Key Design Decisions

1. **Client-side processing**: All Excel generation happens in the browser to reduce server load and provide immediate feedback
2. **Reusable utilities**: Create shared export utilities that can be used by both stock-in and sales pages
3. **Filter consistency**: Use the same Supabase queries as the display tables to ensure data consistency
4. **Aggregation strategy**: Group data by date and product, summing quantities for multiple transactions on the same date
5. **Vietnamese formatting**: Use existing formatVN and formatQty utilities for consistent number formatting

## Architecture

### Component Structure

```
lib/
  excel-export.ts          # Core export utilities
app/
  stock-in/
    page.tsx              # Add export button and handler
  sales/
    page.tsx              # Add export button and handler
```

### Data Flow

1. User clicks "Xuất Excel" button
2. Button handler collects current filter state
3. Fetch all matching records from Supabase (no pagination limit)
4. Aggregate data by date and product
5. Generate Excel workbook using xlsx library
6. Trigger browser download with formatted filename
7. Show success/error toast notification

## Components and Interfaces

### Excel Export Utility

```typescript
// lib/excel-export.ts

import * as XLSX from 'xlsx'
import { formatVN, formatQty } from './utils'

interface ExportRecord {
  created_at: string
  customer_name?: string | null
  supplier_name?: string | null
  customer_id?: string | null
  supplier_id?: string | null
  items: Array<{
    product_id: string
    product_name: string
    quantity: number
    price: number  // sale_price or unit_price
  }>
}

interface AggregatedData {
  dates: string[]  // Sorted unique dates (dd/mm/yyyy format)
  products: Array<{ id: string; name: string }>  // Sorted by name
  matrix: Map<string, Map<string, number>>  // date -> product_id -> quantity
  totals: Map<string, number>  // date -> total amount
}

export function aggregateExportData(
  records: ExportRecord[],
  type: 'stock-in' | 'sales'
): AggregatedData

export function generateExcelFile(
  data: AggregatedData,
  title: string,
  filename: string
): void
```

### Page Integration

Both stock-in and sales pages will add:

```typescript
// Export button in filter bar
<Button 
  variant="outline" 
  size="sm" 
  className="h-9" 
  onClick={handleExport}
  disabled={isExporting}
>
  {isExporting ? (
    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
  ) : (
    <FileSpreadsheet className="mr-1 h-3 w-3" />
  )}
  Xuất Excel
</Button>

// Export handler
const handleExport = async () => {
  if (isExporting) return
  setIsExporting(true)
  
  try {
    // Fetch all records with current filters (no pagination)
    const records = await fetchAllRecords()
    
    if (records.length === 0) {
      toast.warning('Không có dữ liệu để xuất')
      return
    }
    
    // Generate and download Excel
    const title = generateTitle(records)
    const filename = generateFilename()
    await exportToExcel(records, title, filename)
    
    toast.success('Xuất Excel thành công')
  } catch (error) {
    toast.error(`Lỗi xuất Excel: ${error.message}`)
  } finally {
    setIsExporting(false)
  }
}
```

## Data Models

### Aggregated Matrix Structure

The export data is organized as a matrix:

- **Rows**: Dates in chronological order (dd/mm/yyyy format)
- **Columns**: Products in alphabetical order by name
- **Cells**: Quantity of product sold/purchased on that date
- **Last Column**: Total amount (sum of quantity × price for all products on that date)

Example structure:

```
| Ngày       | Product A | Product B | Product C | Tiền hàng |
|------------|-----------|-----------|-----------|-----------|
| 01/01/2024 | 10        | 5         |           | 150,000   |
| 02/01/2024 | 15        |           | 20        | 300,000   |
| 03/01/2024 |           | 8         | 12        | 200,000   |
```

### Excel Workbook Structure

```typescript
interface WorkbookStructure {
  sheetName: 'Data'
  rows: [
    // Row 1: Title
    ['TỔNG HỢP TIỀN HÀNG TỪNG ĐẠI LÝ {name}'],
    
    // Row 2: Headers
    ['Ngày', ...productNames, 'Tiền hàng'],
    
    // Row 3+: Data rows
    [date, ...quantities, totalAmount],
    // ...
  ]
  
  formatting: {
    row1: { bold: true, fontSize: 14 }
    row2: { bold: true }
    columnWidths: { A: 12, B-N: 15, last: 18 }
    numberFormat: {
      quantities: '#,##0.###'
      amounts: '#,##0'
    }
  }
}
```

## Error Handling

### Error Scenarios

1. **No data to export**
   - Detection: Empty records array after filtering
   - Response: Show warning toast "Không có dữ liệu để xuất"
   - Action: Do not generate file

2. **Supabase query failure**
   - Detection: Error from Supabase query
   - Response: Show error toast with error message
   - Action: Log error, do not generate file

3. **Excel generation failure**
   - Detection: Exception during XLSX operations
   - Response: Show error toast "Lỗi tạo file Excel"
   - Action: Log error details

4. **Browser download failure**
   - Detection: Exception during file download
   - Response: Show error toast "Lỗi tải file"
   - Action: Log error, suggest trying again

### Error Recovery

- All errors are non-fatal and allow user to retry
- Export button re-enables after error
- Loading state clears on error
- Detailed error messages logged to console for debugging

## Testing Strategy

This feature involves UI interactions, file generation, and browser download APIs, which are not suitable for property-based testing. The testing strategy will focus on:

### Unit Tests

1. **Data Aggregation**
   - Test aggregateExportData with various record sets
   - Verify correct grouping by date and product
   - Verify quantity summation for multiple transactions
   - Test date sorting (chronological order)
   - Test product sorting (alphabetical by name)
   - Test empty data handling

2. **Title Generation**
   - Test single customer/supplier name
   - Test multiple customers/suppliers ("NHIỀU KHÁCH HÀNG" / "NHIỀU NHÀ CUNG CẤP")
   - Test no customer/supplier ("KHÔNG XÁC ĐỊNH")

3. **Filename Generation**
   - Test with date range filters
   - Test with "all" filter (should use "tat-ca")
   - Verify correct format: "nhap-kho-{from}-{to}.xlsx" or "xuat-kho-{from}-{to}.xlsx"

4. **Number Formatting**
   - Test formatQty with integers (no decimals)
   - Test formatQty with decimals (preserve precision)
   - Test formatVN with various amounts

### Integration Tests

1. **Export Flow**
   - Test complete export flow from button click to file generation
   - Verify filter state is correctly passed to query
   - Verify loading states and toast notifications
   - Test with various filter combinations

2. **Supabase Query**
   - Test query construction with different filters
   - Verify correct joins for product/batch filtering
   - Verify cancelled records are excluded
   - Test pagination removal (fetch all records)

### Manual Testing

1. **File Validation**
   - Open generated Excel files in Microsoft Excel
   - Open generated Excel files in Google Sheets
   - Open generated Excel files in LibreOffice Calc
   - Verify formatting (bold headers, column widths)
   - Verify number formatting (Vietnamese locale)

2. **Performance Testing**
   - Test with < 100 records (should be instant)
   - Test with 100-1000 records (should complete within 3 seconds)
   - Test with 1000-5000 records (should complete within 10 seconds)
   - Monitor browser memory usage during export

3. **Edge Cases**
   - Export with no filters (all data)
   - Export with single record
   - Export with single product
   - Export with single date
   - Export with products having no transactions on some dates (empty cells)

### Test Data Requirements

- Sample records with various dates, products, customers/suppliers
- Records with multiple transactions on same date for same product
- Records with different payment statuses
- Records with and without batch codes
- Mix of cancelled and active records

## Implementation Notes

### Library Installation

The xlsx library needs to be added to package.json:

```bash
pnpm add xlsx
pnpm add -D @types/xlsx
```

### Performance Considerations

1. **Client-side processing**: All aggregation and Excel generation happens in browser
   - Pros: No server load, immediate feedback
   - Cons: Limited by browser memory for very large datasets
   - Mitigation: Show warning for exports > 5000 records

2. **Query optimization**: Fetch only required fields
   ```typescript
   .select('created_at, customer_name, customer_id, sales_items(product_id, product_name, quantity, sale_price)')
   ```

3. **Aggregation efficiency**: Use Map for O(1) lookups during aggregation

### Browser Compatibility

- xlsx library supports all modern browsers
- File download uses standard Blob and URL.createObjectURL APIs
- Tested on Chrome, Firefox, Safari, Edge

### Accessibility

- Export button has proper ARIA labels
- Loading state communicated via aria-busy
- Toast notifications are screen-reader friendly
- Keyboard accessible (button can be triggered via Enter/Space)

