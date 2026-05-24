// --- GLOBAL STATE ---
let patients = [];
let currentUser = null;
let clinicConfig = null;
let financialData = {};
let revenueChart = null;
let serviceChart = null;
let serviceTypes = [];
let selectedPatientForReservation = null;
let selectedPatientForTransaction = null;
let currentPatientDetails = null;

// --- WORKSPACE LOGIC ---
let currentWorkspace = localStorage.getItem('app_workspace') || 'clinic';

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
        // We purposely do NOT redirect to /login here. 
        // This prevents the infinite flashing loop if a minor JS error occurs!
    }
}

async function initializeApp() {
    setupEventListeners();
    await loadFeatures(); // Load feature flags before setting up the UI
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
            
            // If the backend says the feature is enabled, make the dropdown visible
            if (selector && features.workspace_switcher === true) {
                selector.style.display = 'block'; 
            }
        }
    } catch (error) {
        console.error('Failed to load features:', error);
    }
}

function setupEventListeners() {
    // document.querySelectorAll('.nav-tab').forEach(tab => {
    //     tab.addEventListener('click', () => {
    //         const tabName = tab.dataset.tab;
    //         if (tabName) showTab(tabName);
    //     });
    // });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (tabName) showTab(tabName);
        });
    });

    // 2. Dynamic Payment Method Listener
    // This handles the "Card" and "Insurance" pop-up labels
    const methodSelect = document.getElementById('payment-method');
    methodSelect?.addEventListener('change', function() {
        const cardSection = document.getElementById('card-details-section');
        const insuranceSection = document.getElementById('insurance-details-section');

        // Reset visibility
        cardSection.style.display = 'none';
        insuranceSection.style.display = 'none';

        if (this.value === 'card') {
            cardSection.style.display = 'block';
        } else if (this.value === 'insurance') {
            insuranceSection.style.display = 'block';
        }
    });


    document.getElementById('total-patients-card')?.addEventListener('click', showTotalPatientsDetails);
    document.getElementById('new-patients-card')?.addEventListener('click', showNewPatientsDetails);
    document.getElementById('avg-age-card')?.addEventListener('click', showAverageAgeDetails);
    document.getElementById('today-patients-card')?.addEventListener('click', toggleTodayPatientsDetails);

    document.getElementById('patient-form')?.addEventListener('submit', handleAddPatient);
    document.getElementById('clinic-config-form')?.addEventListener('submit', handleUpdateConfig);
    document.getElementById('reservation-form')?.addEventListener('submit', handleCreateReservation);
    document.getElementById('transaction-form')?.addEventListener('submit', handleAddTransaction);

    document.getElementById('add-transaction-tab')?.addEventListener('click', showAddTransactionModal);
    document.getElementById('patient-search')?.addEventListener('keyup', searchPatients);
}

// --- DATA & UI ---

async function loadInitialData() {
    try {
        const [patientsRes, configRes, serviceTypesRes] = await Promise.all([
            apiFetch('/api/patients'),
            apiFetch('/api/clinic/config'),
            apiFetch('/api/financial/service-types')
        ]);
        
        if (!patientsRes.ok) throw new Error('Failed to fetch patients');
        if (!configRes.ok) throw new Error('Failed to fetch clinic config');
        if (!serviceTypesRes.ok) throw new Error('Failed to fetch service types');
        
        patients = await patientsRes.json();
        clinicConfig = await configRes.json();
        serviceTypes = await serviceTypesRes.json();
        
        updateDashboard();
        updateUserInfo();
        populateSettingsForm();
        populateServiceTypes();
        
        // Refresh active tab if necessary
        const activeTab = document.querySelector('.nav-tab.active')?.dataset?.tab;
        if (activeTab) showTab(activeTab);
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        showAlert('Could not load application data. Check console.', 'error');
    }
}

