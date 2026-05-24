// Lab Management System Frontend Script

let clients = [];
let currentUser = null;
let labConfig = null;
let testResults = [];
let serviceTypes = [];
let currentClientDetails = null;
let editingClientId = null;

// --- WORKSPACE LOGIC ---
let currentWorkspace = localStorage.getItem('app_workspace') || 'lab';

function initializeWorkspaceDropdown() {
    const selector = document.getElementById('workspace-selector');
    if (selector) {
        selector.value = currentWorkspace;
    }
}

async function changeWorkspace() {
    const selector = document.getElementById('workspace-selector');
    currentWorkspace = selector.value;
    localStorage.setItem('app_workspace', currentWorkspace);
    
    // Update the backend session workspace
    try {
        const response = await apiFetch('/api/auth/update_workspace', {
            method: 'POST',
            body: JSON.stringify({ workspace: currentWorkspace })
        });
        
        if (response.ok) {
            // Full page reload to serve the correct HTML shell from the backend
            window.location.reload();
        } else {
            showAlert('Failed to update workspace on server.', 'danger');
        }
    } catch (error) {
        console.error('Error updating workspace:', error);
        showAlert('An error occurred while switching workspaces.', 'danger');
    }
}

/**
 * A central wrapper for all API calls. 
 * Automatically injects the workspace header.
 */
async function apiFetch(endpoint, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    
    // Inject our dynamic workspace header
    options.headers['X-App-Mode'] = currentWorkspace;
    
    // Ensure JSON content type if sending data
    if (options.body && !options.headers['Content-Type'] && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }

    return await fetch(endpoint, options);
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', main);

async function main() {
    try {
        const response = await apiFetch('/api/auth/current_user', { 
            method: 'GET',
            credentials: 'include'
        });
        
        // If Flask returns 401 Unauthorized, go to login
        if (!response.ok) {
            console.warn('User is not logged in.');
            window.location.href = '/login';
            return; 
        }
        
        const userData = await response.json();
        currentUser = userData;
        await initializeApp();

    } catch (error) {
        console.error('Initialization failed:', error);
    }
}

async function initializeApp() {
    setupEventListeners();
    await loadFeatures();
    initializeWorkspaceDropdown();
    await loadInitialData();
    setupUIForRole();
    updateUserInfo();
}

async function loadFeatures() {
    try {
        const response = await apiFetch('/api/features');
        if (response.ok) {
            const features = await response.json();
            const selector = document.getElementById('workspace-selector');
            
            if (selector && features.workspace_switcher === true) {
                selector.style.display = 'block'; 
            }
        }
    } catch (error) {
        console.error('Failed to load features:', error);
    }
}

function setupEventListeners() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (tabName) showTab(tabName);
        });
    });

    document.getElementById('total-clients-card')?.addEventListener('click', showTotalClientsDetails);
    document.getElementById('pending-tests-card')?.addEventListener('click', showPendingTestsDetails);
    document.getElementById('completed-today-card')?.addEventListener('click', showCompletedTodayDetails);

    document.getElementById('client-form')?.addEventListener('submit', handleAddClient);
    document.getElementById('lab-config-form')?.addEventListener('submit', handleUpdateLabConfig);

    document.getElementById('client-search')?.addEventListener('keyup', searchClients);
}

// --- DATA & UI ---

async function loadInitialData() {
    try {
        const [clientsRes, configRes, testResultsRes] = await Promise.all([
            apiFetch('/api/clients'),
            apiFetch('/api/lab/config'),
            apiFetch('/api/test-results')
        ]);
        
        if (!clientsRes.ok) throw new Error('Failed to fetch clients');
        if (!configRes.ok) throw new Error('Failed to fetch lab config');
        if (!testResultsRes.ok) throw new Error('Failed to fetch test results');
        
        clients = await clientsRes.json();
        labConfig = await configRes.json();
        testResults = await testResultsRes.json();
        
        updateDashboard();
        updateUserInfo();
        populateSettingsForm();
        
        // Refresh active tab if necessary
        const activeTab = document.querySelector('.nav-tab.active')?.dataset?.tab;
        if (activeTab) showTab(activeTab);
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        showAlert('Could not load application data. Check console.', 'error');
    }
}

