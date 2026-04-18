# Requirements Document

## Giới thiệu

Tính năng này bổ sung chức năng xuất file Excel cho các bản ghi nhập kho và xuất kho (bán hàng). Người dùng có thể xuất các bản ghi đã lọc ra file Excel theo một mẫu định dạng cụ thể, với dữ liệu được tổ chức theo cột ngày và cột sản phẩm, được lọc theo khoảng thời gian hiện đang chọn.

## Thuật ngữ

- **Stock_In_System**: Module quản lý nhập kho, theo dõi các giao dịch mua hàng vào kho
- **Sales_System**: Module quản lý xuất kho (bán hàng), theo dõi các giao dịch bán hàng ra khỏi kho
- **Excel_Exporter**: Component chịu trách nhiệm tạo file Excel
- **Date_Filter**: Bộ lọc khoảng thời gian hiện đang áp dụng cho danh sách bản ghi
- **Customer**: Khách hàng - đơn vị kinh doanh mua sản phẩm (đại lý)
- **Supplier**: Nhà cung cấp - đơn vị kinh doanh cung cấp sản phẩm
- **Product**: Sản phẩm - mặt hàng tồn kho có thể mua hoặc bán
- **Batch**: Lô hàng - một lô sản phẩm cụ thể với mã lô duy nhất
- **Export_Button**: Nút xuất Excel - nút UI kích hoạt hành động xuất file Excel

## Requirements

### Requirement 1: Export Stock-In Records to Excel

**User Story:** As a user, I want to export stock-in records to Excel, so that I can analyze purchase data in spreadsheet format.

#### Acceptance Criteria

1. WHEN the user clicks the export button on the stock-in page, THE Excel_Exporter SHALL generate an Excel file containing all filtered stock-in records
2. THE Excel_Exporter SHALL apply the currently active Date_Filter to determine which records to export
3. THE Excel_Exporter SHALL format the Excel file with Row 1 containing "TỔNG HỢP TIỀN HÀNG TỪNG ĐẠI LÝ {supplier name}"
4. WHEN multiple suppliers exist in the filtered data, THE Excel_Exporter SHALL use "NHIỀU NHÀ CUNG CẤP" as the supplier name in Row 1
5. WHEN no supplier is specified, THE Excel_Exporter SHALL use "KHÔNG XÁC ĐỊNH" as the supplier name in Row 1
6. THE Excel_Exporter SHALL format data starting from Row 2 with Column A containing dates in dd/mm/yyyy format
7. THE Excel_Exporter SHALL create one column per product starting from Column B
8. THE Excel_Exporter SHALL add a "Tiền hàng" (Total amount) column after all product columns
9. THE Excel_Exporter SHALL populate each cell with the quantity of product purchased on that date
10. THE Excel_Exporter SHALL calculate the "Tiền hàng" column as the sum of (quantity × unit_price) for all products on that date
11. THE Excel_Exporter SHALL trigger a file download with filename format "nhap-kho-{from_date}-{to_date}.xlsx"
12. WHEN the Date_Filter is set to "all", THE Excel_Exporter SHALL use "tat-ca" in the filename

### Requirement 2: Export Sales Records to Excel

**User Story:** As a user, I want to export sales records to Excel, so that I can analyze sales data in spreadsheet format.

#### Acceptance Criteria

1. WHEN the user clicks the export button on the sales page, THE Excel_Exporter SHALL generate an Excel file containing all filtered sales records
2. THE Excel_Exporter SHALL apply the currently active Date_Filter to determine which records to export
3. THE Excel_Exporter SHALL format the Excel file with Row 1 containing "TỔNG HỢP TIỀN HÀNG TỪNG ĐẠI LÝ {customer name}"
4. WHEN multiple customers exist in the filtered data, THE Excel_Exporter SHALL use "NHIỀU KHÁCH HÀNG" as the customer name in Row 1
5. WHEN no customer is specified, THE Excel_Exporter SHALL use "KHÔNG XÁC ĐỊNH" as the customer name in Row 1
6. THE Excel_Exporter SHALL format data starting from Row 2 with Column A containing dates in dd/mm/yyyy format
7. THE Excel_Exporter SHALL create one column per product starting from Column B
8. THE Excel_Exporter SHALL add a "Tiền hàng" (Total amount) column after all product columns
9. THE Excel_Exporter SHALL populate each cell with the quantity of product sold on that date
10. THE Excel_Exporter SHALL calculate the "Tiền hàng" column as the sum of (quantity × sale_price) for all products on that date
11. THE Excel_Exporter SHALL trigger a file download with filename format "xuat-kho-{from_date}-{to_date}.xlsx"
12. WHEN the Date_Filter is set to "all", THE Excel_Exporter SHALL use "tat-ca" in the filename

