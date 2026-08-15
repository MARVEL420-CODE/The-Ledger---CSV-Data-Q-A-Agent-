# Sample Questions & Answers

These 10 questions were run against `backend/data/sales_sample.csv` (2,109 rows,
2023–2024, 4 regions × 5 categories). The SQL and result columns below are the
**exact SQL the agent generates and executes** — I ran the underlying queries
directly to capture ground truth; the NL sentences shown are representative of
what Gemini's second call produces from those same rows (Gemini's exact
phrasing will vary slightly run to run, but the numbers cannot, since it's
never given the freedom to invent them).

---

**1. Which region grew fastest from 2023 to 2024?**
```sql
SELECT region, strftime('%Y', order_date) as year, ROUND(SUM(revenue),2) as total_revenue
FROM data_table GROUP BY region, year ORDER BY region, year
```
| region | 2023 revenue | 2024 revenue | growth |
|---|---|---|---|
| East | 46,876.21 | 44,807.05 | -4.4% |
| North | 54,170.49 | 49,947.74 | -7.8% |
| South | 47,680.81 | 54,928.25 | +15.2% |
| West | 51,400.72 | 64,655.97 | **+25.8%** |

> **Answer:** West grew fastest, up about 25.8% from $51,400.72 in 2023 to $64,655.97 in 2024.

---

**2. What is total revenue by region?**
```sql
SELECT region, ROUND(SUM(revenue),2) as total_revenue FROM data_table GROUP BY region ORDER BY total_revenue DESC
```
West: $116,056.69 · North: $104,118.23 · South: $102,609.06 · East: $91,683.26

> **Answer:** West leads with $116,056.69 in total revenue; East is lowest at $91,683.26.

---

**3. Which product category has the highest average order revenue?**
```sql
SELECT product_category, ROUND(AVG(revenue),2) as avg_order_revenue FROM data_table GROUP BY product_category ORDER BY avg_order_revenue DESC
```
Electronics: $447.42 · Sports: $187.13 · Home & Garden: $169.20 · Apparel: $94.64 · Books: $44.20

> **Answer:** Electronics, at $447.42 average order revenue — more than double the next category.

---

**4. What were total units sold in Q4 2024?**
```sql
SELECT SUM(units_sold) as total_units FROM data_table WHERE order_date >= '2024-10-01' AND order_date <= '2024-12-31'
```
> **Answer:** 1,660 units were sold in Q4 2024.

---

**5. Which region had the highest profit margin (revenue minus cost)?**
```sql
SELECT region, ROUND(SUM(revenue)-SUM(cost),2) as profit,
       ROUND((SUM(revenue)-SUM(cost))*100.0/SUM(revenue),2) as margin_pct
FROM data_table GROUP BY region ORDER BY margin_pct DESC
```
West: 35.43% ($41,121.10 profit) · North: 35.22% · South: 35.19% · East: 34.51%

> **Answer:** West, with a 35.43% margin and $41,121.10 in profit — though all four regions are within about 1 point of each other.

---

**6. What is the month-over-month revenue trend for the West region in 2024?**
```sql
SELECT strftime('%Y-%m', order_date) as month, ROUND(SUM(revenue),2) as revenue
FROM data_table WHERE region = 'West' AND strftime('%Y', order_date) = '2024'
GROUP BY month ORDER BY month
```
> **Answer:** Returns 12 rows, one per month, showing a generally upward trend consistent with West's 25.8% annual growth (full table available via "Show the work" in the UI).

---

**7. How many orders came from the South region?**
```sql
SELECT COUNT(*) as order_count FROM data_table WHERE region = 'South'
```
> **Answer:** 525 orders came from the South region.

---

**8. What is the best-selling product category by units sold?**
```sql
SELECT product_category, SUM(units_sold) as total_units FROM data_table GROUP BY product_category ORDER BY total_units DESC
```
Electronics: 3,110 · Books: 2,849 · Sports: 2,619 · Apparel: 2,608 · Home & Garden: 2,522

> **Answer:** Electronics, with 3,110 total units sold — notable since it also has the highest average order value, but Books is a close second by volume despite the lowest average order value.

---

**9. What was total revenue in 2023 vs 2024?**
```sql
SELECT strftime('%Y', order_date) as year, ROUND(SUM(revenue),2) as total_revenue
FROM data_table GROUP BY year ORDER BY year
```
2023: $200,128.23 · 2024: $214,338.01

> **Answer:** Revenue grew from $200,128.23 in 2023 to $214,338.01 in 2024, up about 7.1% overall.

---

**10. Which region has the lowest average order value?**
```sql
SELECT region, ROUND(AVG(revenue),2) as avg_order_value FROM data_table GROUP BY region ORDER BY avg_order_value ASC
```
East: $175.30 · South: $195.45 · North: $199.08 · West: $215.72

> **Answer:** East has the lowest average order value at $175.30.