function updateUserInfo() {
    const userInfoDiv = document.getElementById('user-info');
    if (currentUser && labConfig && userInfoDiv) {
        userInfoDiv.innerHTML = `
            <strong>${currentUser.username}</strong> (${currentUser.role})<br>
            <small>${labConfig.lab_director || 'Lab Director'} - ${labConfig.lab_phone || 'Lab Phone'}</small>
        `;
    }
}

function setupUIForRole() {
    if (currentUser?.role === 'admin') {
        const financialTab = document.getElementById('financial-tab');
        const settingsTab = document.getElementById('settings-tab');
        if(financialTab) financialTab.style.display = 'block';
        if(settingsTab) settingsTab.style.display = 'block';
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

    const activeContent = document.getElementById(tabName);
    const activeTab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);

    if (activeContent) activeContent.classList.add('active');
    if (activeTab) activeTab.classList.add('active');
    
    switch(tabName) {
        case 'add-client':
            if (!editingClientId) {
                resetClientForm();
            }
            break;
            
        case 'clients':
            displayClients(clients);
            break;
        case 'pending-samples':
            loadPendingSamples();
            break;
        case 'test-results':
            loadTestResults();
            break;
        case 'client-history':
            loadClientHistory();
            break;
        case 'reports':
            loadReports();
            break;
    }
}

// --- DASHBOARD ---