function populateServiceTypes() {
    const serviceTypeSelect = document.getElementById('service-type');
    if (!serviceTypeSelect) return;

    serviceTypeSelect.innerHTML = '<option value="">Select Service Type</option>';

    if (serviceTypes && serviceTypes.length > 0) {
        // --- DYNAMIC PATH: Use data from loadInitialData() ---
        serviceTypes.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id; 
            option.textContent = `${service.name} - $${service.default_price}`;
            serviceTypeSelect.appendChild(option);
        });
    } else {
        // --- FALLBACK PATH: If the array is empty, use defaults ---
        console.warn("Service types array is empty. Using default fallback.");
        const defaults = [
            { id: 'examination', name: 'Examination' },
            { id: 'consultation', name: 'Consultation' },
            { id: 'fast examination', name: 'Fast Examination' }
        ];
        defaults.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            serviceTypeSelect.appendChild(option);
        });
    }
}
function updateUserInfo() {
    const userInfoDiv = document.getElementById('user-info');
    if (currentUser && clinicConfig && userInfoDiv) {
        userInfoDiv.innerHTML = `
            <strong>${currentUser.username}</strong> (${currentUser.role})<br>
            <small>${clinicConfig.doctor_name || 'Dr. Name'} - ${clinicConfig.clinic_phone || 'Clinic Phone'}</small>
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
        case 'add-patient':
            if (!editingPatientId) {
                resetPatientForm();
            }
            break;
            
        case 'patients':
            displayPatients(patients);
            break;
        case 'patients':
            displayPatients(patients);
            break;
        case 'awaiting-hall':
            loadAwaitingPatients();
            break;
        case 'finished-reservations':
            loadFinishedPatients();
            break;
        case 'patient-history':
            loadPatientHistory();
            break;
        case 'hall-status-manager':
            loadHallStatusPatients();
            break;
        case 'financial':
            initializeFinancialDashboard();
            break;
    }
}

// --- DASHBOARD ---

function updateDashboard() {
    if (!patients) return;
    
    const totalPatients = patients.length;
    const now = new Date();
    const newPatientsThisMonth = patients.filter(p => new Date(p.created_at).getMonth() === now.getMonth()).length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayPatientsCount = patients.filter(p => p.visit_datetime && new Date(p.visit_datetime) >= todayStart).length;

    const totalAge = patients.reduce((sum, p) => sum + calculateAge(p.date_of_birth), 0);
    const averageAge = totalPatients > 0 ? Math.round(totalAge / totalPatients) : 0;

    const totalPatientsEl = document.getElementById('total-patients');
    const newPatientsEl = document.getElementById('new-patients');
    const avgAgeEl = document.getElementById('avg-age');
    const todayPatientsEl = document.getElementById('today-patients');

    if(totalPatientsEl) totalPatientsEl.textContent = totalPatients;
    if(newPatientsEl) newPatientsEl.textContent = newPatientsThisMonth;
    if(avgAgeEl) avgAgeEl.textContent = averageAge;
    if(todayPatientsEl) todayPatientsEl.textContent = todayPatientsCount;
}

function toggleTodayPatientsDetails() {
    const expandedDiv = document.getElementById('today-patients-expanded');
    if (!expandedDiv) return;

    const isHidden = expandedDiv.style.display === 'none';
    expandedDiv.style.display = isHidden ? 'block' : 'none';

    if (isHidden) {
        const listDiv = document.getElementById('today-patients-list');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayPatients = patients.filter(p => p.visit_datetime && new Date(p.visit_datetime) >= todayStart);

        if (listDiv) {
            if (todayPatients.length === 0) {
                listDiv.innerHTML = '<p>No patients scheduled for today.</p>';
            } else {
                listDiv.innerHTML = todayPatients.map(p => `
                    <div class="today-patient-item">
                        <span>${p.first_name} ${p.last_name}</span>
                        <span class="status-${p.status?.toLowerCase() || 'scheduled'}">${p.status === 'finished' ? '✅ Finished' : (p.hall_status || 'Out')}</span>
                    </div>
                `).join('');
            }
        }
    }
}

// --- PATIENT MANAGEMENT ---

function displayPatients(patientsToDisplay) {
    const tableBody = document.getElementById('patients-table-body');
    if (!tableBody) return;

    if (patientsToDisplay.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No patients found.</td></tr>';
        return;
    }

    tableBody.innerHTML = patientsToDisplay.map(p => `
        <tr class="patient-row-hover" style="border-bottom: 1px solid #edf2f7;">
            <td style="padding: 12px;"><input type="checkbox" class="patient-checkbox" data-id="${p.id}" onchange="updateBulkDeleteButton()"></td>
            <td style="padding: 12px;">${p.id}</td>
            <td style="padding: 12px;">${p.first_name} ${p.last_name}</td>
            <td style="padding: 12px;">${p.gender}</td>
            <td style="padding: 12px;">${p.phone}</td>
            <td style="padding: 12px;">
                <button class="btn btn-primary" style="padding: 5px 10px; font-size: 0.8rem;" onclick="viewPatient(${p.id})">👁️ View Details</button>
            </td>
        </tr>
    `).join('');
}

function searchPatients() {
    const searchTerm = document.getElementById('patient-search').value.toLowerCase();
    const filtered = patients.filter(p => 
        p.id.toString().includes(searchTerm) ||
        p.first_name.toLowerCase().includes(searchTerm) ||
        p.last_name.toLowerCase().includes(searchTerm) ||
        p.phone.includes(searchTerm)
    );
    displayPatients(filtered);
}

// --- EDIT PATIENT LOGIC ---

let editingPatientId = null;

function editPatient() {
    if (!currentPatientDetails) {
        showAlert("No patient data found to edit.", "error");
        return;
    }
    
    // 1. Set the global edit flag
    editingPatientId = currentPatientDetails.id;
    
    // 2. Change to the 'add-patient' tab
    showTab('add-patient');

    // 3. Update the UI to show we are in Edit Mode
    const submitBtn = document.querySelector('#patient-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = '💾 Save Changes';
        submitBtn.className = 'btn btn-success';
    }
    
    const headerTitle = document.querySelector('#add-patient h2');
    if (headerTitle) {
        headerTitle.innerHTML = `Editing Patient <span style="color: #667eea;">[ID: ${editingPatientId}]</span>`;
    }

    // 4. POPULATE THE FORM (The core logic to keep your data visible)
    const form = document.getElementById('patient-form');
    if (!form) return;

    // We loop through every property in the patient object
    Object.keys(currentPatientDetails).forEach(key => {
        const value = currentPatientDetails[key];
        const input = form.elements[key];

        if (input) {
            if (input.type === 'date' && value) {
                // Formats "2023-10-01T00:00:00" to "2023-10-01" so the browser can read it
                input.value = value.split('T')[0];
            } else if (input.tagName === 'SELECT') {
                // Forces the dropdown to stay on the previously saved option
                input.value = value;
            } else {
                // Handles text, tel, and textarea
                input.value = value || '';
            }
        }
    });

    closePatientDetailsModal();
    showAlert(`Now editing ${currentPatientDetails.first_name}. Change only what you need!`, 'info');
}
async function handleAddPatient(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const patientData = Object.fromEntries(formData.entries());

    // Determine if this is a PUT (Update) or POST (Create) request
    const url = editingPatientId ? `/api/patients/${editingPatientId}` : '/api/patients';
    const method = editingPatientId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patientData)
        });
        
        if (!response.ok) throw new Error((await response.json()).error);
        
        showAlert(editingPatientId ? 'Patient updated successfully!' : 'Patient added successfully!', 'success');
        
        resetPatientForm();
        await loadInitialData();
        showTab('patients');
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

function resetPatientForm() {
    editingPatientId = null;
    const form = document.getElementById('patient-form');
    form.reset();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Add Patient';
    submitBtn.className = 'btn btn-primary';
    document.querySelector('#add-patient h2').textContent = 'Add New Patient';
}

// --- BULK DELETE LOGIC ---

function toggleSelectAll(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.patient-checkbox');
    checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
    updateBulkDeleteButton();
}

function updateBulkDeleteButton() {
    const checkedCount = document.querySelectorAll('.patient-checkbox:checked').length;
    document.getElementById('bulk-delete-btn').style.display = checkedCount > 0 ? 'block' : 'none';
}

async function handleBulkDelete() {
    const selectedIds = Array.from(document.querySelectorAll('.patient-checkbox:checked')).map(cb => cb.dataset.id);
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected patient(s)?`)) return;

    try {
        const deletePromises = selectedIds.map(id => apiFetch(`/api/patients/${id}`, { method: 'DELETE' }));
        await Promise.all(deletePromises);
        
        showAlert('Selected patients deleted successfully!', 'success');
        await loadInitialData();
        displayPatients(patients);
        updateBulkDeleteButton();
    } catch (error) {
        showAlert('Error deleting some patients.', 'error');
    }
}

// --- SETTINGS ---

