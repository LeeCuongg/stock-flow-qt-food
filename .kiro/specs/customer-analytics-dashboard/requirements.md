# Requirements Document

## Introduction

Tính năng Customer Analytics Dashboard mở rộng tab "Khách hàng" trên trang /dashboard hiện tại, thay thế biểu đồ "Cơ cấu công nợ phải thu" bằng các dashboard phân tích nâng cao. Mục tiêu là cung cấp cho người quản lý các biểu đồ đường (line chart) theo thời gian và các công cụ phân tích sâu để đánh giá hiệu quả doanh thu từng khách hàng, phát hiện khách hàng có doanh thu kém, và hỗ trợ ra quyết định chiến lược kinh doanh. Dashboard hỗ trợ bộ lọc khách hàng (combobox tìm kiếm), bộ lọc khoảng thời gian (date range), và bộ lọc chỉ số (metric selector) để người dùng linh hoạt xem dữ liệu theo nhiều góc nhìn khác nhau.

## Glossary

- **Dashboard**: Trang tổng quan tại /dashboard của ứng dụng
- **Customer_Tab**: Tab "Khách hàng" trong Dashboard, hiển thị các biểu đồ và bảng phân tích khách hàng
- **Line_Chart**: Biểu đồ đường hiển thị xu hướng dữ liệu theo thời gian, trục X là khoảng thời gian (tháng), trục Y là giá trị
- **Revenue_Trend_Chart**: Biểu đồ đường thể hiện xu hướng doanh thu theo tháng của từng khách hàng hoặc tổng thể
- **Order_Trend_Chart**: Biểu đồ đường thể hiện xu hướng số đơn hàng theo tháng
- **Customer_Performance_Table**: Bảng xếp hạng hiệu quả khách hàng với các chỉ số doanh thu, đơn hàng, giá trị trung bình đơn hàng, và xu hướng tăng/giảm
- **Underperforming_Customer**: Khách hàng có doanh thu giảm liên tục hoặc thấp hơn mức trung bình trong kỳ phân tích
- **Customer_Selector**: Combobox (dropdown có tìm kiếm) cho phép người dùng chọn một hoặc nhiều khách hàng để lọc dữ liệu hiển thị trên các biểu đồ và bảng
- **Time_Period_Filter**: Bộ lọc khoảng thời gian cho phép chọn ngày bắt đầu và ngày kết thúc hoặc preset (tháng trước, 3 tháng, 6 tháng, năm nay, tuỳ chọn) để giới hạn dữ liệu phân tích
- **Metric_Selector**: Bộ chọn chỉ số/metric cho phép chuyển đổi giữa các góc nhìn dữ liệu khác nhau (doanh thu, số đơn hàng, giá trị TB đơn hàng, công nợ)
- **Supabase_RPC**: Hàm PostgreSQL được gọi từ client thông qua Supabase RPC
- **Monthly_Aggregation**: Dữ liệu được gom nhóm theo tháng để hiển thị trên biểu đồ đường

## Requirements

### Requirement 1: Xóa biểu đồ "Cơ cấu công nợ phải thu"

**User Story:** Là người quản lý, tôi muốn loại bỏ biểu đồ tròn "Cơ cấu công nợ phải thu" khỏi tab Khách hàng, để dành không gian cho các biểu đồ phân tích hữu ích hơn.

#### Acceptance Criteria

1. WHEN the Customer_Tab is rendered, THE Dashboard SHALL NOT display the "Cơ cấu công nợ phải thu" pie chart
2. THE Dashboard SHALL retain all other existing components in the Customer_Tab (KPI cards, top customers bar chart, daily cash flow chart, receivables table, payables table)

### Requirement 2: Bộ lọc khách hàng (Customer Selector)

**User Story:** Là người quản lý, tôi muốn có bộ lọc khách hàng dạng combobox có tìm kiếm, để tôi có thể chọn xem dữ liệu của một hoặc nhiều khách hàng cụ thể thay vì chỉ xem top 5.

#### Acceptance Criteria

1. THE Customer_Tab SHALL display a Customer_Selector combobox at the top of the tab, above all charts and tables
2. WHEN the Customer_Tab loads, THE Customer_Selector SHALL load the full list of customers who have at least one sale in the system
3. WHEN a user types text into the Customer_Selector, THE Customer_Selector SHALL filter the customer list to show only customers whose name contains the typed text (case-insensitive)
4. THE Customer_Selector SHALL support selecting multiple customers from the dropdown list
5. WHEN no customers are selected in the Customer_Selector, THE Dashboard SHALL display data for all customers in the charts and tables
6. WHEN one or more customers are selected in the Customer_Selector, THE Dashboard SHALL filter all charts and tables to show data only for the selected customers
7. THE Customer_Selector SHALL display a "Xóa bộ lọc" (clear) button to reset the selection and return to viewing all customers
8. THE Customer_Selector SHALL display the count of selected customers as a badge when customers are selected