function updateDashboard() {
    if (!clients) return;
    
    const totalClients = clients.length;
    const now = new Date();
    
    // Pending tests
    const pendingTests = clients.filter(c => c.sample_status === 'pending').length;
    
    // Completed today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const completedToday = clients.filter(c => c.sample_status === 'completed' && c.updated_at && new Date(c.updated_at) >= todayStart).length;

    // Average age
    const totalAge = clients.reduce((sum, c) => {
        if (c.date_of_birth) {
            const birthDate = new Date(c.date_of_birth);
            const age = Math.floor((now - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
            return sum + age;
        }
        return sum;
    }, 0);
    const averageAge = totalClients > 0 ? Math.round(totalAge / totalClients) : 0;

    const totalClientsEl = document.getElementById('total-clients');
    const pendingTestsEl = document.getElementById('pending-tests');
    const completedTodayEl = document.getElementById('completed-today');
    const avgAgeEl = document.getElementById('avg-age');

    if(totalClientsEl) totalClientsEl.textContent = totalClients;
    if(pendingTestsEl) pendingTestsEl.textContent = pendingTests;
    if(completedTodayEl) completedTodayEl.textContent = completedToday;
    if(avgAgeEl) avgAgeEl.textContent = averageAge;
}

// --- CLIENT MANAGEMENT ---

function displayClients(clientsToDisplay) {
    const tableBody = document.getElementById('clients-table-body');
    if (!tableBody) return;

    if (clientsToDisplay.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No clients found.</td></tr>';
        return;
    }

    tableBody.innerHTML = clientsToDisplay.map(c => `
        <tr class="client-row-hover" style="border-bottom: 1px solid #edf2f7;">
            <td style="padding: 12px;"><input type="checkbox" class="client-checkbox" data-id="${c.id}" onchange="updateBulkDeleteButton()"></td>
            <td style="padding: 12px;">${c.id}</td>
            <td style="padding: 12px;">${c.first_name} ${c.last_name}</td>
            <td style="padding: 12px;">${c.gender}</td>
            <td style="padding: 12px;">${c.phone}</td>
            <td style="padding: 12px;"><span class="status-badge" style="background: ${c.sample_status === 'pending' ? '#fbbf24' : '#10b981'}; color: white; padding: 4px 8px; border-radius: 4px;">${c.sample_status || 'pending'}</span></td>
            <td style="padding: 12px;">
                <button class="btn btn-primary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="viewClient(${c.id})">👁️ View</button>
            </td>
        </tr>
    `).join('');
}

function searchClients() {
    const searchTerm = document.getElementById('client-search').value.toLowerCase();
    const filtered = clients.filter(c => 
        c.id.toString().includes(searchTerm) ||
        c.first_name.toLowerCase().includes(searchTerm) ||
        c.last_name.toLowerCase().includes(searchTerm) ||
        c.phone.includes(searchTerm)
    );
    displayClients(filtered);
}

function viewClient(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) {
        showAlert('Client not found', 'error');
        return;
    }
    
    currentClientDetails = client;
    editingClientId = client.id;
    showTab('add-client');
    
    // Populate form with client data
    document.getElementById('first-name').value = client.first_name;
    document.getElementById('last-name').value = client.last_name;
    document.getElementById('date-of-birth').value = client.date_of_birth;
    document.getElementById('gender').value = client.gender;
    document.getElementById('contact-person').value = client.contact_person;
    document.getElementById('phone').value = client.phone;
    document.getElementById('client-phone').value = client.client_phone || '';
    document.getElementById('blood-type').value = client.blood_type || '';
    document.getElementById('city').value = client.city || '';
    document.getElementById('area').value = client.area || '';
    document.getElementById('street').value = client.street || '';
    document.getElementById('apartment').value = client.apartment || '';
    document.getElementById('allergies').value = client.allergies || '';
    document.getElementById('clinical-indications').value = client.clinical_indications || '';
    
    const submitBtn = document.querySelector('#client-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = '💾 Save Changes';
        submitBtn.className = 'btn btn-success';
    }
}

function resetClientForm() {
    document.getElementById('client-form').reset();
    editingClientId = null;
    currentClientDetails = null;
    
    const submitBtn = document.querySelector('#client-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Add Client';
        submitBtn.className = 'btn btn-primary';
    }
}

async function handleAddClient(e) {
    e.preventDefault();
    
    const formData = new FormData(document.getElementById('client-form'));
    const data = Object.fromEntries(formData);
    
    try {
        const endpoint = editingClientId ? `/api/clients/${editingClientId}` : '/api/clients';
        const method = editingClientId ? 'PUT' : 'POST';
        
        const response = await apiFetch(endpoint, {
            method: method,
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            showAlert(editingClientId ? 'Client updated successfully!' : 'Client added successfully!', 'success');
            resetClientForm();
            await loadInitialData();
            showTab('clients');
        } else {
            const error = await response.json();
            showAlert(error.error || 'Failed to save client', 'error');
        }
    } catch (error) {
        showAlert('Error saving client: ' + error.message, 'error');
    }
}

function loadPendingSamples() {
    const listDiv = document.getElementById('pending-samples-list');
    const pendingClients = clients.filter(c => c.sample_status === 'pending');
    
    if (pendingClients.length === 0) {
        listDiv.innerHTML = '<p>No pending samples.</p>';
        return;
    }
    
    listDiv.innerHTML = pendingClients.map(c => `
        <div class="expandable-card" style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${c.first_name} ${c.last_name}</strong> (ID: ${c.id})<br>
                    <small>Test Type: ${c.test_type || 'N/A'} | Phone: ${c.phone}</small>
                </div>
                <button class="btn btn-info" onclick="markSampleCollected(${c.id})">✓ Mark Collected</button>
            </div>
        </div>
    `).join('');
}

function loadTestResults() {
    const listDiv = document.getElementById('test-results-list');
    
    if (testResults.length === 0) {
        listDiv.innerHTML = '<p>No test results available.</p>';
        return;
    }
    
    listDiv.innerHTML = testResults.map(tr => `
        <div class="expandable-card" style="margin-bottom: 15px;">
            <div>
                <strong>${tr.test_name}</strong> - ${tr.parameter_name}<br>
                <small>Result: ${tr.result_value} ${tr.unit || ''} | Reference: ${tr.reference_range || 'N/A'}</small><br>
                <small>Status: <span style="background: ${tr.status === 'abnormal' ? '#ef4444' : '#10b981'}; color: white; padding: 2px 6px; border-radius: 3px;">${tr.status}</span></small>
            </div>
        </div>
    `).join('');
}

function loadClientHistory() {
    const listDiv = document.getElementById('client-history-list');
    
    if (clients.length === 0) {
        listDiv.innerHTML = '<p>No client history available.</p>';
        return;
    }
    
    listDiv.innerHTML = clients.map(c => `
        <div class="expandable-card" style="margin-bottom: 15px;">
            <div>
                <strong>${c.first_name} ${c.last_name}</strong> (ID: ${c.id})<br>
                <small>DOB: ${c.date_of_birth} | Phone: ${c.phone}</small><br>
                <small>Status: ${c.status} | Last Updated: ${new Date(c.updated_at).toLocaleDateString()}</small>
            </div>
        </div>
    `).join('');
}

function loadReports() {
    const listDiv = document.getElementById('reports-list');
    
    if (clients.length === 0) {
        listDiv.innerHTML = '<p>No reports available.</p>';
        return;
    }
    
    listDiv.innerHTML = clients.map(c => `
        <div class="expandable-card" style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${c.first_name} ${c.last_name}</strong> (ID: ${c.id})<br>
                <small>Created: ${new Date(c.created_at).toLocaleDateString()}</small>
            </div>
            <button class="btn btn-primary" onclick="downloadLabReport(${c.id})">📄 Download Report</button>
        </div>
    `).join('');
}

async function downloadLabReport(clientId) {
    try {
        const response = await apiFetch(`/api/clients/${clientId}/lab-report`, {
            method: 'GET'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lab_report_${clientId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            showAlert('Failed to download report', 'error');
        }
    } catch (error) {
        showAlert('Error downloading report: ' + error.message, 'error');
    }
}

async function markSampleCollected(clientId) {
    try {
        const response = await apiFetch(`/api/clients/${clientId}`, {
            method: 'PUT',
            body: JSON.stringify({ sample_status: 'collected' }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            showAlert('Sample marked as collected', 'success');
            await loadInitialData();
            loadPendingSamples();
        } else {
            showAlert('Failed to update sample status', 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

function populateSettingsForm() {
    if (!labConfig) return;
    
    document.getElementById('lab-name').value = labConfig.lab_name || '';
    document.getElementById('lab-director').value = labConfig.lab_director || '';
    document.getElementById('lab-phone').value = labConfig.lab_phone || '';
    document.getElementById('lab-address').value = labConfig.lab_address || '';
}

async function handleUpdateLabConfig(e) {
    e.preventDefault();
    
    const formData = new FormData(document.getElementById('lab-config-form'));
    const data = Object.fromEntries(formData);
    
    try {
        const response = await apiFetch('/api/lab/config', {
            method: 'PUT',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            showAlert('Lab configuration updated successfully!', 'success');
            await loadInitialData();
        } else {
            showAlert('Failed to update configuration', 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

function updateBulkDeleteButton() {
    const checkboxes = document.querySelectorAll('.client-checkbox:checked');
    const btn = document.getElementById('bulk-delete-btn');
    if (btn) {
        btn.style.display = checkboxes.length > 0 ? 'block' : 'none';
    }
}

function toggleSelectAll(checkbox) {
    document.querySelectorAll('.client-checkbox').forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateBulkDeleteButton();
}

async function handleBulkDelete() {
    const checkboxes = document.querySelectorAll('.client-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
    
    if (ids.length === 0) return;
    
    if (!confirm(`Delete ${ids.length} client(s)? This cannot be undone.`)) return;
    
    try {
        for (const id of ids) {
            await apiFetch(`/api/clients/${id}`, { method: 'DELETE' });
        }
        showAlert('Clients deleted successfully!', 'success');
        await loadInitialData();
        displayClients(clients);
    } catch (error) {
        showAlert('Error deleting clients: ' + error.message, 'error');
    }
}

async function logout() {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/login';
    }
}

function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        padding: 15px;
        margin-bottom: 10px;
        border-radius: 8px;
        background: ${type === 'success' ? '#d1fae5' : '#fee2e2'};
        border: 1px solid ${type === 'success' ? '#6ee7b7' : '#fca5a5'};
        color: ${type === 'success' ? '#065f46' : '#7f1d1d'};
        animation: slideIn 0.3s ease-out;
    `;
    alertDiv.textContent = message;
    
    container.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function performDailyReset() {
    if (confirm('Are you sure you want to perform a daily reset? This will reset sample statuses.')) {
        showAlert('Daily reset performed', 'success');
        // Implementation would go here
    }
}

// Search functions
function searchPendingSamples() {
    const searchTerm = document.getElementById('pending-search').value.toLowerCase();
    const filtered = clients.filter(c => 
        c.sample_status === 'pending' && (
            c.first_name.toLowerCase().includes(searchTerm) ||
            c.last_name.toLowerCase().includes(searchTerm) ||
            c.phone.includes(searchTerm)
        )
    );
    
    const listDiv = document.getElementById('pending-samples-list');
    if (filtered.length === 0) {
        listDiv.innerHTML = '<p>No matching pending samples.</p>';
        return;
    }
    
    listDiv.innerHTML = filtered.map(c => `
        <div class="expandable-card" style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${c.first_name} ${c.last_name}</strong> (ID: ${c.id})<br>
                    <small>Test Type: ${c.test_type || 'N/A'} | Phone: ${c.phone}</small>
                </div>
                <button class="btn btn-info" onclick="markSampleCollected(${c.id})">✓ Mark Collected</button>
            </div>
        </div>
    `).join('');
}

function searchTestResults() {
    const searchTerm = document.getElementById('results-search').value.toLowerCase();
    const filtered = testResults.filter(tr =>
        tr.test_name.toLowerCase().includes(searchTerm) ||
        tr.parameter_name.toLowerCase().includes(searchTerm)
    );
    
    const listDiv = document.getElementById('test-results-list');
    if (filtered.length === 0) {
        listDiv.innerHTML = '<p>No matching test results.</p>';
        return;
    }
    
    listDiv.innerHTML = filtered.map(tr => `
        <div class="expandable-card" style="margin-bottom: 15px;">
            <div>
                <strong>${tr.test_name}</strong> - ${tr.parameter_name}<br>
                <small>Result: ${tr.result_value} ${tr.unit || ''} | Reference: ${tr.reference_range || 'N/A'}</small><br>
                <small>Status: <span style="background: ${tr.status === 'abnormal' ? '#ef4444' : '#10b981'}; color: white; padding: 2px 6px; border-radius: 3px;">${tr.status}</span></small>
            </div>
        </div>
    `).join('');
}

function searchClientHistory() {
    const searchTerm = document.getElementById('history-search').value.toLowerCase();
    const filtered = clients.filter(c =>
        c.first_name.toLowerCase().includes(searchTerm) ||
        c.last_name.toLowerCase().includes(searchTerm) ||
        c.phone.includes(searchTerm)
    );
    
    const listDiv = document.getElementById('client-history-list');
    if (filtered.length === 0) {
        listDiv.innerHTML = '<p>No matching client history.</p>';
        return;
    }
    
    listDiv.innerHTML = filtered.map(c => `
        <div class="expandable-card" style="margin-bottom: 15px;">
            <div>
                <strong>${c.first_name} ${c.last_name}</strong> (ID: ${c.id})<br>
                <small>DOB: ${c.date_of_birth} | Phone: ${c.phone}</small><br>
                <small>Status: ${c.status} | Last Updated: ${new Date(c.updated_at).toLocaleDateString()}</small>
            </div>
        </div>
    `).join('');
}

function searchReports() {
    const searchTerm = document.getElementById('report-search').value.toLowerCase();
    const filtered = clients.filter(c =>
        c.first_name.toLowerCase().includes(searchTerm) ||
        c.last_name.toLowerCase().includes(searchTerm)
    );
    
    const listDiv = document.getElementById('reports-list');
    if (filtered.length === 0) {
        listDiv.innerHTML = '<p>No matching reports.</p>';
        return;
    }
    
    listDiv.innerHTML = filtered.map(c => `
        <div class="expandable-card" style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${c.first_name} ${c.last_name}</strong> (ID: ${c.id})<br>
                <small>Created: ${new Date(c.created_at).toLocaleDateString()}</small>
            </div>
            <button class="btn btn-primary" onclick="downloadLabReport(${c.id})">📄 Download Report</button>
        </div>
    `).join('');
}

function showTotalClientsDetails() {
    // Implementation for showing total clients details
}

function showPendingTestsDetails() {
    // Implementation for showing pending tests details
}

function showCompletedTodayDetails() {
    // Implementation for showing completed today details
}