function populateSettingsForm() {
    if (currentUser?.role === 'admin' && clinicConfig) {
        const doctorNameInput = document.getElementById('doctor-name-config');
        const clinicNameInput = document.getElementById('clinic-name-config');
        const clinicPhoneInput = document.getElementById('clinic-phone-config');
        const clinicAddressInput = document.getElementById('clinic-address-config');
        const logoPathInput = document.getElementById('logo-path-config');

        if (doctorNameInput) doctorNameInput.value = clinicConfig.doctor_name || '';
        if (clinicNameInput) clinicNameInput.value = clinicConfig.clinic_name || '';
        if (clinicPhoneInput) clinicPhoneInput.value = clinicConfig.clinic_phone || '';
        if (clinicAddressInput) clinicAddressInput.value = clinicConfig.clinic_address || '';
        if (logoPathInput) logoPathInput.value = clinicConfig.logo_path || '';
    }
}

async function handleUpdateConfig(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const configData = Object.fromEntries(formData.entries());

    try {
        const response = await apiFetch('/api/clinic/config', {
            method: 'PUT',
            body: JSON.stringify(configData)
        });
        if (!response.ok) throw new Error((await response.json()).error);
        
        const result = await response.json();
        clinicConfig = result.config;
        updateUserInfo();
        showAlert('Settings updated successfully!', 'success');
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

// --- MODALS & UTILITIES ---

function showStatsModal(title, content) {
    const modal = document.getElementById('stats-modal');
    if (modal) {
        modal.querySelector('#stats-modal-title').textContent = title;
        modal.querySelector('#stats-modal-content').innerHTML = content;
        modal.style.display = 'block';
    }
}

function closeStatsModal() {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.style.display = 'none';
}

async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
}

function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return 0;
    const birthDate = new Date(dateOfBirth);
    const ageDiffMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDiffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function showAlert(message, type = 'info') {
    const container = document.querySelector('.container');
    if (!container) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.style.transition = 'opacity 0.5s ease';
    container.prepend(alertDiv);
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        setTimeout(() => alertDiv.remove(), 500);
    }, 5000);
}

// --- FINANCIAL DASHBOARD ---

async function initializeFinancialDashboard() {
    try {
        const [dashboardRes, analyticsRes] = await Promise.all([
            apiFetch('/api/financial/dashboard'),
            apiFetch('/api/financial/analytics/revenue?period=month')
        ]);
        if (!dashboardRes.ok || !analyticsRes.ok) throw new Error('Failed to load financial data');
        
        const dashboardData = await dashboardRes.json();
        const analyticsData = await analyticsRes.json();

        updateFinancialOverview(dashboardData);
        updateFinancialCharts(analyticsData);

    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function updateFinancialOverview(data) {
    const revenueTodayEl = document.getElementById('revenue-today');
    const revenueMonthEl = document.getElementById('revenue-month');
    const transactionsCountEl = document.getElementById('transactions-count');
    const avgTransactionEl = document.getElementById('avg-transaction');

    if(revenueTodayEl) revenueTodayEl.textContent = `$${data.revenue?.today?.toFixed(2) || '0.00'}`;
    if(revenueMonthEl) revenueMonthEl.textContent = `$${data.revenue?.month?.toFixed(2) || '0.00'}`;
    if(transactionsCountEl) transactionsCountEl.textContent = data.transactions?.month || '0';
    if(avgTransactionEl) avgTransactionEl.textContent = `$${data.average_transaction?.toFixed(2) || '0.00'}`;
}

function updateFinancialCharts(analyticsData) {
    if (typeof Chart === 'undefined') {
        showAlert('Chart library is not loaded. Please check your HTML file.', 'error');
        return;
    }
    updateRevenueChart(analyticsData.revenue_trend);
    updateServiceChart(analyticsData.service_revenue);
}

function updateRevenueChart(revenueData) {
    const ctx = document.getElementById('revenue-chart')?.getContext('2d');
    if (!ctx) return;
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: revenueData.map(item => item.date),
            datasets: [{
                label: 'Revenue',
                data: revenueData.map(item => item.revenue),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                fill: true,
                tension: 0.4
            }]
        }
    });
}

function updateServiceChart(serviceData) {
    const ctx = document.getElementById('service-chart')?.getContext('2d');
    if (!ctx) return;
    if (serviceChart) serviceChart.destroy();
    serviceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: serviceData.map(item => item.service),
            datasets: [{
                data: serviceData.map(item => item.revenue),
                backgroundColor: ['#667eea', '#764ba2', '#48bb78', '#ed8936', '#f56565'],
            }]
        }
    });
}

// --- DASHBOARD CARD FUNCTIONS ---

let currentPaginationPage = 1;
const recordsPerPage = 10;

function showTotalPatientsDetails() {
    const males = patients.filter(p => p.gender?.toLowerCase() === 'male').length;
    const females = patients.filter(p => p.gender?.toLowerCase() === 'female').length;
    
    const content = `
        <div class="stats-grid">
            <div class="stat-card" onclick="showPatientListByGender('Male')" style="border-top: 4px solid #4299e1;">
                <div class="stat-number" style="color: #4299e1;">${males}</div>
                <div class="stat-label">Male Patients</div>
            </div>
            <div class="stat-card" onclick="showPatientListByGender('Female')" style="border-top: 4px solid #f687b3;">
                <div class="stat-number" style="color: #f687b3;">${females}</div>
                <div class="stat-label">Female Patients</div>
            </div>
        </div>
    `;
    // Title updated as requested
    showStatsModal('Total Patients by Gender', content);
}