### Requirement 3: UI Integration for Export Functionality

**User Story:** As a user, I want an easily accessible export button, so that I can quickly export data without confusion.

#### Acceptance Criteria

1. THE Stock_In_System SHALL display an Export_Button in the filter bar area
2. THE Sales_System SHALL display an Export_Button in the filter bar area
3. THE Export_Button SHALL use an appropriate icon (Download or FileSpreadsheet icon)
4. THE Export_Button SHALL display the label "Xuất Excel"
5. WHEN the user clicks the Export_Button, THE system SHALL show a loading indicator
6. WHEN the export completes successfully, THE system SHALL display a success toast notification
7. IF the export fails, THEN THE system SHALL display an error toast notification with the error message
8. WHEN no records match the current filter, THE system SHALL display a warning toast "Không có dữ liệu để xuất"

### Requirement 4: Data Aggregation for Excel Export

**User Story:** As a user, I want data grouped by date and product, so that I can see daily totals for each product.

#### Acceptance Criteria

1. THE Excel_Exporter SHALL aggregate quantities by date and product_id
2. WHEN multiple transactions exist for the same product on the same date, THE Excel_Exporter SHALL sum the quantities
3. THE Excel_Exporter SHALL sort dates in ascending chronological order
4. THE Excel_Exporter SHALL sort product columns alphabetically by product name
5. WHEN a product has no transactions on a specific date, THE Excel_Exporter SHALL leave that cell empty
6. THE Excel_Exporter SHALL format quantity values with appropriate decimal places (using formatQty utility)
7. THE Excel_Exporter SHALL format currency values in Vietnamese Dong format (using formatVN utility)

### Requirement 5: Excel Library Integration

**User Story:** As a developer, I want to use a reliable Excel generation library, so that the exported files are compatible with Excel and other spreadsheet applications.

#### Acceptance Criteria

1. THE system SHALL use the xlsx library (SheetJS) for Excel file generation
2. THE Excel_Exporter SHALL create workbooks with a single worksheet named "Data"
3. THE Excel_Exporter SHALL set appropriate column widths for readability
4. THE Excel_Exporter SHALL apply bold formatting to the header row (Row 1)
5. THE Excel_Exporter SHALL apply bold formatting to column headers (Row 2)
6. THE Excel_Exporter SHALL apply number formatting to currency columns
7. THE Excel_Exporter SHALL generate files in XLSX format (Excel 2007+)

### Requirement 6: Filter Respect and Data Consistency

**User Story:** As a user, I want the export to respect all active filters, so that I get exactly the data I'm viewing.

#### Acceptance Criteria

1. WHEN a customer filter is active on the sales page, THE Excel_Exporter SHALL only export sales for that customer
2. WHEN a supplier filter is active on the stock-in page, THE Excel_Exporter SHALL only export stock-in records for that supplier
3. WHEN a product filter is active, THE Excel_Exporter SHALL only export data for that product
4. WHEN a payment status filter is active, THE Excel_Exporter SHALL only export records matching that payment status
5. WHEN a batch code filter is active, THE Excel_Exporter SHALL only export records containing that batch code
6. THE Excel_Exporter SHALL fetch data using the same Supabase queries as the display table
7. THE Excel_Exporter SHALL exclude cancelled records (status !== 'CANCELLED')

### Requirement 7: Performance and User Experience

**User Story:** As a user, I want the export to complete quickly, so that I don't have to wait long for large datasets.

#### Acceptance Criteria

1. WHEN exporting fewer than 1000 records, THE Excel_Exporter SHALL complete within 3 seconds
2. WHEN exporting 1000-5000 records, THE Excel_Exporter SHALL complete within 10 seconds
3. THE Export_Button SHALL be disabled during export processing
4. THE Export_Button SHALL show a loading spinner during export processing
5. THE system SHALL process export operations on the client side to avoid server load
6. WHEN an export operation is in progress, THE user SHALL be able to cancel by navigating away
