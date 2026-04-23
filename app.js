let allOrders = [];
let filteredOrders = [];
let uniqueFields = new Map(); // Map to store unique field names and their display names

async function fetchAllOrders() {
    const loadingEl = document.getElementById('loading');
    loadingEl.style.display = 'block';
    
    console.log('Starting to fetch orders...');
    
    try {
        const response = await fetch('/api/orders');
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (!response.ok) {
            console.error('Response not OK:', response.status, response.statusText);
            throw new Error(`Failed to fetch orders: ${response.status}`);
        }

        const data = await response.json();
        console.log('Data received:', data);
        console.log('Number of orders received:', data.orders?.length || 0);
        
        if (data.error) {
            console.error('API returned error:', data.error);
            throw new Error(data.error);
        }
        
        // Filter out deleted orders and sort by date (newest first)
        const beforeFilter = data.orders?.length || 0;
        allOrders = (data.orders || [])
            .filter(order => order.status !== 'Deleted')
            .sort((a, b) => {
                const dateA = new Date(a.payment?.paidAt || a.createdAt || 0);
                const dateB = new Date(b.payment?.paidAt || b.createdAt || 0);
                return dateB - dateA; // Sort descending (newest first)
            });
        
        console.log(`Filtered ${beforeFilter - allOrders.length} deleted orders`);
        console.log('Total orders after filtering:', allOrders.length);
        
        // Extract all unique field names
        extractUniqueFields();
        
        filteredOrders = [...allOrders];
        
        populateProductFilter();
        updateStatistics();
        // Rebuild table headers with dynamic fields
        buildTableHeaders();
        displayOrders();
        
        console.log('Orders loaded and displayed successfully');
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        console.error('Error stack:', error.stack);
        showError('Er is een fout opgetreden bij het ophalen van de tickets.');
    } finally {
        loadingEl.style.display = 'none';
    }
}

// Extract all unique field names from all orders
function extractUniqueFields() {
    uniqueFields.clear();
    
    allOrders.forEach(order => {
        // Check order-level field answers
        if (order.data?.fieldAnswers && Array.isArray(order.data.fieldAnswers)) {
            order.data.fieldAnswers.forEach(fieldAnswer => {
                if (fieldAnswer.field?.name) {
                    const fieldName = fieldAnswer.field.name;
                    // Use field name as key so same questions share columns
                    if (!uniqueFields.has(fieldName)) {
                        uniqueFields.set(fieldName, fieldName);
                    }
                }
            });
        }
        
        // Check item-level field answers
        if (order.data?.cart?.items) {
            order.data.cart.items.forEach(item => {
                if (item.fieldAnswers && Array.isArray(item.fieldAnswers)) {
                    item.fieldAnswers.forEach(fieldAnswer => {
                        if (fieldAnswer.field?.name) {
                            const fieldName = fieldAnswer.field.name;
                            // Use field name as key so same questions share columns
                            if (!uniqueFields.has(fieldName)) {
                                uniqueFields.set(fieldName, fieldName);
                            }
                        }
                    });
                }
            });
        }
    });
    
    console.log('Unique field names found:', Array.from(uniqueFields.keys()));
}

// Build table headers dynamically
function buildTableHeaders() {
    const thead = document.querySelector('#ordersTable thead tr');
    
    // Clear existing headers
    thead.innerHTML = '';
    
    // Add static columns
    const staticHeaders = ['Datum', 'Evenement', 'Bedrag', 'Naam', 'E-mail', 'Telefoon'];
    staticHeaders.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        thead.appendChild(th);
    });
    
    // Add dynamic field columns
    uniqueFields.forEach((displayName, fieldKey) => {
        const th = document.createElement('th');
        th.textContent = displayName;
        thead.appendChild(th);
    });
}

function populateProductFilter() {
    try {
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
        
        console.log('Unique products found:', Array.from(productSet));
        
        const productFilter = document.getElementById('productFilter');
        productFilter.innerHTML = '<option value="">Alle Evenementen</option>';
        
        Array.from(productSet).sort().forEach(product => {
            const option = document.createElement('option');
            option.value = product;
            option.textContent = product;
            productFilter.appendChild(option);
        });
        
        console.log('Product filter populated with', productSet.size, 'products');
    } catch (error) {
        console.error('Error populating product filter:', error);
    }
}

