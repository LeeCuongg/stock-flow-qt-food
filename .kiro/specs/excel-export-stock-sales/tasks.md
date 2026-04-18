# Implementation Plan: Excel Export for Stock-In and Sales

## Overview

This implementation adds Excel export functionality to the stock-in and sales pages. The feature will aggregate transaction data by date and product, generating a matrix-style Excel file with dates in rows and products in columns. All processing happens client-side using the xlsx (SheetJS) library.

## Tasks

- [x] 1. Install xlsx library and set up dependencies
  - Add xlsx package to package.json
  - Add @types/xlsx for TypeScript support
  - _Requirements: 5.1, 5.7_

- [x] 2. Create core Excel export utilities
  - [x] 2.1 Implement data aggregation function
    - Create lib/excel-export.ts file
    - Define ExportRecord and AggregatedData interfaces
    - Implement aggregateExportData function to group data by date and product
    - Sum quantities for multiple transactions on same date/product
    - Sort dates chronologically and products alphabetically
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 2.2 Write unit tests for data aggregation
    - Test grouping by date and product
    - Test quantity summation for duplicate date/product combinations
    - Test date and product sorting
    - Test empty data handling
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 2.3 Implement Excel file generation function
    - Create generateExcelFile function in lib/excel-export.ts
    - Generate workbook with title row and header row
    - Create data matrix with dates and product columns
    - Add "Tiền hàng" total column
    - Apply formatting (bold headers, column widths, number formats)
    - Trigger browser download with proper filename
    - _Requirements: 1.3, 1.6, 1.7, 1.8, 1.9, 1.10, 5.2, 5.3, 5.4, 5.5, 5.6_
  
  - [ ]* 2.4 Write unit tests for Excel generation
    - Test workbook structure creation
    - Test title generation with various customer/supplier scenarios
    - Test filename generation with date ranges
    - Test number formatting (formatQty and formatVN)
    - _Requirements: 1.3, 1.4, 1.5, 1.11, 1.12_

- [x] 3. Implement stock-in export functionality
  - [x] 3.1 Add export button to stock-in page UI
    - Add "Xuất Excel" button to filter bar in app/stock-in/page.tsx
    - Use FileSpreadsheet icon and proper styling
    - Add loading state with spinner
    - _Requirements: 3.1, 3.3, 3.4, 3.5_
  
  - [x] 3.2 Implement stock-in export handler
    - Create handleExport function in stock-in page
    - Fetch all filtered stock-in records from Supabase (no pagination)
    - Respect all active filters (date, supplier, product, batch, payment status)
    - Exclude cancelled records
    - Generate title with supplier name logic (single/multiple/none)
    - Call aggregateExportData and generateExcelFile
    - Handle loading state and toast notifications
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.4_
  
  - [ ]* 3.3 Write integration tests for stock-in export
    - Test complete export flow with various filters
    - Test error handling for empty data
    - Test toast notifications
    - _Requirements: 1.1, 1.2, 3.6, 3.7, 3.8_

- [ ] 4. Checkpoint - Verify stock-in export works correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement sales export functionality
  - [x] 5.1 Add export button to sales page UI
    - Add "Xuất Excel" button to filter bar in app/sales/page.tsx
    - Use FileSpreadsheet icon and proper styling
    - Add loading state with spinner
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  
  - [x] 5.2 Implement sales export handler
    - Create handleExport function in sales page
    - Fetch all filtered sales records from Supabase (no pagination)
    - Respect all active filters (date, customer, product, batch, payment status)
    - Exclude cancelled records
    - Generate title with customer name logic (single/multiple/none)
    - Call aggregateExportData and generateExcelFile
    - Handle loading state and toast notifications
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 7.4_
  
  - [ ]* 5.3 Write integration tests for sales export
    - Test complete export flow with various filters
    - Test error handling for empty data
    - Test toast notifications
    - _Requirements: 2.1, 2.2, 3.6, 3.7, 3.8_

- [x] 6. Add error handling and edge cases
  - [x] 6.1 Implement error handling for all export scenarios
    - Handle empty data case with warning toast
    - Handle Supabase query failures with error toast
    - Handle Excel generation failures with error toast
    - Handle browser download failures with error toast
    - Ensure export button re-enables after errors
    - _Requirements: 3.6, 3.7, 3.8_
  
  - [ ]* 6.2 Write unit tests for error scenarios
    - Test no data warning
    - Test query failure handling
    - Test Excel generation error handling
    - _Requirements: 3.7, 3.8_

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The implementation uses TypeScript and the xlsx (SheetJS) library
- All processing happens client-side to avoid server load
- Export respects all active filters to ensure data consistency with displayed records
- Number formatting uses existing formatVN and formatQty utilities
