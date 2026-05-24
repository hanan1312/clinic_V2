# Medical Analysis Laboratory Management System

## Overview

This application has been transformed from a **Pediatric Clinic Management System** into a **Medical Analysis Laboratory Management System**. The transformation maintains the core architecture while adapting terminology, data models, UI, and features to serve laboratory operations.

## Key Changes

### 1. **Data Models**

#### New Models Created:
- **Client** (`src/models/client.py`): Replaces the `Patient` model with lab-specific fields
  - Removed: `parent_name` → Changed to `contact_person`
  - Removed: `medical_history` → Changed to `clinical_indications`
  - Updated: `visit_*` fields → `test_*` fields
  - Updated: `hall_status` → `sample_status` (pending, collected, processing, completed)
  - Updated: `doctor_comments` → `technician_notes`

- **TestResult** (`src/models/test_result.py`): New model for managing laboratory test results
  - Stores test parameters, results, reference ranges, and status
  - Links to clients for complete test history
  - Supports multiple test categories (Hematology, Chemistry, Serology, etc.)

- **LabConfig** (`src/models/lab_config.py`): Replaces `ClinicConfig` with lab-specific settings
  - Lab name, director, phone, address
  - Feature toggles for lab-specific workflows

#### Retained Models:
- **User**: Authentication and role management (adapted for lab roles)
- **Financial**: Billing and payment tracking (compatible with lab services)

### 2. **API Routes**

#### New Routes:
- **Client Management** (`src/routes/client.py`):
  - `GET/POST /api/clients` - List and create clients
  - `GET/PUT/DELETE /api/clients/<id>` - Manage individual clients
  - `GET /api/dashboard/stats` - Lab dashboard statistics
  - `GET /api/clients/<id>/lab-report` - Generate lab reports (PDF)
  - `GET /api/clients/history/report` - Client history report

- **Test Results** (`src/routes/test_result.py`):
  - `GET/POST /api/test-results` - Manage test results
  - `GET/PUT/DELETE /api/test-results/<id>` - Individual result management
  - `GET /api/test-results/stats/summary` - Test statistics

- **Lab Configuration** (`src/routes/lab.py`):
  - `GET /api/lab/config` - Retrieve lab settings
  - `PUT /api/lab/config` - Update lab settings

#### Updated Routes:
- Patient routes remain available for backward compatibility
- Clinic routes remain available for dual-workspace support

### 3. **Frontend UI**

#### New Interface Files:
- **index_lab.html**: Lab-specific dashboard and interface
  - Dashboard with lab metrics (pending tests, completed today, etc.)
  - Client management interface
  - Pending samples tracking
  - Test results viewing and management
  - Client history and reports
  - Lab configuration settings

- **script_lab.js**: Lab-specific JavaScript logic
  - Client CRUD operations
  - Sample status management
  - Test result tracking
  - PDF report generation
  - Lab-specific search and filtering

#### Updated Branding:
- **login.html**: Updated with lab branding
  - Title: "Medical Analysis Laboratory Management System"
  - Updated user roles (Admin, Technician, Pathologist)
  - Lab-focused messaging

### 4. **Validation**

#### New Validators (`src/utils/validators.py`):
- `validate_sample_status()` - Validates sample collection status
- `validate_test_status()` - Validates test completion status
- `validate_test_type()` - Validates test types (blood, urine, etc.)
- `validate_client_data()` - Comprehensive client validation for lab context

### 5. **Terminology Mapping**

| Clinic Term | Lab Term |
|------------|----------|
| Patient | Client |
| Doctor | Technician/Pathologist |
| Clinic | Laboratory |
| Reservation | Test Order/Appointment |
| Visit | Test |
| Medical History | Clinical Indications |
| Doctor Comments | Technician Notes |
| Hall Status | Sample Status |
| Examination | Test Type |

## Database Schema

### Clients Table
```sql
- id (Primary Key)
- first_name, last_name
- date_of_birth, gender
- contact_person (emergency contact)
- phone, client_phone
- address fields (city, area, street, apartment)
- blood_type, allergies
- clinical_indications
- vital signs (temperature, BP, weight, height)
- test_date, test_time, test_datetime
- test_type, sample_status, status
- technician_notes
- timestamps (created_at, updated_at)
```

### TestResults Table
```sql
- id (Primary Key)
- client_id (Foreign Key)
- test_name, test_category
- sample_type
- parameter_name, result_value
- unit, reference_range
- status (pending, completed, abnormal, normal)
- sample_collection_date, test_completion_date
- technician_notes, pathologist_notes
- timestamps (created_at, updated_at)
```

### LabConfig Table
```sql
- id (Primary Key)
- lab_name, lab_director
- lab_phone, lab_address
- logo_path
- active_features (JSON)
```

## Features

### Dashboard
- **Total Clients**: Count of all registered clients
- **Pending Tests**: Number of tests awaiting sample collection
- **Completed Today**: Tests completed in the current day
- **Average Client Age**: Statistical metric for client demographics

### Client Management
- Add new clients with comprehensive information
- Edit client details
- View client history and test results
- Delete clients (with cascade to test results)
- Bulk operations (select multiple clients)
- Search and filter clients