### Requirement 3: Bộ lọc khoảng thời gian (Time Period Filter)

**User Story:** Là người quản lý, tôi muốn có bộ lọc khoảng thời gian riêng cho tab Khách hàng, để tôi có thể phân tích dữ liệu khách hàng trong các khoảng thời gian khác nhau.

#### Acceptance Criteria

1. THE Customer_Tab SHALL display a Time_Period_Filter alongside the Customer_Selector at the top of the tab
2. THE Time_Period_Filter SHALL provide preset options: "Tháng này", "Tháng trước", "3 tháng", "6 tháng", "Năm nay", "Tuỳ chọn"
3. WHEN the user selects a preset option, THE Time_Period_Filter SHALL automatically calculate the corresponding start_date and end_date
4. WHEN the user selects "Tuỳ chọn", THE Time_Period_Filter SHALL display two date input fields for start_date and end_date
5. WHEN the Time_Period_Filter value changes, THE Dashboard SHALL reload all charts and tables in the Customer_Tab with data for the new date range
6. THE Time_Period_Filter SHALL default to "3 tháng" when the Customer_Tab first loads

### Requirement 4: Bộ chọn chỉ số (Metric Selector)

**User Story:** Là người quản lý, tôi muốn chuyển đổi giữa các chỉ số khác nhau (doanh thu, số đơn, giá trị TB, công nợ), để xem dữ liệu từ nhiều góc nhìn trên cùng một biểu đồ.

#### Acceptance Criteria

1. THE Customer_Tab SHALL display a Metric_Selector that allows switching between the following metrics: "Doanh thu", "Số đơn hàng", "Giá trị TB/đơn", "Công nợ"
2. WHEN the user selects "Doanh thu", THE Revenue_Trend_Chart SHALL display monthly revenue data on the Y-axis in VND
3. WHEN the user selects "Số đơn hàng", THE Revenue_Trend_Chart SHALL display monthly order count data on the Y-axis
4. WHEN the user selects "Giá trị TB/đơn", THE Revenue_Trend_Chart SHALL display monthly average order value (revenue / order count) on the Y-axis in VND
5. WHEN the user selects "Công nợ", THE Revenue_Trend_Chart SHALL display monthly outstanding debt data on the Y-axis in VND
6. THE Metric_Selector SHALL default to "Doanh thu" when the Customer_Tab first loads
7. WHEN the Metric_Selector value changes, THE Revenue_Trend_Chart SHALL update the chart title, Y-axis label, and tooltip to reflect the selected metric

### Requirement 5: Biểu đồ đường xu hướng theo tháng (Trend Chart)

**User Story:** Là người quản lý, tôi muốn xem biểu đồ đường xu hướng theo tháng cho tất cả hoặc các khách hàng đã chọn, để nhận biết xu hướng dữ liệu theo thời gian.

#### Acceptance Criteria

1. THE Revenue_Trend_Chart SHALL display a line chart with the X-axis representing monthly time periods and the Y-axis representing the value of the currently selected metric
2. WHEN the Customer_Tab loads with no customer filter, THE Revenue_Trend_Chart SHALL display aggregated monthly data for all customers as separate colored lines
3. WHEN customers are selected via the Customer_Selector, THE Revenue_Trend_Chart SHALL display monthly data only for the selected customers as separate colored lines
4. THE Revenue_Trend_Chart SHALL label each X-axis tick as "T1", "T2", ... "T12" corresponding to calendar months within the selected date range
5. WHEN a user hovers over a data point on the Revenue_Trend_Chart, THE Dashboard SHALL display a tooltip showing the customer name, month, and exact value formatted appropriately (VND for monetary values, integer for order counts)
6. THE Revenue_Trend_Chart SHALL include a legend identifying each customer line by name and color
7. WHEN the Time_Period_Filter or Customer_Selector or Metric_Selector changes, THE Revenue_Trend_Chart SHALL recalculate and display data for the updated filters

### Requirement 6: Bảng phân tích hiệu quả khách hàng (Customer Performance Table)

**User Story:** Là người quản lý, tôi muốn xem bảng phân tích chi tiết hiệu quả tất cả khách hàng (hoặc khách hàng đã lọc), để xác định khách hàng nào có doanh thu kém và cần hỗ trợ.

#### Acceptance Criteria