function showPatientListByGender(gender, page = 1) {
    currentPaginationPage = page;
    const filteredPatients = patients.filter(p => p.gender?.toLowerCase() === gender.toLowerCase());
    
    // Pagination logic
    const totalPages = Math.ceil(filteredPatients.length / recordsPerPage);
    const start = (page - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    const paginatedItems = filteredPatients.slice(start, end);

    let html = `
        <div style="max-height: 400px; overflow-y: auto; margin-top: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f7fafc; text-align: left;">
                        <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Name</th>
                        <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Parent</th>
                        <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${paginatedItems.map(p => `
                        <tr class="patient-row-hover" style="border-bottom: 1px solid #edf2f7; cursor: pointer;" onclick="viewPatient(${p.id}); closeStatsModal();">
                            <td style="padding: 12px;">${p.first_name} ${p.last_name}</td>
                            <td style="padding: 12px;">${p.parent_name}</td>
                            <td style="padding: 12px;"><button class="btn btn-primary" style="padding: 5px 10px; font-size: 0.8rem;">View Profile</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Add Pagination Controls if more than 1 page
    if (totalPages > 1) {
        html += `
            <div style="display: flex; justify-content: center; gap: 10px; margin-top: 20px; align-items: center;">
                <button class="btn btn-secondary" ${page === 1 ? 'disabled' : ''} onclick="showPatientListByGender('${gender}', ${page - 1})">Previous</button>
                <span>Page ${page} of ${totalPages}</span>
                <button class="btn btn-secondary" ${page === totalPages ? 'disabled' : ''} onclick="showPatientListByGender('${gender}', ${page + 1})">Next</button>
            </div>
        `;
    }

    if (filteredPatients.length === 0) {
        html = `<p style="text-align: center; padding: 20px;">No ${gender} patients found.</p>`;
    }

    // Reuse the existing stats modal to show the list
    showStatsModal(`${gender} Patients List`, html);
}

// function showTotalPatientsDetails() {
//     const examination = patients.filter(p => p.visit_type === 'examination').length;
//     const fastExamination = patients.filter(p => p.visit_type === 'fast examination').length;
//     const consultation = patients.filter(p => p.visit_type === 'consultation').length;
    
//     const content = `
//         <div class="stats-grid">
//             <div class="stat-card">
//                 <div class="stat-number">${examination}</div>
//                 <div class="stat-label">Examination</div>
//             </div>
//             <div class="stat-card">
//                 <div class="stat-number">${fastExamination}</div>
//                 <div class="stat-label">Fast Examination</div>
//             </div>
//             <div class="stat-card">
//                 <div class="stat-number">${consultation}</div>
//                 <div class="stat-label">Consultation</div>
//             </div>
//         </div>
//     `;
//     showStatsModal('Total Patients by Visit Type', content);
// }

function showNewPatientsDetails() {
    const now = new Date();
    const newPatients = patients.filter(p => new Date(p.created_at).getMonth() === now.getMonth());
    
    const examination = newPatients.filter(p => p.visit_type === 'examination').length;
    const fastExamination = newPatients.filter(p => p.visit_type === 'fast examination').length;
    const consultation = newPatients.filter(p => p.visit_type === 'consultation').length;

    const content = `
        <p>Breakdown of the ${newPatients.length} new patients registered this month.</p>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${examination}</div>
                <div class="stat-label">Examination</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${fastExamination}</div>
                <div class="stat-label">Fast Examination</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${consultation}</div>
                <div class="stat-label">Consultation</div>
            </div>
        </div>
    `;
    showStatsModal('New Patients This Month', content);
}

function showAverageAgeDetails() {
    if (patients.length === 0) {
        showStatsModal('Age Statistics', '<p>No patient data available to calculate age statistics.</p>');
        return;
    }

    const ages = patients.map(p => calculateAge(p.date_of_birth));
    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);
    const avgAge = Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length);

    const content = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${minAge}</div>
                <div class="stat-label">Youngest Patient</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${avgAge}</div>
                <div class="stat-label">Average Age</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${maxAge}</div>
                <div class="stat-label">Oldest Patient</div>
            </div>
        </div>
    `;
    showStatsModal('Patient Age Statistics', content);
}

// --- NEW RESERVATION FUNCTIONALITY ---

function resetPaymentStatus(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (patient) {
        patient.has_paid = false; // Unlocks the "Pay Now" button for the new visit
        patient.status = 'awaiting'; // Moves them back into the flow
    }
}

function searchPatientsForReservation() {
    const searchTerm = document.getElementById('reservation-patient-search').value.toLowerCase();
    const resultsDiv = document.getElementById('reservation-patient-results');
    
    if (searchTerm.length < 1) {
        resultsDiv.innerHTML = '';
        return;
    }
    
    // Search by Name, ID, or Phone
    const filtered = patients.filter(p => 
        p.first_name.toLowerCase().includes(searchTerm) ||
        p.last_name.toLowerCase().includes(searchTerm) ||
        p.phone.includes(searchTerm) ||
        p.id.toString() === searchTerm // Match exact ID
    );
    
    if (filtered.length === 0) {
        resultsDiv.innerHTML = `
            <div style="text-align: center; padding: 20px; border: 2px dashed #e2e8f0; border-radius: 10px;">
                <p style="color: #718096; margin-bottom: 10px;">No patient found with "${searchTerm}"</p>
                <button class="btn btn-success" onclick="showTab('add-patient')">➕ Add New Patient</button>
            </div>
        `;
        return;
    }
    
    resultsDiv.innerHTML = filtered.map(p => `
        <div class="patient-search-result" onclick="selectPatientForReservation(${p.id})" style="cursor: pointer; padding: 10px; border-bottom: 1px solid #eee;">
            <strong>ID: ${p.id} - ${p.first_name} ${p.last_name}</strong><br>
            <small>Parent: ${p.parent_name} | Phone: ${p.phone}</small>
        </div>
    `).join('');
}

function selectPatientForReservation(patientId) {
    selectedPatientForReservation = patients.find(p => p.id === patientId);
    if (selectedPatientForReservation) {
        document.getElementById('reservation-patient-id').value = patientId;
        document.getElementById('reservation-patient-search').value = 
            `${selectedPatientForReservation.first_name} ${selectedPatientForReservation.last_name}`;
        document.getElementById('reservation-patient-results').innerHTML = '';
        document.getElementById('reservation-form').style.display = 'block';
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('visit-date').value = today;
    }
}

async function handleCreateReservation(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    const visitDate = formData.get('visit_date');
    const visitTime = formData.get('visit_time');
    const visitDateTime = new Date(`${visitDate}T${visitTime}`).toISOString();
    
    const reservationData = {
        visit_datetime: visitDateTime,
        visit_type: formData.get('visit_type'),
        hall_status: formData.get('hall_status')
    };

    try {
        const response = await apiFetch(`/api/patients/${selectedPatientForReservation.id}/reservation`, {
            method: 'POST',
            body: JSON.stringify(reservationData)
        });
        
        if (!response.ok) throw new Error((await response.json()).error);
        
        showAlert('Reservation created successfully!', 'success');
        const patient = patients.find(p => p.id === parseInt(formData.get('patient_id')));
        if (patient) {
            patient.has_paid = false; // Unlocks the button for the new record
            patient.status = 'awaiting'; // Moves them out of "Finished"
        }
        form.reset();
        cancelReservation();
        await loadInitialData();
        showTab('dashboard');
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

function cancelReservation() {
    document.getElementById('reservation-form').style.display = 'none';
    document.getElementById('reservation-patient-search').value = '';
    document.getElementById('reservation-patient-results').innerHTML = '';
    selectedPatientForReservation = null;
}

// --- TRANSACTION FUNCTIONALITY ---

function showAddTransactionModal() {
    const modal = document.getElementById('transaction-modal');
    if (modal) {
        modal.style.display = 'block';
        
        // Only populate the dropdown if we aren't in "Pay Now" mode
        // This prevents the error by keeping your parsed ID intact
        const serviceSelect = document.getElementById('service-type');
        if (serviceSelect) {
            populateServiceTypes(); 
        }

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('transaction-date').value = now.toISOString().slice(0, 16);
    }
}

function closeTransactionModal() {
    const modal = document.getElementById('transaction-modal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('transaction-form').reset();
        document.getElementById('transaction-patient-results').innerHTML = '';
        selectedPatientForTransaction = null;
    }
}

function searchPatientsForTransaction() {
    const searchTerm = document.getElementById('transaction-patient-search').value.toLowerCase();
    const resultsDiv = document.getElementById('transaction-patient-results');
    
    if (searchTerm.length < 2) {
        resultsDiv.innerHTML = '';
        return;
    }
    
    const filtered = patients.filter(p => 
        p.first_name.toLowerCase().includes(searchTerm) ||
        p.last_name.toLowerCase().includes(searchTerm) ||
        p.parent_name.toLowerCase().includes(searchTerm) ||
        p.id.toString().includes(searchTerm)
    );
    
    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<p>No patients found.</p>';
        return;
    }
    
    resultsDiv.innerHTML = filtered.map(p => `
        <div class="patient-search-result" onclick="selectPatientForTransaction(${p.id})">
            <strong>${p.first_name} ${p.last_name}</strong><br>
            <small>Parent: ${p.parent_name} | Phone: ${p.phone}</small>
        </div>
    `).join('');
}

function selectPatientForTransaction(patientId) {
    selectedPatientForTransaction = patients.find(p => p.id === patientId);
    if (selectedPatientForTransaction) {
        document.getElementById('transaction-patient-id').value = patientId;
        document.getElementById('transaction-patient-search').value = 
            `${selectedPatientForTransaction.first_name} ${selectedPatientForTransaction.last_name}`;
        document.getElementById('transaction-patient-results').innerHTML = '';
    }
}

async function handleAddTransaction(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const transactionData = Object.fromEntries(formData.entries());

    // If the backend requires a service_id (integer) instead of a name (string)
    // we find the ID from the global serviceTypes array
    if (isNaN(transactionData.service_type_id)) {
        const foundService = serviceTypes.find(s => s.name.toLowerCase() === transactionData.service_type_id.toLowerCase());
        if (foundService) {
            transactionData.service_type_id = foundService.id;
        }
    }

    try {
        const response = await apiFetch('/api/financial/transactions', {
            method: 'POST',
            body: JSON.stringify(transactionData)
        });
        
        if (!response.ok) throw new Error((await response.json()).error);
        
        showAlert('Transaction added successfully!', 'success');
        // --- LOCKING MECHANISM ---
        // Find the patient in the local array and mark them as paid
        const patient = patients.find(p => p.id === parseInt(transactionData.patient_id));
        if (patient) {
            patient.has_paid = true; // This triggers the "Paid" button in your code
        }
        closeTransactionModal();
        await loadInitialData(); // Refresh to show new data
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

// --- PATIENT DETAILS FUNCTIONALITY ---

async function viewPatient(patientId) {
    try {
        const response = await apiFetch(`/api/patients/${patientId}`);
        if (!response.ok) throw new Error('Failed to fetch patient details');
        
        currentPatientDetails = await response.json();
        showPatientDetailsModal();
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

function showPatientDetailsModal() {
    const modal = document.getElementById('patient-details-modal');
    const titleEl = document.getElementById('patient-details-title');
    const contentEl = document.getElementById('patient-details-content');
    
    if (modal && currentPatientDetails) {
        titleEl.innerHTML = `
            <span style="color: #667eea;">[ID: ${currentPatientDetails.id}]</span> 
            ${currentPatientDetails.first_name} ${currentPatientDetails.last_name}
        `;
        
        const age = calculateAge(currentPatientDetails.date_of_birth);
        contentEl.innerHTML = `
            <div class="patient-details-grid">
                <div class="detail-section">
                    <h4>Personal Information</h4>
                    <p><strong>Name:</strong> ${currentPatientDetails.first_name} ${currentPatientDetails.last_name}</p>
                    <p><strong>Age:</strong> ${age} years old</p>
                    <p><strong>Gender:</strong> ${currentPatientDetails.gender}</p>
                    <p><strong>Date of Birth:</strong> ${new Date(currentPatientDetails.date_of_birth).toLocaleDateString()}</p>
                    <p><strong>Blood Type:</strong> ${currentPatientDetails.blood_type || 'Not specified'}</p>
                </div>
                <div class="detail-section">
                    <h4>Contact Information</h4>
                    <p><strong>Parent:</strong> ${currentPatientDetails.parent_name}</p>
                    <p><strong>Phone:</strong> ${currentPatientDetails.phone}</p>
                    <p><strong>Patient Phone:</strong> ${currentPatientDetails.patient_phone || 'Not specified'}</p>
                    <p><strong>Address:</strong> ${currentPatientDetails.full_address || 'Not specified'}</p>
                </div>
                <div class="detail-section">
                    <h4>Medical Information</h4>
                    <p><strong>Allergies:</strong> ${currentPatientDetails.allergies || 'None specified'}</p>
                    <p><strong>Medical History:</strong> ${currentPatientDetails.medical_history || 'None specified'}</p>
                </div>
                <div class="detail-section">
                    <h4>Visit Information</h4>
                    <p><strong>Status:</strong> ${currentPatientDetails.status || 'Not specified'}</p>
                    <p><strong>Hall Status:</strong> ${currentPatientDetails.hall_status || 'Out'}</p>
                    <p><strong>Visit Type:</strong> ${currentPatientDetails.visit_type || 'Not specified'}</p>
                    <p><strong>Visit Date:</strong> ${currentPatientDetails.visit_datetime ? new Date(currentPatientDetails.visit_datetime).toLocaleString() : 'Not scheduled'}</p>
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
    }
}

