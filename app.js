let allOrders = [];
let filteredOrders = [];
let uniqueFields = new Map(); // Map to store unique field names and their display names
let eventFields = new Map(); // Map to track which fields belong to which events

// Check authentication and show content
async function verifyAuthAndInit() {
    const sessionToken = localStorage.getItem('sessionToken');
    const authPassword = localStorage.getItem('authPassword');
    
    if (!sessionToken || !authPassword) {
        window.location.href = '/login';
        return;
    }
    
    // Show the app immediately with loading state
    document.body.style.display = 'block';
    const loadingEl = document.getElementById('loading');
    loadingEl.style.display = 'block';
    loadingEl.textContent = 'Bestellingen laden...';
    
    // Set correct button visibility based on saved filter
    const savedEvent = localStorage.getItem('selectedEvent');
    const exportBtn = document.getElementById('exportBtn');
    const statsBtn = document.getElementById('statsBtn');
    
    if (savedEvent) {
        // Event is selected - show export button
        exportBtn.style.display = 'block';
        statsBtn.style.display = 'none';
    } else {
        // All events - show disabled stats button
        exportBtn.style.display = 'none';
        statsBtn.style.display = 'block';
        statsBtn.disabled = true;
    }
    
    // Verify with API call and load data
    try {
        const response = await fetch('/api/orders', {
            headers: {
                'Authorization': authPassword
            }
        });
        
        if (!response.ok) {
            console.error('Auth failed with status:', response.status);
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('authPassword');
            window.location.href = '/login';
            return;
        }
        
        // Process the data
        const data = await response.json();
        processOrderData(data);
        
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('authPassword');
        window.location.href = '/login';
    }
}

