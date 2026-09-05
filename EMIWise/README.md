# EMIWise — Smart Loan Planning and EMI Management Platform

**Plan Smarter. Borrow Better.**

EMIWise is a single-page website that helps people understand the real cost of a loan before they take one — EMI calculation, loan comparison, amortization, prepayment simulation, and affordability analysis, all in one place. Built as an MBA Finance project.

> Rates and examples shown on EMIWise are for educational/demo purposes only and should not be considered financial advice or current lender offers.

## Features

- **EMI Calculator** — monthly EMI, total principal, total interest, and total repayment using the standard reducing-balance formula.
- **Compare Loans** — add multiple loan offers, see them side by side, and get an automatic "cheaper loan" verdict with interest/EMI difference.
- **Amortization Schedule** — full monthly or yearly breakdown of every payment, with search, pagination, and CSV export.
- **Prepayment Simulator** — see how an extra monthly payment shortens your loan and how much interest it saves.
- **Affordability Calculator** — a simple debt-to-income check with an Affordable / Moderate / High Burden verdict.
- **Interactive Dashboard** — KPI cards and live charts (Chart.js) that update as you change the EMI Calculator inputs.
- **Loan Types** — illustrative rate ranges and tenures for Home, Car, Personal, and Education loans.
- **Understand Your Loan** — plain-language explanations of EMI, amortization, reducing balance, debt-to-income, and more.

## Technologies used

- HTML5, CSS3, vanilla JavaScript (no framework, no build step)
- [Chart.js](https://www.chartjs.org/) (loaded from a CDN) for charts
- Google Fonts (Inter, Poppins)

## Project structure

```
EMIWise/
├── index.html          Page structure and content for every section
├── css/
│   └── style.css       All styling (colors, layout, responsiveness)
├── js/
│   └── script.js       All EMI/loan math, validation, tables, charts
├── assets/             (reserved for any images/icons you add later)
└── README.md
```

## How to run locally

No installation is required — it's a plain static website.

1. Unzip the project.
2. Double-click `index.html` to open it in your browser.

That's it. If your browser blocks anything (rare, usually only affects some Chart.js CDN loads on `file://`), you can instead serve it locally:

- **VS Code**: install the "Live Server" extension, right-click `index.html` → "Open with Live Server".
- **Python** (if installed): open a terminal in the project folder and run `python3 -m http.server`, then visit `http://localhost:8000`.

## How the EMI calculation works

EMIWise uses the standard **reducing-balance EMI formula**:

```
EMI = P × r × (1 + r)^n / ((1 + r)^n − 1)
```

- `P` = principal (loan amount)
- `r` = monthly interest rate = (annual rate ÷ 12) ÷ 100
- `n` = number of monthly instalments (tenure in months)

Each month, interest is charged only on the **remaining balance**, not the original loan amount — so the interest portion of your EMI shrinks over time while the principal portion grows. This is implemented in `buildAmortization()` in `js/script.js`, one month at a time. A zero interest rate is handled separately as a straight-line split (`P / n`).

**Worked example** (used to verify the calculator): ₹10,00,000 at 9% for 5 years → EMI ≈ **₹20,758**, total interest ≈ **₹2.45 Lakh**.

## Deploying on GitHub Pages

1. Create a new repository on GitHub (e.g. `emiwise`).
2. Upload the contents of this folder (`index.html`, `css/`, `js/`, `README.md`) to the repository — make sure `index.html` sits at the **root** of the repo, not inside a subfolder.
3. Go to your repository's **Settings → Pages**.
4. Under "Build and deployment", set **Source** to "Deploy from a branch", choose the `main` branch and `/ (root)` folder, then click **Save**.
5. Wait a minute, then open the URL GitHub gives you (usually `https://<your-username>.github.io/emiwise/`).

No build step is required — it's static HTML/CSS/JS, so it works as-is on GitHub Pages, Netlify, or Vercel (for Netlify/Vercel, just point them at this same folder with no build command).

## Future improvements

- Save/load loan scenarios (e.g. using browser local storage)
- Add more loan types and region-specific tax benefit notes
- Support multiple currencies
- Add a printable/PDF loan summary

## Disclaimer

Rates and examples shown on EMIWise are for educational/demo purposes only and should not be considered financial advice or current lender offers. The affordability check is a simple rule-based estimate, not professional financial guidance.
