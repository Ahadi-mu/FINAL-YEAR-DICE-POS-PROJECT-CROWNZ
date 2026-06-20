// public/js/main.js

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// Auto-dismiss alerts
document.addEventListener('DOMContentLoaded', () => {
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(a => {
    setTimeout(() => { a.style.opacity = '0'; a.style.transition = 'opacity 0.5s'; setTimeout(() => a.remove(), 500); }, 4000);
  });
});

// ─── POS Cart Logic ────────────────────────────────────────────────────────
let cart = [];

async function searchProduct(query) {
  if (!query || query.length < 2) return;
  try {
    const res = await fetch(`/sales/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const container = document.getElementById('search-results');
    if (!container) return;
    if (!data.products.length) {
      container.innerHTML = '<div class="product-result-item text-muted">No products found</div>';
      return;
    }
    container.innerHTML = data.products.map(p => `
      <div class="product-result-item" onclick="addToCart(${JSON.stringify(p).replace(/"/g, '&quot;')})">
        <div>
          <div style="font-weight:600">${p.product_name}</div>
          <div class="text-muted" style="font-size:12px">${p.category_name} · Stock: ${p.quantity_available}</div>
        </div>
        <div style="font-weight:700;color:var(--primary)">UGX ${Number(p.selling_price).toLocaleString()}</div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

function addToCart(product) {
  const existing = cart.find(i => i.product_id === product.id);
  if (existing) {
    if (existing.quantity >= product.quantity_available) {
      alert('Insufficient stock!'); return;
    }
    existing.quantity++;
  } else {
    cart.push({ product_id: product.id, product_name: product.product_name, unit_price: product.selling_price, quantity: 1, max_qty: product.quantity_available });
  }
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  renderCart();
}

function removeFromCart(index) { cart.splice(index, 1); renderCart(); }

function updateQty(index, val) {
  const qty = parseInt(val);
  if (qty < 1) { removeFromCart(index); return; }
  if (qty > cart[index].max_qty) { alert('Insufficient stock!'); return; }
  cart[index].quantity = qty;
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  if (!container) return;
  if (!cart.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>Cart is empty</p></div>';
    if (totalEl) totalEl.textContent = 'UGX 0';
    return;
  }
  const total = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  container.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <div>
        <div style="font-weight:500;font-size:13px">${item.product_name}</div>
        <div class="text-muted" style="font-size:11px">UGX ${Number(item.unit_price).toLocaleString()} each</div>
      </div>
      <input type="number" value="${item.quantity}" min="1" max="${item.max_qty}"
             onchange="updateQty(${idx}, this.value)" style="width:60px;padding:4px;text-align:center">
      <div style="text-align:right">
        <div style="font-weight:600">UGX ${Number(item.unit_price * item.quantity).toLocaleString()}</div>
        <button onclick="removeFromCart(${idx})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px">✕</button>
      </div>
    </div>
  `).join('');
  if (totalEl) totalEl.textContent = `UGX ${total.toLocaleString()}`;
}

async function processSale() {
  if (!cart.length) { alert('Cart is empty!'); return; }
  const amountPaid = parseFloat(document.getElementById('amount-paid')?.value || 0);
  const total = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  if (amountPaid < total) { alert('Amount paid is less than total!'); return; }

  try {
    const res = await fetch('/sales/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, amount_paid: amountPaid }),
    });
    const data = await res.json();
    if (data.success) {
      const change = amountPaid - total;
      if (confirm(`✅ Sale completed!\nReceipt: ${data.receiptNumber}\nTotal: UGX ${total.toLocaleString()}\nChange: UGX ${change.toLocaleString()}\n\nOpen receipt?`)) {
        window.open(`/sales/receipt/${data.saleId}`, '_blank');
      }
      cart = [];
      renderCart();
      document.getElementById('amount-paid').value = '';
    } else {
      alert('❌ Error: ' + data.message);
    }
  } catch (e) {
    alert('Server error. Please try again.');
  }
}

// Barcode scanner (Enter key on search)
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => searchProduct(e.target.value), 300);
    });
  }
});
