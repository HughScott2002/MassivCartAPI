WITH selected_stores AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY id) AS store_slot
  FROM public.stores
  ORDER BY id
  LIMIT 3
),
product_prices AS (
  SELECT *
  FROM (
    VALUES
      ('Grace White Rice 2kg', 1, 425.00, 212.50),
      ('Grace White Rice 2kg', 2, 439.00, 219.50),
      ('Grace White Rice 2kg', 3, 449.00, 224.50),
      ('Carib Long Grain Rice 2kg', 1, 405.00, 202.50),
      ('Carib Long Grain Rice 2kg', 2, 418.00, 209.00),
      ('Carib Long Grain Rice 2kg', 3, 429.00, 214.50),
      ('Cooking Oil 1L', 1, 690.00, 690.00),
      ('Cooking Oil 1L', 2, 715.00, 715.00),
      ('Cooking Oil 1L', 3, 735.00, 735.00),
      ('Anchor Butter 250g', 1, 315.00, 1260.00),
      ('Anchor Butter 250g', 2, 329.00, 1316.00),
      ('Anchor Butter 250g', 3, 345.00, 1380.00),
      ('Devon House Milk 1L', 1, 248.00, 248.00),
      ('Devon House Milk 1L', 2, 255.00, 255.00),
      ('Devon House Milk 1L', 3, 265.00, 265.00),
      ('Lactoferrin Whole Milk 1L', 1, 275.00, 275.00),
      ('Lactoferrin Whole Milk 1L', 2, 289.00, 289.00),
      ('Lactoferrin Whole Milk 1L', 3, 299.00, 299.00),
      ('Grace Coconut Milk 400ml', 1, 185.00, 462.50),
      ('Grace Coconut Milk 400ml', 2, 192.00, 480.00),
      ('Grace Coconut Milk 400ml', 3, 199.00, 497.50),
      ('Grace Corned Beef 200g', 1, 338.00, 1690.00),
      ('Grace Corned Beef 200g', 2, 349.00, 1745.00),
      ('Grace Corned Beef 200g', 3, 359.00, 1795.00),
      ('Excelsior Water Crackers 112g', 1, 98.00, 875.00),
      ('Excelsior Water Crackers 112g', 2, 104.00, 928.57),
      ('Excelsior Water Crackers 112g', 3, 109.00, 973.21),
      ('Tastee Peanut Butter 400g', 1, 285.00, 712.50),
      ('Tastee Peanut Butter 400g', 2, 295.00, 737.50),
      ('Tastee Peanut Butter 400g', 3, 305.00, 762.50),
      ('Panadol 500mg 10s', 1, 145.00, NULL),
      ('Panadol 500mg 10s', 2, 152.00, NULL),
      ('Panadol 500mg 10s', 3, 159.00, NULL),
      ('Ibuprofen 400mg 10s', 1, 168.00, NULL),
      ('Ibuprofen 400mg 10s', 2, 176.00, NULL),
      ('Ibuprofen 400mg 10s', 3, 184.00, NULL),
      ('Clorox Bleach 1L', 1, 310.00, 310.00),
      ('Clorox Bleach 1L', 2, 325.00, 325.00),
      ('Clorox Bleach 1L', 3, 338.00, 338.00),
      ('Colgate Toothpaste 100ml', 1, 245.00, 2450.00),
      ('Colgate Toothpaste 100ml', 2, 255.00, 2550.00),
      ('Colgate Toothpaste 100ml', 3, 268.00, 2680.00),
      ('Dove Soap 100g', 1, 182.00, 1820.00),
      ('Dove Soap 100g', 2, 189.00, 1890.00),
      ('Dove Soap 100g', 3, 198.00, 1980.00),
      ('Scotch Bonnet Pepper Sauce 125ml', 1, 220.00, 1760.00),
      ('Scotch Bonnet Pepper Sauce 125ml', 2, 229.00, 1832.00),
      ('Scotch Bonnet Pepper Sauce 125ml', 3, 238.00, 1904.00),
      ('Maggi Chicken Seasoning 400g', 1, 265.00, 662.50),
      ('Maggi Chicken Seasoning 400g', 2, 274.00, 685.00),
      ('Maggi Chicken Seasoning 400g', 3, 284.00, 710.00),
      ('Grace Kidney Beans 400g', 1, 172.00, 430.00),
      ('Grace Kidney Beans 400g', 2, 178.00, 445.00),
      ('Grace Kidney Beans 400g', 3, 185.00, 462.50),
      ('Petrol 87', 1, 174.32, 174.32),
      ('Petrol 87', 2, 176.95, 176.95),
      ('Petrol 87', 3, 178.40, 178.40),
      ('Petrol 90', 1, 186.75, 186.75),
      ('Petrol 90', 2, 188.20, 188.20),
      ('Petrol 90', 3, 190.10, 190.10),
      ('Diesel', 1, 168.55, 168.55),
      ('Diesel', 2, 170.25, 170.25),
      ('Diesel', 3, 171.80, 171.80)
  ) AS seed(canonical_name, store_slot, price, unit_price)
),
resolved_products AS (
  SELECT
    p.id AS product_id,
    p.canonical_name
  FROM public.products p
  INNER JOIN (
    SELECT DISTINCT canonical_name
    FROM product_prices
  ) requested_products
    ON requested_products.canonical_name = p.canonical_name
)
INSERT INTO public.prices (
  product_id,
  store_id,
  price,
  unit_price,
  currency,
  date_recorded,
  confidence_score,
  is_synthetic
)
SELECT
  rp.product_id,
  ss.id AS store_id,
  pp.price,
  pp.unit_price,
  'JMD',
  CURRENT_DATE,
  1,
  TRUE
FROM product_prices pp
INNER JOIN resolved_products rp
  ON rp.canonical_name = pp.canonical_name
INNER JOIN selected_stores ss
  ON ss.store_slot = pp.store_slot
WHERE NOT EXISTS (
  SELECT 1
  FROM public.prices existing
  WHERE existing.product_id = rp.product_id
    AND existing.store_id = ss.id
    AND existing.is_synthetic = TRUE
    AND existing.date_recorded = CURRENT_DATE
);
