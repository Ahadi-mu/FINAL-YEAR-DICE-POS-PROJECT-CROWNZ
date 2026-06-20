// routes/index.js
const express = require('express');
const router = express.Router();
const { isAuthenticated, isDirector, isManager, notSalesAgent } = require('../middleware/auth');

// Controllers
const authCtrl = require('../controllers/authController');
const dashboardCtrl = require('../controllers/dashboardController');
const productsCtrl = require('../controllers/productsController');
const inventoryCtrl = require('../controllers/inventoryController');
const salesCtrl = require('../controllers/salesController');
const procurementCtrl = require('../controllers/procurementController');
const reportsCtrl = require('../controllers/reportsController');
const miscCtrl = require('../controllers/miscController');
const usersCtrl = require('../controllers/usersController');

// ─── Auth ────────────────────────────────────────────────────────────────────
router.get('/auth/login', authCtrl.getLogin);
router.post('/auth/login', authCtrl.postLogin);
router.get('/auth/logout', authCtrl.getLogout);
router.get('/auth/forgot-password', authCtrl.getForgotPassword);
router.post('/auth/forgot-password', authCtrl.postForgotPassword);
router.get('/auth/reset-password/:token', authCtrl.getResetPassword);
router.post('/auth/reset-password/:token', authCtrl.postResetPassword);

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/', isAuthenticated, (req, res) => res.redirect('/dashboard'));
router.get('/dashboard', isAuthenticated, dashboardCtrl.getDashboard);

// ─── Categories ──────────────────────────────────────────────────────────────
router.get('/categories', isAuthenticated, notSalesAgent, miscCtrl.getCategories);
router.post('/categories/create', isAuthenticated, isManager, miscCtrl.postCreateCategory);
router.post('/categories/edit/:id', isAuthenticated, isManager, miscCtrl.postEditCategory);
router.post('/categories/toggle/:id', isAuthenticated, isManager, miscCtrl.toggleCategoryStatus);

// ─── Products ────────────────────────────────────────────────────────────────
router.get('/products', isAuthenticated, notSalesAgent, productsCtrl.getProducts);
router.get('/products/create', isAuthenticated, isManager, productsCtrl.getCreateProduct);
router.post('/products/create', isAuthenticated, isManager, productsCtrl.postCreateProduct);
router.get('/products/edit/:id', isAuthenticated, isManager, productsCtrl.getEditProduct);
router.post('/products/edit/:id', isAuthenticated, isManager, productsCtrl.postEditProduct);
router.get('/products/:product_id/barcodes', isAuthenticated, notSalesAgent, productsCtrl.getBarcodes);
router.post('/products/:product_id/barcodes', isAuthenticated, isManager, productsCtrl.postAddBarcode);
router.post('/barcodes/delete/:id', isAuthenticated, isManager, productsCtrl.deleteBarcode);

// ─── Suppliers ───────────────────────────────────────────────────────────────
router.get('/suppliers', isAuthenticated, notSalesAgent, miscCtrl.getSuppliers);
router.post('/suppliers/create', isAuthenticated, isManager, miscCtrl.postCreateSupplier);
router.post('/suppliers/edit/:id', isAuthenticated, isManager, miscCtrl.postEditSupplier);

// ─── Procurement ─────────────────────────────────────────────────────────────
router.get('/procurement', isAuthenticated, isManager, procurementCtrl.getProcurements);
router.get('/procurement/create', isAuthenticated, isManager, procurementCtrl.getCreateProcurement);
router.post('/procurement/create', isAuthenticated, isManager, procurementCtrl.postCreateProcurement);
router.get('/procurement/:id', isAuthenticated, isManager, procurementCtrl.getProcurementDetail);

// ─── Inventory ───────────────────────────────────────────────────────────────
router.get('/inventory', isAuthenticated, notSalesAgent, inventoryCtrl.getInventory);
router.get('/inventory/adjust/:product_id', isAuthenticated, isManager, inventoryCtrl.getAdjustStock);
router.post('/inventory/adjust/:product_id', isAuthenticated, isManager, inventoryCtrl.postAdjustStock);
router.get('/inventory/movements', isAuthenticated, notSalesAgent, inventoryCtrl.getMovementHistory);

// ─── Sales (POS) ─────────────────────────────────────────────────────────────
router.get('/sales/pos', isAuthenticated, salesCtrl.getPOS);
router.get('/sales/search', isAuthenticated, salesCtrl.searchProduct);
router.post('/sales/process', isAuthenticated, salesCtrl.processSale);
router.get('/sales/history', isAuthenticated, salesCtrl.getSaleHistory);
router.get('/sales/receipt/:id', isAuthenticated, salesCtrl.getReceipt);
router.get('/sales/receipt/:id/pdf', isAuthenticated, salesCtrl.downloadReceiptPDF);

// ─── Cashier Balancing ───────────────────────────────────────────────────────
router.get('/cashier', isAuthenticated, isManager, miscCtrl.getCashierBalancing);
router.post('/cashier/approve', isAuthenticated, isManager, miscCtrl.postApproveBalance);

// ─── Reports ─────────────────────────────────────────────────────────────────
router.get('/reports/daily-sales', isAuthenticated, notSalesAgent, reportsCtrl.getDailySalesReport);
router.get('/reports/inventory', isAuthenticated, notSalesAgent, reportsCtrl.getInventoryReport);
router.get('/reports/procurement', isAuthenticated, notSalesAgent, reportsCtrl.getProcurementReport);
router.get('/reports/company', isAuthenticated, isDirector, reportsCtrl.getCompanyReport);
router.get('/reports/export/sales-pdf', isAuthenticated, notSalesAgent, reportsCtrl.exportSalesPDF);
router.get('/reports/export/inventory-excel', isAuthenticated, notSalesAgent, reportsCtrl.exportInventoryExcel);

// ─── Notifications ───────────────────────────────────────────────────────────
router.get('/notifications/alerts', isAuthenticated, isManager, miscCtrl.getLowStockAlerts);
router.get('/bug-report', isAuthenticated, miscCtrl.getBugReport);
router.post('/bug-report', isAuthenticated, miscCtrl.postBugReport);

// ─── Users (Director only) ───────────────────────────────────────────────────
router.get('/users', isAuthenticated, isDirector, usersCtrl.getUsers);
router.get('/users/create', isAuthenticated, isDirector, usersCtrl.getCreateUser);
router.post('/users/create', isAuthenticated, isDirector, usersCtrl.postCreateUser);
router.get('/users/edit/:id', isAuthenticated, isDirector, usersCtrl.getEditUser);
router.post('/users/edit/:id', isAuthenticated, isDirector, usersCtrl.postEditUser);

// ─── Branches ────────────────────────────────────────────────────────────────
router.get('/branches', isAuthenticated, isDirector, miscCtrl.getBranches);
router.post('/branches/create', isAuthenticated, isDirector, miscCtrl.postCreateBranch);
router.post('/branches/edit/:id', isAuthenticated, isDirector, miscCtrl.postEditBranch);

// ─── Maintenance & Audit (Director only) ─────────────────────────────────────
router.get('/maintenance', isAuthenticated, isDirector, miscCtrl.getMaintenance);
router.post('/maintenance/settings', isAuthenticated, isDirector, miscCtrl.postUpdateSettings);
router.post('/maintenance/bug/:id/status', isAuthenticated, isDirector, miscCtrl.postUpdateBugStatus);
router.get('/audit-logs', isAuthenticated, isDirector, miscCtrl.getAuditLogs);

module.exports = router;
