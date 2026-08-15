import csv, random
from datetime import date, timedelta

random.seed(42)

regions = ["North", "South", "East", "West"]
categories = ["Electronics", "Apparel", "Home & Garden", "Sports", "Books"]

# Give each region a distinct growth trajectory across quarters (2023 Q1 -> 2024 Q4)
# so "which region grew fastest" has a clear, non-arbitrary answer.
region_base = {"North": 40000, "South": 35000, "East": 30000, "West": 25000}
region_growth_per_quarter = {"North": 1.02, "South": 1.015, "East": 1.01, "West": 1.06}  # West grows fastest

quarters = []
for year in (2023, 2024):
    for q in (1, 2, 3, 4):
        quarters.append((year, q))

rows = []
order_id = 1000

def quarter_dates(year, q):
    start_month = (q - 1) * 3 + 1
    start = date(year, start_month, 1)
    end_month = start_month + 2
    if end_month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, end_month + 1, 1) - timedelta(days=1)
    return start, end

for region in regions:
    running = region_base[region]
    for qi, (year, q) in enumerate(quarters):
        if qi > 0:
            running *= region_growth_per_quarter[region]
        quarter_target_revenue = running
        start, end = quarter_dates(year, q)
        days_in_q = (end - start).days + 1
        n_orders = random.randint(55, 75)
        for _ in range(n_orders):
            d = start + timedelta(days=random.randint(0, days_in_q - 1))
            category = random.choice(categories)
            units = random.randint(1, 12)
            unit_price = {
                "Electronics": random.uniform(80, 400),
                "Apparel": random.uniform(15, 90),
                "Home & Garden": random.uniform(20, 150),
                "Sports": random.uniform(20, 200),
                "Books": random.uniform(8, 40),
            }[category]
            # scale unit price slightly so quarterly revenue trends toward quarter_target_revenue
            noise = random.uniform(0.85, 1.15)
            revenue = round(unit_price * units * noise * (quarter_target_revenue / (region_base[region] * n_orders * 0.06)), 2)
            revenue = max(revenue, 5.0)
            cost = round(revenue * random.uniform(0.55, 0.75), 2)
            rows.append({
                "order_id": order_id,
                "order_date": d.isoformat(),
                "region": region,
                "product_category": category,
                "units_sold": units,
                "revenue": revenue,
                "cost": cost,
            })
            order_id += 1

rows.sort(key=lambda r: r["order_date"])

with open("data/sales_sample.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["order_id","order_date","region","product_category","units_sold","revenue","cost"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows")
