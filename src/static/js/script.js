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


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', main);

/**
 * Main function to orchestrate the application startup.
 * Includes the critical fix for the login loop.
 */
async function main() {
    try {
        // CRITICAL FIX: Added { credentials: 'include' } to ensure the session cookie is sent.
        const response = await fetch('/api/auth/check-session', { credentials: 'include' });
        
        if (!response.ok) throw new Error('Auth check failed');
        
        const data = await response.json();
        if (data.authenticated) {
            currentUser = data.user;
            await initializeApp();
        } else {
            // If the server says we are not authenticated, go to login.
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Initialization failed:', error);
        // On any error, it's safest to require login.
        window.location.href = '/login';
    }
}


/**
 * Sets up the entire application after successful authentication.
 */
async function initializeApp() {
    setupEventListeners();
    await loadInitialData();
    setupUIForRole();
    updateUserInfo();
}

/**
 * Attaches all necessary event listeners to the static elements on the page.
 */
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (tabName) showTab(tabName);
        });
    });

    // Dashboard card clicks
    document.getElementById('total-patients-card')?.addEventListener('click', showTotalPatientsDetails);
    document.getElementById('new-patients-card')?.addEventListener('click', showNewPatientsDetails);
    document.getElementById('avg-age-card')?.addEventListener('click', showAverageAgeDetails);
    document.getElementById('today-patients-card')?.addEventListener('click', toggleTodayPatientsDetails);

    // Forms
    document.getElementById('patient-form')?.addEventListener('submit', handleAddPatient);
    document.getElementById('clinic-config-form')?.addEventListener('submit', handleUpdateConfig);
    document.getElementById('reservation-form')?.addEventListener('submit', handleCreateReservation);
    document.getElementById('transaction-form')?.addEventListener('submit', handleAddTransaction);

    // Other UI Elements
    document.getElementById('add-transaction-tab')?.addEventListener('click', showAddTransactionModal);
    document.getElementById('patient-search')?.addEventListener('keyup', searchPatients);
}

// --- DATA & UI ---