function updateStatistics() {
    try {
        const totalOrders = filteredOrders.length;
        const totalRevenue = filteredOrders.reduce((sum, order) => {
            const price = order.payment?.price || 0;
            return sum + price;
        }, 0);
        
        document.getElementById('totalOrders').textContent = totalOrders.toLocaleString('nl-NL');
        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
        
        console.log('Statistics updated - Orders:', totalOrders, 'Revenue:', formatCurrency(totalRevenue));
    } catch (error) {
        console.error('Error updating statistics:', error);
    }
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
    try {
        const tbody = document.getElementById('ordersBody');
        tbody.innerHTML = '';
        
        console.log('Displaying', filteredOrders.length, 'orders');
        
        if (filteredOrders.length === 0) {
            const colspan = 6 + uniqueFields.size; // Static columns + dynamic field columns (removed Aantal)
            tbody.innerHTML = `<tr><td colspan="${colspan}" class="no-data">Geen bestellingen gevonden</td></tr>`;
            console.log('No orders to display');
            return;
        }
        
        filteredOrders.forEach((order, index) => {
            try {
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
        
        // Helper function to extract value from field answer
        const extractValue = (value) => {
            if (!value) return null;
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
            if (value.value !== undefined) return extractValue(value.value);
            if (value.text !== undefined) return value.text;
            if (value.name !== undefined) return value.name;
            if (Array.isArray(value)) {
                return value.map(v => extractValue(v)).filter(v => v).join(', ');
            }
            if (typeof value === 'object') {
                // Try common field names
                if (value.answer) return extractValue(value.answer);
                if (value.selected) return extractValue(value.selected);
                if (value.choice) return extractValue(value.choice);
                // Log the object to see its structure
                console.log('Unknown field answer structure:', value);
            }
            return null;
        };
        
        // Collect field values for this order
        const fieldValues = new Map();
        
        // Initialize all fields with '-'
        uniqueFields.forEach((displayName, fieldName) => {
            fieldValues.set(fieldName, '-');
        });
        
        // Check for field answers at order level
        if (order.data?.fieldAnswers && Array.isArray(order.data.fieldAnswers)) {
            order.data.fieldAnswers.forEach(fieldAnswer => {
                if (fieldAnswer.field?.name && fieldAnswer.answer !== undefined) {
                    const fieldName = fieldAnswer.field.name;
                    const extracted = extractValue(fieldAnswer.answer);
                    if (extracted && uniqueFields.has(fieldName)) {
                        // If multiple answers for same field name, concatenate
                        const existing = fieldValues.get(fieldName);
                        if (existing && existing !== '-') {
                            fieldValues.set(fieldName, `${existing}, ${extracted}`);
                        } else {
                            fieldValues.set(fieldName, extracted);
                        }
                    }
                }
            });
        }
        
        // Check for field answers in cart items
        if (order.data?.cart?.items) {
            order.data.cart.items.forEach(item => {
                if (item.fieldAnswers && Array.isArray(item.fieldAnswers)) {
                    item.fieldAnswers.forEach(fieldAnswer => {
                        if (fieldAnswer.field?.name && fieldAnswer.answer !== undefined) {
                            const fieldName = fieldAnswer.field.name;
                            const extracted = extractValue(fieldAnswer.answer);
                            if (extracted && uniqueFields.has(fieldName)) {
                                // If multiple items have the same field, concatenate values
                                const existing = fieldValues.get(fieldName);
                                if (existing && existing !== '-') {
                                    fieldValues.set(fieldName, `${existing}, ${extracted}`);
                                } else {
                                    fieldValues.set(fieldName, extracted);
                                }
                            }
                        }
                    });
                }
            });
        }
        
        const price = order.payment?.price || 0;
        const orderDate = order.payment?.paidAt || order.createdAt;
        
        // Create clickable email link
        const emailLink = email !== '-' ? `<a href="mailto:${email}">${email}</a>` : '-';
        
        // Create clickable phone link (remove spaces and special chars for tel: link)
        const cleanPhone = phone.replace(/[^\d+]/g, '');
        const phoneLink = phone !== '-' && cleanPhone ? `<a href="tel:${cleanPhone}">${phone}</a>` : phone;
        
        // Build row HTML with static columns first (bedrag as 3rd column)
        let rowHTML = `
            <td>${formatDate(orderDate)}</td>
            <td>${productInfo}</td>
            <td>${formatCurrency(price)}</td>
            <td>${fullName}</td>
            <td>${emailLink}</td>
            <td>${phoneLink}</td>
        `;
        
        // Add dynamic field columns in the same order as headers
        uniqueFields.forEach((displayName, fieldKey) => {
            const value = fieldValues.get(fieldKey) || '-';
            rowHTML += `<td title="${value.replace(/"/g, '&quot;')}">${value}</td>`;
        });
        
        row.innerHTML = rowHTML;
        
                tbody.appendChild(row);
            } catch (orderError) {
                console.error(`Error processing order ${index}:`, order, orderError);
            }
        });
        
        console.log('Orders display completed');
    } catch (error) {
        console.error('Error displaying orders:', error);
    }
}