1. THE Customer_Performance_Table SHALL display the following columns: Tên khách hàng, Tổng doanh thu, Số đơn hàng, Giá trị TB/đơn, Xu hướng (tăng/giảm), Công nợ
2. WHEN no customers are selected in the Customer_Selector, THE Customer_Performance_Table SHALL display data for all customers who have sales in the selected time period
3. WHEN customers are selected in the Customer_Selector, THE Customer_Performance_Table SHALL display data only for the selected customers
4. THE Customer_Performance_Table SHALL calculate the trend indicator by comparing revenue of the most recent month to the average of previous months within the selected period
5. WHEN a customer's recent month revenue is lower than the average of previous months by more than 20%, THE Customer_Performance_Table SHALL display a red downward arrow icon and label the customer as "Giảm"
6. WHEN a customer's recent month revenue is higher than the average of previous months by more than 20%, THE Customer_Performance_Table SHALL display a green upward arrow icon and label the customer as "Tăng"
7. WHEN a customer's recent month revenue is within 20% of the average of previous months, THE Customer_Performance_Table SHALL display a neutral indicator and label the customer as "Ổn định"
8. THE Customer_Performance_Table SHALL sort customers by total revenue in descending order by default
9. THE Customer_Performance_Table SHALL highlight rows of Underperforming_Customers with a subtle warning background color
10. THE Customer_Performance_Table SHALL support client-side pagination when displaying more than 20 customers

### Requirement 7: Danh sách khách hàng cần hỗ trợ (Underperforming Customers Alert)

**User Story:** Là người quản lý, tôi muốn xem danh sách khách hàng có doanh thu kém hoặc giảm sút, để chủ động lên chiến lược hỗ trợ và giữ chân khách hàng.

#### Acceptance Criteria

1. THE Dashboard SHALL display a card listing customers whose revenue trend is "Giảm" (declining) based on the trend calculation from Requirement 6
2. THE card SHALL display each underperforming customer's name, total revenue in the period, percentage change from average, and outstanding debt
3. WHEN no customers have declining revenue, THE Dashboard SHALL display a positive message indicating all customers are performing well
4. THE card SHALL sort underperforming customers by the magnitude of revenue decline (largest decline first)

### Requirement 8: Supabase RPC cho dữ liệu phân tích khách hàng theo tháng

**User Story:** Là developer, tôi muốn có Supabase RPC trả về dữ liệu doanh thu và đơn hàng theo tháng cho từng khách hàng, để cung cấp dữ liệu cho các biểu đồ đường.

#### Acceptance Criteria

1. THE Supabase_RPC SHALL provide a function `get_customer_monthly_stats` that accepts warehouse_id, start_date, end_date, and an optional customer_ids (UUID array) parameter
2. THE `get_customer_monthly_stats` function SHALL return rows containing: customer_id, customer_name, month (DATE), monthly_revenue (NUMERIC), monthly_orders (BIGINT), monthly_avg_order_value (NUMERIC), monthly_outstanding_debt (NUMERIC)
3. THE `get_customer_monthly_stats` function SHALL aggregate data by calendar month, grouping sales by customer and month
4. THE `get_customer_monthly_stats` function SHALL exclude cancelled sales (status = 'CANCELLED') from all calculations
5. WHEN customer_ids parameter is provided and non-empty, THE `get_customer_monthly_stats` function SHALL return data only for the specified customers
6. WHEN customer_ids parameter is NULL or empty, THE `get_customer_monthly_stats` function SHALL return data for all customers with at least one sale in the specified period
7. WHEN called with a valid warehouse_id and date range, THE `get_customer_monthly_stats` function SHALL return results ordered by customer_name and month ascending

### Requirement 9: Responsive layout và trải nghiệm người dùng

**User Story:** Là người dùng, tôi muốn các biểu đồ phân tích và bộ lọc hiển thị tốt trên cả desktop và mobile, để có thể xem dashboard mọi lúc mọi nơi.

#### Acceptance Criteria

1. THE Customer_Tab SHALL arrange the filter bar (Customer_Selector, Time_Period_Filter, Metric_Selector) in a horizontal row on desktop screens (width >= 1024px)
2. WHILE the screen width is less than 1024px, THE Customer_Tab SHALL stack the filter bar components vertically
3. THE Customer_Tab SHALL arrange charts in a 2-column grid layout on desktop screens (width >= 1024px)
4. WHILE the screen width is less than 1024px, THE Customer_Tab SHALL stack all charts in a single column layout
5. THE Dashboard SHALL display loading skeletons for all new chart components and filter components while data is being fetched
6. IF the Supabase_RPC returns an error, THEN THE Dashboard SHALL display an error message within the affected chart card and continue rendering other components