function closePatientDetailsModal() {
    const modal = document.getElementById('patient-details-modal');
    if (modal) {
        modal.style.display = 'none';
        currentPatientDetails = null;
    }
}

// --- AWAITING HALL FUNCTIONALITY ---

async function loadAwaitingPatients() {
    const awaitingList = document.getElementById('awaiting-patients-list');
    if (!awaitingList) return;
    
    const awaitingPatients = patients.filter(p => p.hall_status === 'In' && p.status !== 'finished');
    
    if (awaitingPatients.length === 0) {
        awaitingList.innerHTML = '<p style="text-align: center; color: #718096;">No patients currently awaiting in hall.</p>';
        return;
    }
    
    awaitingList.innerHTML = awaitingPatients.map(p => {
        const age = calculateAge(p.date_of_birth);
        return `
            <div class="patient-card awaiting-patient">
                <div class="patient-header">
                    <div class="patient-name">${p.first_name} ${p.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${p.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Visit Time:</span> ${p.visit_datetime ? new Date(p.visit_datetime).toLocaleString() : 'Not scheduled'}</div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-success" onclick="markPatientFinished(${p.id})">✅ Mark Finished</button>
                    <button class="btn btn-primary" onclick="viewPatient(${p.id})">👁️ View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

async function markPatientFinished(patientId) {
    try {
        const response = await apiFetch(`/api/patients/${patientId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'finished', hall_status: 'Out' })
        });
        
        if (!response.ok) throw new Error('Failed to update patient status');
        
        showAlert('Patient marked as finished!', 'success');
        await loadInitialData();
        loadAwaitingPatients();
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

