Implement the **Teachers, Staff & Employee Management Module** within the `d:\School-Nexus` workspace. This module must handle comprehensive staff records, payroll processing, and loan tracking, integrating directly with the existing Drizzle ORM setup.

### 1. Database Schema Implementation
Translate the following SQL definitions into Drizzle ORM schema definitions in `shared/schema.ts`. Ensure you use `pgTable`, `serial`, `varchar`, `text`, `date`, `timestamp`, `decimal`, `integer`, and `jsonb` as appropriate.

**Key Requirements:**
- **Staff Table:** Add a `userId` column (integer, nullable) to `staff` that references `users.id` to link staff members to system accounts.
- **Salary Structures:** Use `jsonb` for `allowances` and `deductions` to allow flexible pay components.
- **Salary Payments:** Ensure a unique constraint on `[staffId, paymentMonth]`.
- **Relationships:** Define Drizzle relations between `staff`, `salary_structures`, `salary_payments`, and `staff_loans`.

```sql
-- Staff master table
CREATE TABLE staff (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  address TEXT,
  date_of_birth DATE,
  gender VARCHAR(10),
  staff_type VARCHAR(50) NOT NULL,              -- 'teaching' or 'non-teaching'
  designation VARCHAR(100),
  department VARCHAR(100),
  joining_date DATE NOT NULL,
  leaving_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  bank_name VARCHAR(100),
  bank_account_number VARCHAR(50),
  ifsc_code VARCHAR(20),
  pan_number VARCHAR(20),
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Salary structure
CREATE TABLE salary_structures (
  id SERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  basic_salary DECIMAL(12,2) NOT NULL,
  allowances JSONB,
  deductions JSONB,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monthly salary payments
CREATE TABLE salary_payments (
  id SERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staff(id),
  payment_month DATE NOT NULL,
  gross_salary DECIMAL(12,2) NOT NULL,
  total_deductions DECIMAL(12,2) DEFAULT 0,
  net_salary DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(50),
  transaction_id VARCHAR(100),
  remarks TEXT,
  processed_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, payment_month)
);

-- Loans & advances
CREATE TABLE staff_loans (
  id SERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staff(id),
  loan_type VARCHAR(50) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  approved_date DATE NOT NULL,
  monthly_installment DECIMAL(12,2),
  total_installments INT,
  installments_paid INT DEFAULT 0,
  outstanding_balance DECIMAL(12,2),
  interest_rate DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  approved_by INT REFERENCES users(id),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Loan repayment tracking
CREATE TABLE loan_repayments (
  id SERIAL PRIMARY KEY,
  loan_id INT NOT NULL REFERENCES staff_loans(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  repayment_date DATE NOT NULL,
  salary_payment_id INT REFERENCES salary_payments(id),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance tracking
CREATE TABLE staff_attendance (
  id SERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staff(id),
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  check_in TIME,
  check_out TIME,
  remarks TEXT,
  UNIQUE(staff_id, attendance_date)
);
```

### 2. Backend Implementation
1. **Service Layer:** Create `server/services/staffService.ts` to handle business logic for salary calculation, loan balance updates, and attendance-based proration.
2. **API Routes:** Create `server/routes/staff.ts` and register it in `server/index.ts`. Implement CRUD endpoints for staff, salary processing, and loan management.
3. **Ledger Integration:** Ensure that every `salary_payment` record automatically triggers an expense entry in the **Ledger Management** module.

### 3. Frontend Implementation
1. **Staff Directory:** Create a list and detail view for staff records in `client/src/pages/staff/`.
2. **Payroll Dashboard:** Implement a monthly processing view where admins can generate `salary_payments` based on `salary_structures`.
3. **Loan Management:** Provide an interface to approve loans and view repayment history.
4. **State Management:** Use TanStack Query for all data fetching and mutations, ensuring cache invalidation after salary processing or staff updates.