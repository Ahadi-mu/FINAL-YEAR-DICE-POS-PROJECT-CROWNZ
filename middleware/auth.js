// middleware/auth.js

const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in to continue.');
  res.redirect('/auth/login');
};

const isDirector = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'director') return next();
  req.flash('error', 'Access denied. Directors only.');
  res.redirect('/dashboard');
};

const isManager = (req, res, next) => {
  if (req.session.user && ['director', 'manager'].includes(req.session.user.role)) return next();
  req.flash('error', 'Access denied. Managers only.');
  res.redirect('/dashboard');
};

const isSalesAgent = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'sales_agent') return next();
  req.flash('error', 'Access denied.');
  res.redirect('/dashboard');
};

const notSalesAgent = (req, res, next) => {
  if (req.session.user && req.session.user.role !== 'sales_agent') return next();
  req.flash('error', 'Access denied.');
  res.redirect('/dashboard');
};

module.exports = { isAuthenticated, isDirector, isManager, isSalesAgent, notSalesAgent };