### Sample Management
- Track pending samples for collection
- Mark samples as collected
- Monitor sample processing status
- View sample collection history

### Test Results
- Enter test results with parameters and values
- Track reference ranges and abnormal results
- Assign status (pending, completed, abnormal, normal)
- Add technician and pathologist notes
- View test history per client

### Reporting
- Generate PDF lab reports per client
- Include test results, reference ranges, and status
- Client demographics and clinical indications
- Export functionality

### Financial Management
- Track service types and pricing
- Manage transactions and payments
- Generate financial reports
- Support multiple payment methods

## Installation & Setup

### Prerequisites
- Python 3.8+
- Flask 2.3.3
- SQLAlchemy 3.0.5
- ReportLab 4.0.4

### Installation
```bash
cd /home/ubuntu/lab_management_app
pip install -r requirements.txt
```

### Database Initialization
```bash
python create_default_users.py
```

### Running the Application
```bash
python -m src.main
```

The application will be available at `http://localhost:7000`

## User Roles

### Admin
- Full access to all features
- User management and creation
- Lab configuration
- Financial management
- Report access

### Technician
- Client registration and management
- Sample collection tracking
- Test result entry
- Basic reporting

### Pathologist
- Test result analysis and validation
- Abnormal result flagging
- Report generation
- Result interpretation

## Dual-Workspace Support

The application supports both clinic and lab workspaces:
- **Clinic Workspace**: Original pediatric clinic management
- **Lab Workspace**: Medical analysis laboratory management

To enable workspace switching:
1. Set `ENABLE_WORKSPACE_SWITCHER = True` in `src/main.py`
2. Users can switch between workspaces using the dropdown selector
3. Each workspace maintains separate data in different databases

## API Endpoints Summary

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/current_user` - Get current user info
- `GET /api/auth/check-session` - Check session status

### Clients
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create new client
- `GET /api/clients/<id>` - Get client details
- `PUT /api/clients/<id>` - Update client
- `DELETE /api/clients/<id>` - Delete client
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/clients/<id>/lab-report` - Generate PDF report

### Test Results
- `GET /api/test-results` - List test results
- `POST /api/test-results` - Create test result
- `GET /api/test-results/<id>` - Get test result
- `PUT /api/test-results/<id>` - Update test result
- `DELETE /api/test-results/<id>` - Delete test result
- `GET /api/test-results/stats/summary` - Test statistics

### Lab Configuration
- `GET /api/lab/config` - Get lab settings
- `PUT /api/lab/config` - Update lab settings

## File Structure

```
lab_management_app/
├── src/
│   ├── models/
│   │   ├── user.py
│   │   ├── client.py (NEW)
│   │   ├── test_result.py (NEW)
│   │   ├── lab_config.py (NEW)
│   │   ├── patient.py (retained for compatibility)
│   │   ├── clinic_config.py (retained for compatibility)
│   │   ├── financial.py
│   │   └── reservation.py
│   ├── routes/
│   │   ├── user.py
│   │   ├── client.py (NEW)
│   │   ├── test_result.py (NEW)
│   │   ├── lab.py (NEW)
│   │   ├── patient.py (retained)
│   │   ├── clinic.py (retained)
│   │   └── financial.py
│   ├── static/
│   │   ├── index.html (clinic version)
│   │   ├── index_lab.html (NEW - lab version)
│   │   ├── login.html (updated branding)
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       ├── script.js (clinic version)
│   │       └── script_lab.js (NEW - lab version)
│   ├── utils/
│   │   ├── validators.py (updated with lab validators)
│   │   └── error_handlers.py
│   └── main.py (updated with lab routes)
├── database/
├── config.py
├── create_default_users.py
├── requirements.txt
└── LAB_TRANSFORMATION_README.md (this file)
```

## Future Enhancements

1. **Advanced Analytics**
   - Test result trends and patterns
   - Client demographics analysis
   - Performance metrics

2. **Integration**
   - LIMS (Laboratory Information Management System) integration
   - EHR/EMR system connectivity
   - Automated result distribution

3. **Quality Management**
   - Quality control tracking
   - Equipment calibration logs
   - Proficiency testing

4. **Mobile Application**
   - Mobile app for sample collection
   - Push notifications for results
   - QR code scanning for samples

5. **Advanced Reporting**
   - Customizable report templates
   - Batch report generation
   - Email distribution

## Support & Troubleshooting

### Common Issues

**Issue**: Database migration errors
**Solution**: Run `python create_default_users.py` to initialize databases

**Issue**: Import errors for new models
**Solution**: Ensure `src/main.py` imports all new models and routes

**Issue**: Frontend not loading lab interface
**Solution**: Verify that `index_lab.html` and `script_lab.js` are in correct paths

## License

This application maintains the same license as the original clinic management system.

## Changelog

### Version 2.0 (Lab Management)
- Transformed from clinic to laboratory management system
- Added Client model (replaces Patient)
- Added TestResult model for test tracking
- Added LabConfig model for lab settings
- Created lab-specific API routes
- Implemented new frontend interface (index_lab.html)
- Updated validation rules for lab context
- Updated login page with lab branding
- Maintained backward compatibility with clinic workspace

---

**Last Updated**: May 22, 2026
**Transformation Date**: May 21, 2026