function processOrderData(data) {
    console.log('Data received:', data);
    console.log('Number of orders received:', data.orders?.length || 0);
    
    if (data.error) {
        console.error('API returned error:', data.error);
        showError('Er is een fout opgetreden bij het ophalen van de bestellingen.');
        return;
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
    
    // Apply saved filter after populating the dropdown
    const savedFilter = localStorage.getItem('selectedEvent');
    if (savedFilter) {
        // Trigger filtering with the saved value
        filterOrders();
    } else {
        // Hide export button initially when no event is selected
        const exportBtn = document.getElementById('exportBtn');
        exportBtn.style.display = 'none';
        
        updateStatistics();
        // Rebuild table headers with dynamic fields
        buildTableHeaders();
        displayOrders();
    }
    
    console.log('Orders loaded and displayed successfully');
    
    // Hide loading
    const loadingEl = document.getElementById('loading');
    loadingEl.style.display = 'none';
    
    // Enable statistics button after data is loaded
    const statsBtn = document.getElementById('statsBtn');
    if (statsBtn && !localStorage.getItem('selectedEvent')) {
        statsBtn.disabled = false;
    }
}


// Extract all unique field names from all orders
function extractUniqueFields() {
    uniqueFields.clear();
    eventFields.clear();
    
    // First, ensure all events are registered (even if they have no fields)
    allOrders.forEach(order => {
        if (order.data?.cart?.items) {
            order.data.cart.items.forEach(item => {
                if (item.product?.name) {
                    if (!eventFields.has(item.product.name)) {
                        eventFields.set(item.product.name, new Set());
                    }
                }
            });
        }
    });
    
    allOrders.forEach(order => {
        // Get event names for this order
        const eventNames = new Set();
        if (order.data?.cart?.items) {
            order.data.cart.items.forEach(item => {
                if (item.product?.name) {
                    eventNames.add(item.product.name);
                }
            });
        }
        
        // Check order-level field answers
        if (order.data?.fieldAnswers && Array.isArray(order.data.fieldAnswers)) {
            order.data.fieldAnswers.forEach(fieldAnswer => {
                if (fieldAnswer.field?.name) {
                    const fieldName = fieldAnswer.field.name;
                    // Use field name as key so same questions share columns
                    if (!uniqueFields.has(fieldName)) {
                        uniqueFields.set(fieldName, fieldName);
                    }
                    
                    // Track which events have this field
                    eventNames.forEach(eventName => {
                        if (eventFields.has(eventName)) {
                            eventFields.get(eventName).add(fieldName);
                        }
                    });
                }
            });
        }
        
        // Check item-level field answers
        if (order.data?.cart?.items) {
            order.data.cart.items.forEach(item => {
                const itemEventName = item.product?.name;
                if (item.fieldAnswers && Array.isArray(item.fieldAnswers)) {
                    item.fieldAnswers.forEach(fieldAnswer => {
                        if (fieldAnswer.field?.name) {
                            const fieldName = fieldAnswer.field.name;
                            // Use field name as key so same questions share columns
                            if (!uniqueFields.has(fieldName)) {
                                uniqueFields.set(fieldName, fieldName);
                            }
                            
                            // Track which events have this field
                            if (itemEventName && eventFields.has(itemEventName)) {
                                eventFields.get(itemEventName).add(fieldName);
                            }
                        }
                    });
                }
            });
        }
    });
    
    console.log('Unique field names found:', Array.from(uniqueFields.keys()));
    console.log('Event fields mapping:', Array.from(eventFields.entries()).map(([event, fields]) => 
        ({ event, fields: Array.from(fields) })
    ));
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
    
    // Get selected event filter
    const selectedEvent = document.getElementById('productFilter').value;
    
    // Determine which fields to show
    let fieldsToShow = new Set();
    if (selectedEvent && eventFields.has(selectedEvent)) {
        // Show only fields for the selected event
        fieldsToShow = eventFields.get(selectedEvent);
    } else {
        // Show all fields when no filter or "Alle evenementen" is selected
        uniqueFields.forEach((displayName, fieldKey) => {
            fieldsToShow.add(fieldKey);
        });
    }
    
    // Add dynamic field columns for visible fields only
    uniqueFields.forEach((displayName, fieldKey) => {
        if (fieldsToShow.has(fieldKey)) {
            const th = document.createElement('th');
            th.textContent = displayName;
            thead.appendChild(th);
        }
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
        productFilter.innerHTML = '<option value="">Alle evenementen</option>';
        
        Array.from(productSet).sort().forEach(product => {
            const option = document.createElement('option');
            option.value = product;
            option.textContent = product;
            productFilter.appendChild(option);
        });
        
        // Restore saved filter value from localStorage
        const savedFilter = localStorage.getItem('selectedEvent');
        if (savedFilter && Array.from(productSet).includes(savedFilter)) {
            productFilter.value = savedFilter;
        }
        
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
        
        // Get selected event filter
        const selectedEvent = document.getElementById('productFilter').value;
        
        // Determine which fields to show
        let fieldsToShow = new Set();
        if (selectedEvent && eventFields.has(selectedEvent)) {
            fieldsToShow = eventFields.get(selectedEvent);
        } else {
            uniqueFields.forEach((displayName, fieldKey) => {
                fieldsToShow.add(fieldKey);
            });
        }
        
        if (filteredOrders.length === 0) {
            const colspan = 6 + fieldsToShow.size; // Static columns + visible dynamic field columns
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
        
        // Add dynamic field columns in the same order as headers (only visible fields)
        uniqueFields.forEach((displayName, fieldKey) => {
            if (fieldsToShow.has(fieldKey)) {
                const value = fieldValues.get(fieldKey) || '-';
                rowHTML += `<td title="${value.replace(/"/g, '&quot;')}">${value}</td>`;
            }
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
        
        // Save the selected event to localStorage
        localStorage.setItem('selectedEvent', productFilter);
        
        // Show/hide buttons based on whether an event is selected
        const exportBtn = document.getElementById('exportBtn');
        const statsBtn = document.getElementById('statsBtn');
        if (productFilter) {
            exportBtn.style.display = 'block';
            statsBtn.style.display = 'none';
        } else {
            exportBtn.style.display = 'none';
            statsBtn.style.display = 'block';
            statsBtn.disabled = false; // Enable when "Alle evenementen" is selected
        }
        
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
        
        // Get selected event filter
        const selectedEvent = document.getElementById('productFilter').value;
        
        // Determine which fields to show
        let fieldsToShow = new Set();
        if (selectedEvent && eventFields.has(selectedEvent)) {
            fieldsToShow = eventFields.get(selectedEvent);
        } else {
            uniqueFields.forEach((displayName, fieldKey) => {
                fieldsToShow.add(fieldKey);
            });
        }
        
        // Create CSV header with static columns (Bedrag as 3rd column)
        let headers = ['Datum', 'Evenement', 'Bedrag', 'Naam', 'E-mail', 'Telefoon'];
        
        // Add dynamic field columns with their names (only visible fields)
        uniqueFields.forEach((displayName, fieldName) => {
            if (fieldsToShow.has(fieldName)) {
                headers.push(fieldName);
            }
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
            
            // Add dynamic field values (only for visible fields)
            uniqueFields.forEach((displayName, fieldKey) => {
                if (fieldsToShow.has(fieldKey)) {
                    const value = fieldValues.get(fieldKey) || '-';
                    rowData.push(`"${value.replace(/"/g, '""')}"`);
                }
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

// Statistics functions
let ticketsChart = null;
let revenueChart = null;
let chartsInitialized = false;

function calculateEventStatistics() {
    const stats = new Map();
    
    allOrders.forEach(order => {
        if (order.data?.cart?.items) {
            order.data.cart.items.forEach(item => {
                const eventName = item.product?.name || 'Onbekend';
                const quantity = item.amount || 1;
                const price = order.payment?.price || 0;
                
                if (!stats.has(eventName)) {
                    stats.set(eventName, { tickets: 0, revenue: 0 });
                }
                
                const eventStats = stats.get(eventName);
                eventStats.tickets += quantity;
                eventStats.revenue += price;
            });
        }
    });
    
    return stats;
}

function showStatisticsModal() {
    const modal = document.getElementById('statsModal');
    if (!modal) {
        console.error('Statistics modal not found');
        return;
    }
    
    modal.style.display = 'block';
    
    // Wait for next frame to ensure modal is visible before creating charts
    setTimeout(() => {
        const stats = calculateEventStatistics();
        
        // Sort by tickets and revenue
        const sortedByTickets = Array.from(stats.entries())
            .sort((a, b) => b[1].tickets - a[1].tickets);
        
        const sortedByRevenue = Array.from(stats.entries())
            .sort((a, b) => b[1].revenue - a[1].revenue);
        
        // Update rankings
        updateRankings(sortedByTickets, sortedByRevenue);
        
        // Create charts
        createCharts(sortedByTickets);
        chartsInitialized = true;
    }, 100);
}

function updateRankings(sortedByTickets, sortedByRevenue) {
    const ticketsRanking = document.getElementById('ticketsRanking');
    const revenueRanking = document.getElementById('revenueRanking');
    
    // Tickets ranking - show all events
    ticketsRanking.innerHTML = sortedByTickets
        .map(([event, stats]) => 
            `<li><strong>${event}</strong>: ${stats.tickets} ${stats.tickets === 1 ? 'ticket' : 'tickets'}</li>`
        ).join('');
    
    // Revenue ranking - show all events
    revenueRanking.innerHTML = sortedByRevenue
        .map(([event, stats]) => 
            `<li><strong>${event}</strong>: ${formatCurrency(stats.revenue)}</li>`
        ).join('');
}

function createCharts(sortedData) {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded yet');
        return;
    }
    
    const labels = sortedData.map(([event]) => event);
    const ticketsData = sortedData.map(([, stats]) => stats.tickets);
    const revenueData = sortedData.map(([, stats]) => stats.revenue / 100); // Convert to euros
    
    // Generate colors for each event
    const colors = generateColors(labels.length);
    
    // Destroy existing charts if they exist
    if (ticketsChart) ticketsChart.destroy();
    if (revenueChart) revenueChart.destroy();
    
    // Tickets chart - keep as bar chart
    const ticketsCtx = document.getElementById('ticketsChart');
    if (!ticketsCtx) {
        console.error('ticketsChart canvas not found');
        return;
    }
    const ticketsContext = ticketsCtx.getContext('2d');
    ticketsChart = new Chart(ticketsContext, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Aantal Tickets',
                data: ticketsData,
                backgroundColor: colors,
                borderColor: colors.map(color => darkenColor(color)),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
    
    // Revenue chart - pie chart
    const revenueCtx = document.getElementById('revenueChart');
    if (!revenueCtx) {
        console.error('revenueChart canvas not found');
        return;
    }
    const revenueContext = revenueCtx.getContext('2d');
    revenueChart = new Chart(revenueContext, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Omzet (€)',
                data: revenueData,
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: €${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                },
                legend: {
                    position: 'right',
                    labels: {
                        padding: 10,
                        font: {
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

// Generate distinct colors for charts
function generateColors(count) {
    const colors = [
        '#fa6432', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0',
        '#00BCD4', '#CDDC39', '#FFC107', '#795548', '#607D8B',
        '#E91E63', '#3F51B5', '#009688', '#8BC34A', '#FF5722',
        '#673AB7', '#03A9F4', '#FFEB3B', '#9E9E9E', '#FF6B6B'
    ];
    
    // If we need more colors than predefined, generate them
    while (colors.length < count) {
        const hue = (colors.length * 137.5) % 360; // Golden angle for distribution
        colors.push(`hsl(${hue}, 70%, 55%)`);
    }
    
    return colors.slice(0, count);
}

// Darken a color for borders
function darkenColor(color) {
    if (color.startsWith('#')) {
        // Hex color
        const num = parseInt(color.slice(1), 16);
        const r = Math.max(0, (num >> 16) - 30);
        const g = Math.max(0, ((num >> 8) & 0x00FF) - 30);
        const b = Math.max(0, (num & 0x0000FF) - 30);
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    return color; // Return as-is for HSL colors
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
    document.getElementById('statsBtn').addEventListener('click', showStatisticsModal);
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('authPassword');
        localStorage.removeItem('selectedEvent');
        window.location.href = '/login';
    });
    
    // Modal close functionality
    const modal = document.getElementById('statsModal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    console.log('Event listeners attached successfully');
} catch (error) {
    console.error('Error attaching event listeners:', error);
}

// Start authentication check and initialization
console.log('App initialized, checking authentication...');
verifyAuthAndInit();