let allOrders = [];
let filteredOrders = [];
let currentPage = 1;
const ordersPerPage = 25;

async function fetchAllOrders() {
    const loadingEl = document.getElementById('loading');
    loadingEl.style.display = 'block';
    
    try {
        const response = await fetch('/api/orders');
        
        if (!response.ok) {
            throw new Error(`Failed to fetch orders: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Filter out deleted orders and sort by date (newest first)
        allOrders = (data.orders || [])
            .filter(order => order.status !== 'Deleted')
            .sort((a, b) => {
                const dateA = new Date(a.payment?.paidAt || a.createdAt || 0);
                const dateB = new Date(b.payment?.paidAt || b.createdAt || 0);
                return dateB - dateA; // Sort descending (newest first)
            });
        filteredOrders = [...allOrders];
        
        populateProductFilter();
        updateStatistics();
        displayOrders();
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        showError('Er is een fout opgetreden bij het ophalen van de bestellingen.');
    } finally {
        loadingEl.style.display = 'none';
    }
}

function populateProductFilter() {
    const productSet = new Set();
    
    allOrders.forEach(order => {
        if (order.data && order.data.cart && order.data.cart.items) {
            order.data.cart.items.forEach(item => {
                if (item.product && item.product.name) {
                    productSet.add(item.product.name);
                }
            });
        }
    });
    
    const productFilter = document.getElementById('productFilter');
    productFilter.innerHTML = '<option value="">Alle Producten</option>';
    
    Array.from(productSet).sort().forEach(product => {
        const option = document.createElement('option');
        option.value = product;
        option.textContent = product;
        productFilter.appendChild(option);
    });
}

function updateStatistics() {
    const totalOrders = filteredOrders.length;
    const totalRevenue = filteredOrders.reduce((sum, order) => {
        const price = order.payment?.price || 0;
        return sum + price;
    }, 0);
    
    const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    document.getElementById('totalOrders').textContent = totalOrders.toLocaleString('nl-NL');
    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('avgOrder').textContent = formatCurrency(avgOrder);
}

function formatCurrency(cents) {
    return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR'
    }).format(cents / 100);
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getStatusBadge(status) {
    const statusMap = {
        'Paid': 'status-paid',
        'Succeeded': 'status-succeeded',
        'Deleted': 'status-deleted',
        'Pending': 'status-pending'
    };
    
    const statusText = {
        'Paid': 'Betaald',
        'Succeeded': 'Succesvol',
        'Deleted': 'Verwijderd',
        'Pending': 'In afwachting'
    };
    
    const className = statusMap[status] || 'status-pending';
    const text = statusText[status] || status;
    
    return `<span class="status-badge ${className}">${text}</span>`;
}

function displayOrders() {
    const tbody = document.getElementById('ordersBody');
    tbody.innerHTML = '';
    
    if (filteredOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">Geen bestellingen gevonden</td></tr>';
        return;
    }
    
    const startIndex = (currentPage - 1) * ordersPerPage;
    const endIndex = Math.min(startIndex + ordersPerPage, filteredOrders.length);
    const pageOrders = filteredOrders.slice(startIndex, endIndex);
    
    pageOrders.forEach(order => {
        const row = document.createElement('tr');
        
        let productInfo = '-';
        let quantity = 0;
        
        if (order.data && order.data.cart && order.data.cart.items) {
            const products = order.data.cart.items.map(item => {
                quantity += item.amount || 0;
                return item.product?.name || 'Onbekend product';
            });
            productInfo = products.join(', ');
        }
        
        // Extract customer info
        const customer = order.data?.customer || {};
        const firstName = customer.firstName || '';
        const lastName = customer.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || '-';
        const phone = customer.phone || '-';
        const email = customer.email || '-';
        
        const paymentMethod = order.payment?.method || order.data?.paymentMethod || '-';
        const price = order.payment?.price || 0;
        const orderDate = order.payment?.paidAt || order.createdAt;
        
        row.innerHTML = `
            <td>#${order.number || '-'}</td>
            <td>${formatDate(orderDate)}</td>
            <td>${fullName}</td>
            <td>${phone}</td>
            <td>${productInfo}</td>
            <td>${quantity}</td>
            <td>${formatCurrency(price)}</td>
            <td>${email}</td>
            <td>${paymentMethod}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    updatePagination();
}

function updatePagination() {
    const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
    
    document.getElementById('pageInfo').textContent = `Pagina ${currentPage} van ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

function filterOrders() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const productFilter = document.getElementById('productFilter').value;
    
    filteredOrders = allOrders.filter(order => {
        let matchesSearch = true;
        let matchesProduct = true;
        
        if (searchTerm) {
            const orderNumber = order.number?.toString() || '';
            const products = order.data?.cart?.items?.map(item => 
                item.product?.name?.toLowerCase() || ''
            ).join(' ') || '';
            const customer = order.data?.customer || {};
            const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase();
            const phone = customer.phone?.toLowerCase() || '';
            const email = customer.email?.toLowerCase() || '';
            
            matchesSearch = orderNumber.includes(searchTerm) || 
                           products.includes(searchTerm) ||
                           fullName.includes(searchTerm) ||
                           phone.includes(searchTerm) ||
                           email.includes(searchTerm);
        }
        
        if (productFilter) {
            matchesProduct = order.data?.cart?.items?.some(item => 
                item.product?.name === productFilter
            ) || false;
        }
        
        return matchesSearch && matchesProduct;
    });
    
    currentPage = 1;
    updateStatistics();
    displayOrders();
}

function showError(message) {
    const container = document.querySelector('.container');
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    container.insertBefore(errorEl, container.firstChild.nextSibling);
    
    setTimeout(() => {
        errorEl.remove();
    }, 5000);
}

document.getElementById('searchInput').addEventListener('input', filterOrders);
document.getElementById('productFilter').addEventListener('change', filterOrders);

document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        displayOrders();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        displayOrders();
    }
});

fetchAllOrders();