async function loadInitialData() {
    try {
        const [patientsRes, configRes, serviceTypesRes] = await Promise.all([
            fetch('/api/patients'),
            fetch('/api/clinic/config'),
            fetch('/api/financial/service-types')
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
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        showAlert('Could not load initial application data.', 'error');
    }
}

function populateServiceTypes() {
    const serviceTypeSelect = document.getElementById('service-type');
    if (serviceTypeSelect && serviceTypes) {
        serviceTypeSelect.innerHTML = '<option value="">Select Service Type</option>';
        serviceTypes.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            option.textContent = `${service.name} - $${service.default_price}`;
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
    
    // Load data for specific tabs when they are opened
    switch(tabName) {
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
                        <span class="status-${p.hall_status?.toLowerCase() || 'out'}">${p.hall_status || 'Out'}</span>
                    </div>
                `).join('');
            }
        }
    }
}

// --- PATIENT MANAGEMENT ---

function displayPatients(patientsToDisplay) {
    const patientsListDiv = document.getElementById('patients-list');
    if (!patientsListDiv) return;

    if (patientsToDisplay.length === 0) {
        patientsListDiv.innerHTML = '<p style="text-align: center; color: #718096;">No patients found.</p>';
        return;
    }

    patientsListDiv.innerHTML = patientsToDisplay.map(patient => {
        const age = calculateAge(patient.date_of_birth);
        return `
            <div class="patient-card">
                <div class="patient-header">
                    <div class="patient-name">${patient.first_name} ${patient.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                 <div class="patient-info">
                    <div class="info-item"><span class="info-label">Parent:</span> ${patient.parent_name || 'N/A'}</div>
                    <div class="info-item"><span class="info-label">Phone:</span> ${patient.phone || 'N/A'}</div>
                </div>
                 <div class="patient-actions">
                    <button class="btn btn-primary" onclick="viewPatient(${patient.id})">👁️ View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

function searchPatients() {
    const searchTerm = document.getElementById('patient-search').value.toLowerCase();
    const filtered = patients.filter(p => 
        p.first_name.toLowerCase().includes(searchTerm) ||
        p.last_name.toLowerCase().includes(searchTerm) ||
        p.parent_name.toLowerCase().includes(searchTerm) ||
        p.id.toString().includes(searchTerm)
    );
    displayPatients(filtered);
}

async function handleAddPatient(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const patientData = Object.fromEntries(formData.entries());
    patientData.allergies = formData.getAll('allergies');

    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patientData)
        });
        if (!response.ok) throw new Error((await response.json()).error);
        
        showAlert('Patient added successfully!', 'success');
        form.reset();
        await loadInitialData();
        showTab('dashboard');
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

// --- SETTINGS ---

function populateSettingsForm() {
    // FIX: Only attempt to populate the settings form if the user is an admin and the elements exist.
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
        const response = await fetch('/api/clinic/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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


// --- GLOBAL FUNCTIONS for onclick="..." ---

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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
            fetch('/api/financial/dashboard'),
            fetch('/api/financial/analytics/revenue?period=month')
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


// --- IMPLEMENTED DASHBOARD CARD FUNCTIONS ---

function showTotalPatientsDetails() {
    const examination = patients.filter(p => p.visit_type === 'examination').length;
    const fastExamination = patients.filter(p => p.visit_type === 'fast examination').length;
    const consultation = patients.filter(p => p.visit_type === 'consultation').length;
    
    const content = `
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
    showStatsModal('Total Patients by Visit Type', content);
}

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


// --- PLACEHOLDER FUNCTIONS ---
function performDailyReset() { showAlert('Daily Reset is not yet implemented.', 'info'); }
function showAddTransactionModal() { showAlert('Adding transactions is not yet implemented.', 'info'); }
function submitSelectedPatientsToHall() { showAlert('Submitting patients to hall is not yet implemented.', 'info'); }
function viewPatient(id) { showAlert(`Viewing patient ${id} is not yet implemented.`, 'info'); }
async function loadAwaitingPatients() { console.log("Loading awaiting patients..."); }
async function loadFinishedPatients() { console.log("Loading finished patients..."); }
async function loadHallStatusPatients() { console.log("Loading hall status patients..."); }


// --- NEW RESERVATION FUNCTIONALITY ---

function searchPatientsForReservation() {
    const searchTerm = document.getElementById('reservation-patient-search').value.toLowerCase();
    const resultsDiv = document.getElementById('reservation-patient-results');
    
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
    
    resultsDiv.innerHTML = filtered.map(patient => `
        <div class="patient-search-result" onclick="selectPatientForReservation(${patient.id})">
            <strong>${patient.first_name} ${patient.last_name}</strong><br>
            <small>Parent: ${patient.parent_name} | Phone: ${patient.phone}</small>
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
        
        // Set default date to today
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
        const response = await fetch(`/api/patients/${selectedPatientForReservation.id}/reservation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reservationData)
        });
        
        if (!response.ok) throw new Error((await response.json()).error);
        
        showAlert('Reservation created successfully!', 'success');
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
        populateServiceTypes();
        
        // Set default transaction date to now
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
    
    resultsDiv.innerHTML = filtered.map(patient => `
        <div class="patient-search-result" onclick="selectPatientForTransaction(${patient.id})">
            <strong>${patient.first_name} ${patient.last_name}</strong><br>
            <small>Parent: ${patient.parent_name} | Phone: ${patient.phone}</small>
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
    const form = event.target;
    const formData = new FormData(form);
    const transactionData = Object.fromEntries(formData.entries());

    try {
        const response = await fetch('/api/financial/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transactionData)
        });
        
        if (!response.ok) throw new Error((await response.json()).error);
        
        showAlert('Transaction added successfully!', 'success');
        closeTransactionModal();
        await loadInitialData();
    } catch (error) {
        showAlert(`Error: ${error.message}`, 'error');
    }
}

// --- PATIENT DETAILS FUNCTIONALITY ---

async function viewPatient(patientId) {
    try {
        const response = await fetch(`/api/patients/${patientId}`);
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
        titleEl.textContent = `${currentPatientDetails.first_name} ${currentPatientDetails.last_name}`;
        
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
    
    awaitingList.innerHTML = awaitingPatients.map(patient => {
        const age = calculateAge(patient.date_of_birth);
        return `
            <div class="patient-card awaiting-patient">
                <div class="patient-header">
                    <div class="patient-name">${patient.first_name} ${patient.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${patient.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Visit Time:</span> ${patient.visit_datetime ? new Date(patient.visit_datetime).toLocaleString() : 'Not scheduled'}</div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-success" onclick="markPatientFinished(${patient.id})">✅ Mark Finished</button>
                    <button class="btn btn-primary" onclick="viewPatient(${patient.id})">👁️ View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

async function markPatientFinished(patientId) {
    try {
        const response = await fetch(`/api/patients/${patientId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
    
    if (finishedPatients.length === 0) {
        finishedList.innerHTML = '<p style="text-align: center; color: #718096;">No finished reservations found.</p>';
        return;
    }
    
    finishedList.innerHTML = finishedPatients.map(patient => {
        const age = calculateAge(patient.date_of_birth);
        return `
            <div class="patient-card finished-patient">
                <div class="patient-header">
                    <div class="patient-name">${patient.first_name} ${patient.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${patient.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Visit Time:</span> ${patient.visit_datetime ? new Date(patient.visit_datetime).toLocaleString() : 'Not scheduled'}</div>
                    <div class="info-item"><span class="info-label">Status:</span> <span class="status-finished">Finished</span></div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-primary" onclick="viewPatient(${patient.id})">👁️ View Details</button>
                    <button class="btn btn-info" onclick="generatePatientPDF(${patient.id})">📄 Generate PDF</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- PATIENT HISTORY FUNCTIONALITY ---

async function loadPatientHistory() {
    const historyList = document.getElementById('patient-history-list');
    if (!historyList) return;
    
    const patientsWithHistory = patients.filter(p => p.visit_datetime);
    
    if (patientsWithHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #718096;">No patient history found.</p>';
        return;
    }
    
    // Sort by visit date, most recent first
    patientsWithHistory.sort((a, b) => new Date(b.visit_datetime) - new Date(a.visit_datetime));
    
    historyList.innerHTML = patientsWithHistory.map(patient => {
        const age = calculateAge(patient.date_of_birth);
        return `
            <div class="patient-card history-patient">
                <div class="patient-header">
                    <div class="patient-name">${patient.first_name} ${patient.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Date:</span> ${new Date(patient.visit_datetime).toLocaleDateString()}</div>
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${patient.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Status:</span> <span class="status-${patient.status}">${patient.status}</span></div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-primary" onclick="viewPatient(${patient.id})">👁️ View Details</button>
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
    
    // Sort by visit date, most recent first
    filtered.sort((a, b) => new Date(b.visit_datetime) - new Date(a.visit_datetime));
    
    historyList.innerHTML = filtered.map(patient => {
        const age = calculateAge(patient.date_of_birth);
        return `
            <div class="patient-card history-patient">
                <div class="patient-header">
                    <div class="patient-name">${patient.first_name} ${patient.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Date:</span> ${new Date(patient.visit_datetime).toLocaleDateString()}</div>
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${patient.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Status:</span> <span class="status-${patient.status}">${patient.status}</span></div>
                </div>
                <div class="patient-actions">
                    <button class="btn btn-primary" onclick="viewPatient(${patient.id})">👁️ View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- HALL STATUS MANAGER FUNCTIONALITY ---

async function loadHallStatusPatients() {
    const hallStatusList = document.getElementById('hall-status-list');
    if (!hallStatusList) return;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayPatients = patients.filter(p => 
        p.visit_datetime && new Date(p.visit_datetime) >= todayStart
    );
    
    if (todayPatients.length === 0) {
        hallStatusList.innerHTML = '<p style="text-align: center; color: #718096;">No patients scheduled for today.</p>';
        return;
    }
    
    hallStatusList.innerHTML = todayPatients.map(patient => {
        const age = calculateAge(patient.date_of_birth);
        return `
            <div class="patient-card hall-status-patient">
                <div class="patient-header">
                    <div class="patient-name">${patient.first_name} ${patient.last_name}</div>
                    <div class="patient-age">${age} years old</div>
                </div>
                <div class="patient-info">
                    <div class="info-item"><span class="info-label">Visit Time:</span> ${new Date(patient.visit_datetime).toLocaleString()}</div>
                    <div class="info-item"><span class="info-label">Visit Type:</span> ${patient.visit_type || 'Not specified'}</div>
                    <div class="info-item"><span class="info-label">Current Status:</span> <span class="status-${patient.hall_status?.toLowerCase() || 'out'}">${patient.hall_status || 'Out'}</span></div>
                </div>
                <div class="patient-actions">
                    <button class="btn ${patient.hall_status === 'In' ? 'btn-warning' : 'btn-success'}" 
                            onclick="toggleHallStatus(${patient.id}, '${patient.hall_status === 'In' ? 'Out' : 'In'}')">
                        ${patient.hall_status === 'In' ? '🚪 Move Out' : '🏥 Move In'}
                    </button>
                    <button class="btn btn-primary" onclick="viewPatient(${patient.id})">👁️ View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleHallStatus(patientId, newStatus) {
    try {
        const response = await fetch(`/api/patients/${patientId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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

// --- REPORTS FUNCTIONALITY ---

function generatePatientReport() {
    showAlert('Patient report generation is not yet implemented.', 'info');
}

function generateFinancialReport() {
    showAlert('Financial report generation is not yet implemented.', 'info');
}

function generateVisitReport() {
    showAlert('Visit report generation is not yet implemented.', 'info');
}

async function generatePatientPDF(patientId) {
    try {
        const response = await fetch(`/api/patients/${patientId}/report`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to generate PDF');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `patient_${patientId}_report.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        showAlert('PDF report generated successfully!', 'success');
    } catch (error) {
        showAlert(`Error generating PDF: ${error.message}`, 'error');
    }
}

// --- PLACEHOLDER FUNCTIONS FOR PATIENT DETAILS MODAL ---

function editPatient() {
    showAlert('Patient editing is not yet implemented.', 'info');
}

function addVitals() {
    showAlert('Adding vitals is not yet implemented.', 'info');
}

// --- DAILY RESET FUNCTIONALITY ---

async function performDailyReset() {
    if (!confirm('Are you sure you want to perform a daily reset? This will reset all hall statuses to "Out".')) {
        return;
    }
    
    try {
        // Reset all patients' hall status to 'Out'
        const resetPromises = patients.map(patient => 
            fetch(`/api/patients/${patient.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
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

// --- SUBMIT SELECTED PATIENTS TO HALL ---

function submitSelectedPatientsToHall() {
    showAlert('Submitting selected patients to hall is not yet implemented.', 'info');
}

