# CSRMS — Crown Stores Retail Management System

A full-stack Node.js web application for managing retail operations across multiple branches.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| View Engine | EJS |
| Database | PostgreSQL (via `pg`) |
| Auth | bcrypt + express-session + connect-pg-simple |
| Email | Nodemailer |
| PDF Export | PDFKit |
| Excel Export | ExcelJS |
| Styling | Custom CSS (no framework) |

## Roles & Permissions

| Feature | Director | Manager | Sales Agent |
|---------|----------|---------|-------------|
| Company Performance Report | ✅ | ❌ | ❌ |
| Branch Management | ✅ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ |
| Audit Logs | ✅ | ❌ | ❌ |
| System Maintenance | ✅ | ❌ | ❌ |
| Products / Categories | ✅ | ✅ | ❌ |
| Procurement | ✅ | ✅ | ❌ |
| Inventory Management | ✅ | ✅ | ❌ |
| Cashier Balancing | ✅ | ✅ | ❌ |
| Stock Alerts | ✅ | ✅ | ❌ |
| Daily/Inventory Reports | ✅ | ✅ | ❌ |
| Point of Sale (POS) | ❌ | ✅ | ✅ |
| Sales History | ✅ | ✅ | ✅ (own) |
| Receipt Download | ✅ | ✅ | ✅ |
| Bug Reports | ✅ | ✅ | ✅ |

## Prerequisites

- Node.js v18+
- PostgreSQL 14+
- A Gmail account (or SMTP server) for email features

## Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DB_*` — your PostgreSQL credentials
- `SESSION_SECRET` — any long random string
- `MAIL_*` — your email/SMTP settings
- `ADMIN_EMAIL` — email to receive bug reports

### 3. Create the database

```bash
createdb csrms_db
```

### 4. Run the schema

```bash
psql -d csrms_db -f config/schema.sql
```

Or via npm script:
```bash
npm run db:schema
```

### 5. Seed the default Director account

```bash
npm run db:seed
```

This creates:
- **Username:** `director`
- **Password:** `Admin@1234`
- ⚠️ Change this password immediately after first login via User Management.

### 6. Start the server

```bash
# Production
npm start

# Development (with auto-reload — requires nodemon)
npm run dev
```

Visit: **http://localhost:3000**

---

## Project Structure

```
csrms/
├── app.js                    # Express app entry point
├── config/
│   ├── database.js           # PostgreSQL pool
│   ├── mailer.js             # Nodemailer helpers
│   ├── schema.sql            # Full DB schema + seed settings
│   └── seed.js               # Seeds default director user
├── controllers/
│   ├── authController.js     # Login, logout, password reset
│   ├── dashboardController.js
│   ├── productsController.js # Products + barcodes
│   ├── inventoryController.js
│   ├── salesController.js    # POS, sale processing, receipts
│   ├── procurementController.js
│   ├── reportsController.js  # PDF + Excel exports
│   ├── usersController.js
│   └── miscController.js     # Categories, branches, suppliers,
│                             # cashier, notifications, audit, maintenance
├── middleware/
│   ├── auth.js               # isAuthenticated, role guards
│   └── audit.js              # auditLog helper
├── models/                   # (extend here for ORM if needed)
├── routes/
│   └── index.js              # All application routes
├── utils/
│   └── pdfGenerator.js       # Receipt PDF (80mm thermal format)
├── views/
│   ├── partials/             # header.ejs, footer.ejs, 404, error
│   ├── auth/                 # login, forgot-password, reset-password
│   ├── dashboard/            # director, manager, sales-agent
│   ├── categories/
│   ├── products/             # index, create, edit
│   ├── barcodes/
│   ├── suppliers/
│   ├── procurement/          # index, create, detail
│   ├── inventory/            # index, adjust, movements
│   ├── sales/                # pos, history
│   ├── receipts/             # view
│   ├── cashier/              # balancing
│   ├── reports/              # daily-sales, inventory, procurement, company
│   ├── notifications/        # alerts, bug-report
│   ├── users/                # index, create, edit
│   ├── branches/
│   └── maintenance/          # index (settings + bugs), audit-logs
└── public/
    ├── css/style.css
    └── js/main.js            # POS cart logic, sidebar toggle
```

## Key Features

### Point of Sale (POS)
- Live product search by name or barcode scan
- Cart management with quantity control
- Change calculation
- Automatic stock deduction on sale
- PDF receipt generation (80mm thermal format)

### Inventory Management
- Per-branch stock tracking
- Stock adjustments with audit trail
- Full movement history (procurement / sale / adjustment)
- Low stock & out-of-stock alerts with email notifications

### Procurement
- Multi-item procurement entry
- Auto-populates cost price from product catalogue
- Automatically updates branch inventory on save

### Reports & Exports
- Daily Sales Report → PDF export
- Inventory Report → Excel (.xlsx) with colour-coded stock status
- Procurement Report with date filtering
- Company Performance (Director): branch ranking, top products, top categories

### Cashier Balancing
- Manager reviews each agent's expected vs submitted cash
- Variance auto-calculated; flags shortages/surpluses
- Status: Pending → Approved / Flagged

### Security
- Password hashing with bcrypt (cost factor 12)
- Session stored in PostgreSQL (connect-pg-simple)
- Role-based access control on every route
- Full audit log of all actions (login, logout, CRUD)
- Password reset via time-limited email tokens

## Email Features (Nodemailer)

| Trigger | Recipient |
|---------|-----------|
| Low stock alert | Branch manager email |
| Bug report submitted | ADMIN_EMAIL |
| Password reset request | User's email |

## License

Developed as a final year project. All rights reserved.
# FINAL-YEAR-DICE-POS-PROJECT-CROWNZ