// --- FINISHED RESERVATIONS FUNCTIONALITY ---

async function loadFinishedPatients() {
    const finishedList = document.getElementById('finished-patients-list');
    if (!finishedList) return;
    
    const finishedPatients = patients.filter(p => p.status === 'finished');
    
    finishedList.innerHTML = finishedPatients.map(p => {
        const age = calculateAge(p.date_of_birth);
        return `
            <div class="patient-card finished-patient">
                <div class="patient-header">
                    <div class="patient-name">${p.first_name} ${p.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${p.visit_type || 'N/A'}</div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-info" onclick="generatePatientPDF(${p.id})">📄 Generate PDF</button>
                    ${p.has_paid 
                        ? `<button class="btn btn-secondary" disabled style="cursor: not-allowed;">✅ Paid</button>` 
                        : `<button class="btn btn-success" onclick="openPaymentForPatient(${p.id})">💰 Pay Now</button>`
                    }
                    <button class="btn btn-primary" onclick="viewPatient(${p.id})">👁️ Details</button>
                </div>
            </div>
        `;
    }).join('');
}
let currentDefaultPrice = 0;
function openPaymentForPatient(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.visit_type) return;

    showAddTransactionModal();
    selectPatientForTransaction(patientId);

    const displayLabel = document.getElementById('service-type-display');
    const hiddenInput = document.getElementById('service-type-hidden');
    
    // 1. Check if serviceTypes is loaded
    if (!serviceTypes || serviceTypes.length === 0) {
        console.error("Service types not loaded. Check /api/financial/service-types");
        hiddenInput.value = patient.visit_type; // Fallback to string
        displayLabel.textContent = patient.visit_type;
        return;
    }

    // 2. Perform the lookup
    const match = serviceTypes.find(s => 
        s.name.trim().toLowerCase() === patient.visit_type.trim().toLowerCase()
    );

    if (match) {
        currentDefaultPrice = match.default_price;
        displayLabel.textContent = `${match.name} - $${match.default_price}`;
        hiddenInput.value = match.id; // Send the numeric ID
        
        const amountInput = document.getElementById('amount');
        if (amountInput) amountInput.value = match.default_price;
            document.getElementById('comment-section').style.display = 'none';
            document.getElementById('price_comment').required = false;
    } else {
        // 3. Fallback: If no ID found, send the string name
        displayLabel.textContent = patient.visit_type;
        hiddenInput.value = patient.visit_type; 
        console.warn("No ID found for visit type, sending name string instead.");
    }

}

function checkAmountDifference() {
    const inputAmount = parseFloat(document.getElementById('amount').value) || 0;
    const commentSection = document.getElementById('comment-section');
    const commentInput = document.getElementById('price_comment');

    if (inputAmount < currentDefaultPrice) {
        commentSection.style.display = 'block';
        commentInput.required = true;
    } else {
        commentSection.style.display = 'none';
        commentInput.required = false;
    }
}
// async function loadFinishedPatients() {
//     const finishedList = document.getElementById('finished-patients-list');
//     if (!finishedList) return;
    
//     // Ensure we have fresh data from the global state
//     const finishedPatients = patients.filter(p => p.status === 'finished');
    
//     if (finishedPatients.length === 0) {
//         finishedList.innerHTML = '<p style="text-align: center; color: #718096;">No finished reservations found.</p>';
//         return;
//     }
    
//     finishedList.innerHTML = finishedPatients.map(p => {
//         // DEBUG: Check if ID exists in console if it fails
//         if (!p.id) console.error("Found patient without ID:", p);

//         const age = calculateAge(p.date_of_birth);
//         return `
//             <div class="patient-card finished-patient">
//                 <div class="patient-header">
//                     <div class="patient-name">${p.first_name} ${p.last_name}</div>
//                     <div class="patient-age">${age} years old</div>
//                 </div>
//                 <div class="patient-info">
//                     <div class="info-item"><span class="info-label">Visit Type:</span> ${p.visit_type || 'Not specified'}</div>
//                     <div class="info-item"><span class="info-label">Status:</span> <span class="status-finished">Finished</span></div>
//                 </div>
//                 <div class="patient-actions">
//                     <button class="btn btn-primary" onclick="viewPatient(${p.id})">👁️ Details</button>
//                     <button class="btn btn-info" onclick="generatePatientPDF(${p.id})">📄 Generate PDF</button>
//                 </div>
//             </div>
//         `;
//     }).join('');
// }


// --- PATIENT HISTORY FUNCTIONALITY ---

