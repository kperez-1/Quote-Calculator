# Quote Calculator — Business Logic Specification
**Allied Trucking of Palm Beach**
**Version 1.0**

---

## Overview

This calculator is used by sales to build all-in quoted prices for
aggregate material delivery jobs. A quote may include hauling only,
material only, or both combined into a single all-in rate.

The reference implementation is a standalone PWA (Progressive Web App)
hosted on GitHub Pages. This spec documents the business rules so the
logic can be integrated into the TMS quote builder as a line-item
calculator.

---

## Units of Measure

Each quote is priced per one of the following units:

| Value | Label |
|-------|-------|
| `ton` | Per ton |
| `cy` | Per cubic yard (CY) |
| `load` | Per load |

The unit applies to all line items in the quote.

---

## Hauling

### Broker Fee

**All haul costs carry an automatic 10% broker fee.**

When a haul cost is entered, the 10% fee is deducted before any
additional margin is applied. The fee is retained as base margin.

| Term | Formula |
|------|---------|
| Broker kept | `haulCost × 0.10` |
| Net payout to truck | `haulCost × 0.90` |

### Haul Sell Rate

Additional margin is applied on top of the net payout using the
**gross margin method** (margin as % of sell, not cost):

```
haulSell = netPayout / (1 - additionalMargin%)
```

**Example:**
- Haul cost entered: $100
- Broker kept: $10 | Net payout: $90
- Additional margin: 10%
- Sell = $90 / (1 - 0.10) = $90 / 0.90 = **$100.00**

At 10% additional margin, sell equals the raw haul cost entered.
This is intentional — the broker fee covers the 10% margin.

**Example 2:**
- Haul cost: $100 | Net payout: $90
- Additional margin: 20%
- Sell = $90 / 0.80 = **$112.50**

### Total Haul Margin

The total margin % displayed includes both the broker fee and
additional margin, calculated against the sell price:

```
totalMarginPct = ((haulSell - netPayout) / haulSell) × 100
```

---

## Material

### Tax

Tax applies to material only — never to hauling.

Tax is a **pass-through collected at the sell side**, not added to
the cost basis. The customer is charged tax on the sell rate, and
since the sell rate is higher than the cost, the tax collected from
the customer exceeds the tax paid at purchase — covering the tax
liability automatically.

```
matSell        = matCost / (1 - margin%)
customerPrice  = matSell × (1 + taxRate%)
```

Tax is never added to cost before calculating margin.

Default tax rate: **6.5%**

Materials can be flagged as tax-exempt (e.g. aggregate sold for
resale). When tax-exempt, `taxRate = 0` and `customerPrice = matSell`.

### Material Sell Rate

Margin is applied to raw cost using the gross margin method:

```
matSell = matCost / (1 - margin%)
```

**Example:**
- Material cost: $85 | Margin: 15%
- Sell = $85 / 0.85 = **$100.00**
- Tax (6.5%) collected from customer = $100.00 × 1.065 = **$106.50**
- Your margin is calculated on $85 cost vs $100 sell — tax is separate

Default material margin: **15%**

---

## All-In Price (Margin-Based Mode)

When both hauling and material are present, the all-in quoted price
is the sum of haul sell and material sell, then rounded:

```
rawTotal = haulSell + matSell
allIn = round(rawTotal, increment, direction)
```

If material cost is empty, the quote is haul-only.
If haul cost is empty, the quote is material-only.

### Rounding Options

| Button | Increment | Direction |
|--------|-----------|-----------|
| +$0.50 | $0.50 | Up |
| +$1.00 | $1.00 | Up |
| −$0.50 | $0.50 | Down |
| −$1.00 | $1.00 | Down |

Round up protects margin. Round down is used to hit a cleaner
competitive number when the raw total is just above a round figure.

---

## Target Price Mode

Instead of building up from cost + margin, the user enters the
desired all-in customer price and the calculator shows the implied
margin.

```
marginDollar = targetPrice - combinedCost
marginPct    = (marginDollar / targetPrice) × 100
```

Where `combinedCost = netHaulPayout + taxedMatCost`.

**Warning:** If `targetPrice < combinedCost`, the quote is below
cost and must be flagged in the UI as unachievable.

---

## Margin Table

The UI displays a summary grid after calculation:

|  | Cost | Sell | Margin $ | Margin % |
|--|------|------|----------|----------|
| **Haul** (after broker) | netPayout | haulSell | haulSell − netPayout | % of haulSell |
| **Material** | taxedCost | matSell | matSell − taxedCost | % of matSell |
| **Combined** | netPayout + taxedCost | allIn | allIn − combinedCost | % of allIn |

The haul cost column displays **net payout after broker fee** with
a label making this clear. This is the true cost basis for margin
calculation, not the gross amount paid to the truck.

---

## Output Scripts

### Internal Script
Used for sharing full cost and sell detail with team members.
Contains: date, customer, unit, haul cost + sell, material cost + sell,
all-in quoted price.
**Does not contain margin percentages** — for internal use only.

### Customer-Facing Script
A clean message showing only the all-in rate.
Contains: greeting, all-in price, unit, all-inclusive statement.
**No costs, no margins, no breakdown** — safe to forward directly.

Signed: *Allied Trucking of Palm Beach*

---

## Constants

| Constant | Value | Notes |
|----------|-------|-------|
| `BROKER_FEE` | 10% | Applied to all haul costs |
| Default tax rate | 6.5% | Overridable per line item |
| Default haul margin | 10% (additional) | On top of broker fee |
| Default material margin | 15% | |
| Default rounding | +$1.00 | Round up to nearest dollar |

---

## Integration Notes

- The JS module (`quote-calculator.js`) exports pure functions with
  no UI dependencies. It can be imported directly into any frontend
  framework (React, Vue, Angular) or ported to C# / Python for
  server-side calculation.
- All margin calculations use **gross margin** (% of sell), not
  markup (% of cost). This is standard in distribution/logistics.
- The broker fee is a business rule, not a user input. It should be
  stored as a system constant, not editable per quote.
- For PostgreSQL storage, the recommended quote record includes:
  `customer`, `date`, `unit`, `haul_cost`, `haul_sell`,
  `mat_cost`, `mat_sell`, `tax_rate`, `mat_margin_pct`,
  `haul_additional_margin_pct`, `all_in_price`, `mode`,
  `rounding_increment`, `rounding_direction`, `notes`