function filterOrders() {
    try {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const productFilter = document.getElementById('productFilter').value;
        
        console.log('Filtering with search:', searchTerm, 'product:', productFilter);
        
        const beforeCount = filteredOrders.length;
        
        filteredOrders = allOrders.filter(order => {
        let matchesSearch = true;
        let matchesProduct = true;
        
        if (searchTerm) {
            const products = order.data?.cart?.items?.map(item => 
                item.product?.name?.toLowerCase() || ''
            ).join(' ') || '';
            const customer = order.data?.customer || {};
            const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase();
            const phone = customer.phone?.toLowerCase() || '';
            const email = customer.email?.toLowerCase() || '';
            
            matchesSearch = products.includes(searchTerm) ||
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
    
        console.log(`Filtered from ${beforeCount} to ${filteredOrders.length} orders`);
        
        updateStatistics();
        buildTableHeaders(); // Rebuild headers in case fields change
        displayOrders();
    } catch (error) {
        console.error('Error filtering orders:', error);
    }
}

function showError(message) {
    console.error('Showing error message:', message);
    
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

function exportToExcel() {
    try {
        console.log('Starting Excel export...');
        
        // Create CSV header with static columns (Bedrag as 3rd column)
        let headers = ['Datum', 'Evenement', 'Bedrag', 'Naam', 'E-mail', 'Telefoon'];
        
        // Add dynamic field columns with their names
        uniqueFields.forEach((displayName, fieldName) => {
            headers.push(fieldName);
        });
        
        let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
        
        filteredOrders.forEach(order => {
            // Extract data
            let productInfo = '-';
            let quantity = 0;
            
            if (order.data && order.data.cart && order.data.cart.items) {
                const products = order.data.cart.items.map(item => {
                    quantity += item.amount || 0;
                    return item.product?.name || 'Onbekend product';
                });
                productInfo = products.join(', ');
            }
            
            const customer = order.data?.customer || {};
            const firstName = customer.firstName || '';
            const lastName = customer.lastName || '';
            const fullName = `${firstName} ${lastName}`.trim() || '-';
            const phone = customer.phone || '-';
            const email = customer.email || '-';
            
            // Helper function to extract value from field answer
            const extractValue = (value) => {
                if (!value) return null;
                if (typeof value === 'string') return value;
                if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
                if (value.value !== undefined) return extractValue(value.value);
                if (value.text !== undefined) return value.text;
                if (value.name !== undefined) return value.name;
                if (Array.isArray(value)) {
                    return value.map(v => extractValue(v)).filter(v => v).join(', ');
                }
                if (typeof value === 'object') {
                    if (value.answer) return extractValue(value.answer);
                    if (value.selected) return extractValue(value.selected);
                    if (value.choice) return extractValue(value.choice);
                }
                return null;
            };
            
            // Collect field values for this order
            const fieldValues = new Map();
            
            // Initialize all fields with '-'
            uniqueFields.forEach((displayName, fieldName) => {
                fieldValues.set(fieldName, '-');
            });
            
            // Extract field values from order level
            if (order.data?.fieldAnswers && Array.isArray(order.data.fieldAnswers)) {
                order.data.fieldAnswers.forEach(fieldAnswer => {
                    if (fieldAnswer.field?.name && fieldAnswer.answer !== undefined) {
                        const fieldName = fieldAnswer.field.name;
                        const extracted = extractValue(fieldAnswer.answer);
                        if (extracted && uniqueFields.has(fieldName)) {
                            const existing = fieldValues.get(fieldName);
                            if (existing && existing !== '-') {
                                fieldValues.set(fieldName, `${existing}, ${extracted}`);
                            } else {
                                fieldValues.set(fieldName, extracted);
                            }
                        }
                    }
                });
            }
            
            // Extract field values from cart items
            if (order.data?.cart?.items) {
                order.data.cart.items.forEach(item => {
                    if (item.fieldAnswers && Array.isArray(item.fieldAnswers)) {
                        item.fieldAnswers.forEach(fieldAnswer => {
                            if (fieldAnswer.field?.name && fieldAnswer.answer !== undefined) {
                                const fieldName = fieldAnswer.field.name;
                                const extracted = extractValue(fieldAnswer.answer);
                                if (extracted && uniqueFields.has(fieldName)) {
                                    const existing = fieldValues.get(fieldName);
                                    if (existing && existing !== '-') {
                                        fieldValues.set(fieldName, `${existing}, ${extracted}`);
                                    } else {
                                        fieldValues.set(fieldName, extracted);
                                    }
                                }
                            }
                        });
                    }
                });
            }
            
            const price = order.payment?.price || 0;
            const orderDate = order.payment?.paidAt || order.createdAt;
            
            // Format date for Excel
            const date = orderDate ? new Date(orderDate).toLocaleString('nl-NL') : '-';
            const amount = formatCurrency(price);
            
            // Build CSV row with static columns - all fields need quotes (Bedrag as 3rd column)
            const rowData = [
                `"${date}"`,
                `"${productInfo.replace(/"/g, '""')}"`,
                `"${amount}"`,
                `"${fullName.replace(/"/g, '""')}"`,
                `"${email}"`,
                `"${phone}"`
            ];
            
            // Add dynamic field values
            uniqueFields.forEach((displayName, fieldKey) => {
                const value = fieldValues.get(fieldKey) || '-';
                rowData.push(`"${value.replace(/"/g, '""')}"`);
            });
            
            csvContent += rowData.join(',') + '\n';
        });
        
        // Create blob with BOM for Excel to recognize UTF-8
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        
        // Generate filename with current date
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        link.setAttribute('download', `Sport4Change_Ticketverkoop_${dateStr}.csv`);
        
        // Trigger download
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`Exported ${filteredOrders.length} orders to Excel`);
        
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showError('Er is een fout opgetreden bij het exporteren naar Excel.');
    }
}

// Function to handle search input changes
function handleSearchInput() {
    const searchInput = document.getElementById('searchInput');
    const searchWrapper = searchInput.parentElement;
    
    if (searchInput.value) {
        searchWrapper.classList.add('has-text');
    } else {
        searchWrapper.classList.remove('has-text');
    }
    
    filterOrders();
}

// Function to clear search
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchWrapper = searchInput.parentElement;
    
    searchInput.value = '';
    searchWrapper.classList.remove('has-text');
    filterOrders();
    searchInput.focus();
}

// Add event listeners with error handling
try {
    document.getElementById('searchInput').addEventListener('input', handleSearchInput);
    document.getElementById('clearSearch').addEventListener('click', clearSearch);
    document.getElementById('productFilter').addEventListener('change', filterOrders);
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
    console.log('Event listeners attached successfully');
} catch (error) {
    console.error('Error attaching event listeners:', error);
}

// Start fetching orders
console.log('App initialized, fetching orders...');
fetchAllOrders();