async function loadPatientHistory() {
    const historyList = document.getElementById('patient-history-list');
    if (!historyList) return;
    
    const patientsWithHistory = patients.filter(p => p.visit_datetime);
    
    if (patientsWithHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #718096;">No patient history found.</p>';
        return;
    }
    
    patientsWithHistory.sort((a, b) => new Date(b.visit_datetime) - new Date(a.visit_datetime));
    
    historyList.innerHTML = patientsWithHistory.map(p => {
        const age = calculateAge(p.date_of_birth);
        return `
            <div class="patient-card history-patient">
                <div class="patient-header">
                    <div class="patient-name">${p.first_name} ${p.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Date:</span> ${new Date(p.visit_datetime).toLocaleDateString()}</div>
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${p.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Status:</span> <span class="status-${p.status}">${p.status}</span></div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-primary" onclick="viewPatient(${p.id})">👁️ View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

function searchPatientHistory() {
    const searchTerm = document.getElementById('history-search').value.toLowerCase();
    const patientsWithHistory = patients.filter(p => p.visit_datetime);
    
    const filtered = patientsWithHistory.filter(p => 
        p.first_name.toLowerCase().includes(searchTerm) ||
        p.last_name.toLowerCase().includes(searchTerm) ||
        p.parent_name.toLowerCase().includes(searchTerm) ||
        p.visit_type?.toLowerCase().includes(searchTerm)
    );
    
    const historyList = document.getElementById('patient-history-list');
    if (!historyList) return;
    
    if (filtered.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #718096;">No matching history found.</p>';
        return;
    }
    
    filtered.sort((a, b) => new Date(b.visit_datetime) - new Date(a.visit_datetime));
    
    historyList.innerHTML = filtered.map(p => {
        const age = calculateAge(p.date_of_birth);
        return `
            <div class="patient-card history-patient">
                <div class="patient-header">
                    <div class="patient-name">${p.first_name} ${p.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Date:</span> ${new Date(p.visit_datetime).toLocaleDateString()}</div>
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${p.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Status:</span> <span class="status-${p.status}">${p.status}</span></div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-primary" onclick="viewPatient(${p.id})">👁️ View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- HALL STATUS MANAGER FUNCTIONALITY ---

// async function loadHallStatusPatients() {
//     const hallStatusList = document.getElementById('hall-status-list');
//     if (!hallStatusList) return;
    
//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);
    
//     const todayPatients = patients.filter(p => 
//         p.visit_datetime && new Date(p.visit_datetime) >= todayStart && p.status !== 'finished'
//     );
    
//     if (todayPatients.length === 0) {
//         hallStatusList.innerHTML = '<p style="text-align: center; color: #718096;">No patients scheduled for today.</p>';
//         return;
//     }
    
//     let html = '<div style="margin-bottom: 15px;"><button class="btn btn-primary" onclick="submitSelectedPatientsToHall()" style="margin-bottom: 15px;">Submit Selected "In" Patients</button></div>';
//     html += todayPatients.map(p => {
//         const age = calculateAge(p.date_of_birth);
//         return `
//             <div class="patient-card hall-status-patient">
//                 <div style="display: flex; align-items: flex-start; gap: 10px;">
//                     <input type="checkbox" class="hall-status-checkbox" data-patient-id="${p.id}" style="margin-top: 5px; cursor: pointer;" />
//                     <div style="flex: 1;">
//                         <div class="patient-header">
//                             <div class="patient-name">${p.first_name} ${p.last_name}</div>
//                             <div class="patient-age">${age} years old</div>
//                         </div>
//                         <div class="patient-info">
//                             <div class="info-item"><span class="info-label">Visit Time:</span> ${new Date(p.visit_datetime).toLocaleString()}</div>
//                             <div class="info-item"><span class="info-label">Visit Type:</span> ${p.visit_type || 'Not specified'}</div>
//                             <div class="info-item"><span class="info-label">Current Status:</span> <span class="status-${p.hall_status?.toLowerCase() || 'out'}">${p.hall_status || 'Out'}</span></div>
//                         </div>
//                     </div>
//                 </div>
//                 <div class="patient-actions">
//                     <button class="btn ${p.hall_status === 'In' ? 'btn-warning' : 'btn-success'}" 
//                             onclick="toggleHallStatus(${p.id}, '${p.hall_status === 'In' ? 'Out' : 'In'}')">
//                         ${p.hall_status === 'In' ? '🚪 Move Out' : '🏥 Move In'}
//                     </button>
//                     <button class="btn btn-primary" onclick="viewPatient(${p.id})">👁️ View Details</button>
//                 </div>
//             </div>
//         `;
//     }).join('');
//     hallStatusList.innerHTML = html;
// }

// async function toggleHallStatus(patientId, newStatus) {
//     try {
//         const response = await apiFetch(`/api/patients/${patientId}`, {
//             method: 'PUT',
//             body: JSON.stringify({ hall_status: newStatus })
//         });
        
//         if (!response.ok) throw new Error('Failed to update hall status');
        
//         showAlert(`Patient moved ${newStatus.toLowerCase()}!`, 'success');
//         await loadInitialData();
//         loadHallStatusPatients();
//     } catch (error) {
//         showAlert(`Error: ${error.message}`, 'error');
//     }
// }
async function loadHallStatusPatients() {
    const hallStatusList = document.getElementById('hall-status-list');
    if (!hallStatusList) return;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    // Filter for patients scheduled for today who aren't finished yet
    const todayPatients = patients.filter(p => 
        p.visit_datetime && new Date(p.visit_datetime) >= todayStart && p.status !== 'finished'
    );
    
    if (todayPatients.length === 0) {
        hallStatusList.innerHTML = '<p style="text-align: center; color: #718096; padding: 20px;">No patients scheduled for today.</p>';
        return;
    }
    
    let html = `
        <div style="margin-bottom: 15px; display: flex; justify-content:建设-between; align-items: center;">
            <button class="btn btn-primary" onclick="submitSelectedPatientsToHall()">📥 Submit Selected "In"</button>
        </div>
        <div class="table-container" style="background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f7fafc; border-bottom: 2px solid #edf2f7;">
                        <th style="padding: 12px; text-align: left;"><input type="checkbox" onclick="toggleSelectAllHall(this)"></th>
                        <th style="padding: 12px; text-align: left;">ID</th>
                        <th style="padding: 12px; text-align: left;">Patient Name</th>
                        <th style="padding: 12px; text-align: left;">Visit Type</th>
                        <th style="padding: 12px; text-align: left;">Current Status</th>
                        <th style="padding: 12px; text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    html += todayPatients.map(p => {
        const statusClass = p.hall_status?.toLowerCase() === 'in' ? 'status-in' : 'status-out';
        return `
            <tr style="border-bottom: 1px solid #edf2f7;" class="patient-row-hover">
                <td style="padding: 12px;"><input type="checkbox" class="hall-status-checkbox" data-patient-id="${p.id}"></td>
                <td style="padding: 12px;">${p.id}</td>
                <td style="padding: 12px;"><strong>${p.first_name} ${p.last_name}</strong></td>
                <td style="padding: 12px;">${p.visit_type || 'N/A'}</td>
                <td style="padding: 12px;"><span class="${statusClass}" style="padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">${p.hall_status || 'Out'}</span></td>
                <td style="padding: 12px; text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn btn-primary" style="padding: 6px 12px;" onclick="viewPatient(${p.id})">👁️ Details</button>
                    <button class="btn ${p.hall_status === 'In' ? 'btn-warning' : 'btn-success'}" 
                            style="padding: 6px 12px; min-width: 110px;"
                            onclick="toggleHallStatus(${p.id}, '${p.hall_status === 'In' ? 'Out' : 'In'}')">
                        ${p.hall_status === 'In' ? '🚪 Move Out' : '🏥 Move In'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    html += `</tbody></table></div>`;
    hallStatusList.innerHTML = html;
}

async function toggleHallStatus(patientId, newStatus) {
    try {
        const response = await apiFetch(`/api/patients/${patientId}`, {
            method: 'PUT',
            body: JSON.stringify({ hall_status: newStatus })
        });
        
        if (!response.ok) throw new Error('Failed to update hall status');
        
        showAlert(`Patient moved ${newStatus.toLowerCase()}!`, 'success');
        await loadInitialData();
        loadHallStatusPatients();
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

async function submitSelectedPatientsToHall() {
    const checkboxes = document.querySelectorAll('.hall-status-checkbox:checked');
    if (checkboxes.length === 0) {
        showAlert('Please select at least one patient to submit.', 'warning');
        return;
    }
    
    const selectedPatientIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.patientId));
    const selectedPatients = patients.filter(p => selectedPatientIds.includes(p.id));
    
    Promise.all(selectedPatients.map(p => 
        apiFetch(`/api/patients/${p.id}`, {
            method: 'PUT',
            body: JSON.stringify({ hall_status: 'In' })
        })
    )).then(responses => {
        if (responses.every(r => r.ok)) {
            showAlert(`${selectedPatients.length} patient(s) submitted to hall successfully!`, 'success');
            loadInitialData().then(() => loadHallStatusPatients());
        } else {
            showAlert('Some patients failed to update. Please try again.', 'error');
        }
    }).catch(error => {
        showAlert(`Error: ${error.message}`, 'error');
    });
}

// --- REPORTS FUNCTIONALITY ---

function generatePatientReport() { showAlert('Patient report generation is not yet implemented.', 'info'); }
function generateFinancialReport() { showAlert('Financial report generation is not yet implemented.', 'info'); }
function generateVisitReport() { showAlert('Visit report generation is not yet implemented.', 'info'); }

async function generatePatientPDF(patientId) {
    // If patientId is missing (from the modal click), use the ID of the patient currently being viewed
    const id = patientId || (currentPatientDetails ? currentPatientDetails.id : null);

    if (!id || id === 'undefined') {
        showAlert('Error: Patient ID is missing. Please refresh and try again.', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/patients/${id}/report`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to generate PDF');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `patient_${id}_report.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        showAlert('PDF report generated successfully!', 'success');
    } catch (error) {
        showAlert(`Error generating PDF: ${error.message}`, 'error');
    }
}

function addVitals() { showAlert('Adding vitals is not yet implemented.', 'info'); }

async function performDailyReset() {
    if (!confirm('Are you sure you want to perform a daily reset? This will reset all hall statuses to "Out".')) {
        return;
    }
    
    try {
        const resetPromises = patients.map(p => 
            apiFetch(`/api/patients/${p.id}`, {
                method: 'PUT',
                body: JSON.stringify({ hall_status: 'Out' })
            })
        );
        
        await Promise.all(resetPromises);
        
        showAlert('Daily reset completed successfully!', 'success');
        await loadInitialData();
        updateDashboard();
    } catch (error) {
        showAlert(`Error during daily reset: ${error.message}`, 'error');
    }
}
// --- MASTER CONTROLS (PHASE 2) ---

let activeMasterWorkspace = null;

// This runs during initializeApp()
function setupUIForRole() {
    const isMaster = String(currentUser?.id).startsWith('master_');
    
    // 1. Setup Settings Tab View
    if (isMaster) {
        document.querySelector('.standard-settings-view').style.display = 'none';
        document.getElementById('master-settings-view').style.display = 'block';
        document.getElementById('settings-tab').style.display = 'block'; // Ensure tab is visible
    } else if (currentUser?.role === 'admin') {
        document.getElementById('settings-tab').style.display = 'block';
        document.getElementById('financial-tab').style.display = 'block';
    }

    // 2. ENFORCE FEATURE TOGGLES (Hide tabs that aren't allowed)
    if (!isMaster && clinicConfig && clinicConfig.active_features) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            const featureName = tab.dataset.tab;
            // Never hide settings or financial for admins
            if (featureName === 'settings') return; 
            if (featureName === 'financial' && currentUser.role !== 'admin') return;
            
            if (featureName && !clinicConfig.active_features.includes(featureName)) {
                tab.style.display = 'none'; // Feature is disabled, hide the tab!
            }
        });
    }
}

// Open the Modal
function openMasterModal(workspace) {
    activeMasterWorkspace = workspace;
    document.getElementById('master-modal-title').textContent = `Managing: ${workspace.toUpperCase()}`;
    document.getElementById('master-prefix-display').textContent = workspace === 'clinic' ? 'clnc_' : 'lab_';
    
    // Populate the checkboxes based on current config (we fetch fresh config to be safe)
    apiFetch('/api/clinic/config', { headers: {'X-App-Mode': workspace} })
        .then(res => res.json())
        .then(data => {
            const features = data.active_features || [];
            document.querySelectorAll('#master-features-form input[type="checkbox"]').forEach(cb => {
                cb.checked = features.includes(cb.value);
            });
        });

    document.getElementById('master-management-modal').style.display = 'block';
    showMasterView('add-client'); // Default view
}

function closeMasterModal() {
    document.getElementById('master-management-modal').style.display = 'none';
    activeMasterWorkspace = null;
}

// Switch between 'Add Client' and 'Configure Features'
function showMasterView(viewId) {
    document.getElementById('master-view-add-client').style.display = 'none';
    document.getElementById('master-view-configure-features').style.display = 'none';
    document.getElementById(`master-view-${viewId}`).style.display = 'block';
}

// Submit Create User Form
document.getElementById('master-create-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawUsername = document.getElementById('master-new-username').value;
    const password = document.getElementById('master-new-password').value;
    const role = document.getElementById('master-new-role').value;

    try {
        const response = await fetch('/api/auth/master/create-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target_workspace: activeMasterWorkspace,
                username: rawUsername,
                password: password,
                role: role
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        
        showAlert(data.message, 'success');
        e.target.reset();
    } catch (error) {
        showAlert(error.message, 'error');
    }
});

// Submit Features Form
document.getElementById('master-features-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const checkedBoxes = document.querySelectorAll('#master-features-form input[type="checkbox"]:checked');
    const selectedFeatures = Array.from(checkedBoxes).map(cb => cb.value);

    try {
        const response = await fetch('/api/auth/master/update-features', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target_workspace: activeMasterWorkspace,
                features: selectedFeatures
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        
        showAlert(data.message, 'success');
        if (activeMasterWorkspace === currentWorkspace) {
            window.location.reload(); // Reload to apply changes if editing current workspace
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
});