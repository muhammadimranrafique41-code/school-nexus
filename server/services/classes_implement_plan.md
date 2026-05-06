# Implementation Plan: Classes & Session Management (School_Nexus)

## 1. Objective
Implement the **Classes & Session Management** module to allow schools to:
- Digitally manage class structures (classes, sections, streams).
- Automatically promote students to the next class at session end.
- Link classes and sections to specific academic sessions.
- Assign different fee structures and custom funds to different classes or sections.

This module is a core academic component of School_Nexus.

## 2. Prerequisites
- Existing database tables: `classes`, `sections`, `academic_sessions` (or equivalent). If missing, they will be created.
- Existing relationships: `students` table has `class_id` and `session_id` (or `academic_year`).
- Backend: Express + Drizzle ORM (PostgreSQL). Frontend: React + TanStack Query.

## 3. Task Breakdown (Priority Order)

### ✅ 3.1 Database Schema Design & Migration
**Files**: `server/migrations/YYYYMMDD_classes_session_management.sql`

**Tables to create/modify**:

```sql
-- Academic sessions (e.g., 2024-2025)
CREATE TABLE academic_sessions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,                -- "2024-2025"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classes (e.g., Grade 1, Grade 2)
CREATE TABLE classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,                -- "Grade 1"
  code VARCHAR(20) UNIQUE,                  -- "G1"
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sections (e.g., A, B, C) within a class
CREATE TABLE sections (
  id SERIAL PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name VARCHAR(20) NOT NULL,                -- "A"
  capacity INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, name)
);

-- Link students to a specific class + section + session
ALTER TABLE students ADD COLUMN class_id INT REFERENCES classes(id);
ALTER TABLE students ADD COLUMN section_id INT REFERENCES sections(id);
ALTER TABLE students ADD COLUMN academic_session_id INT REFERENCES academic_sessions(id);

-- Promotion history (audit trail)
CREATE TABLE promotion_history (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  from_class_id INT REFERENCES classes(id),
  to_class_id INT REFERENCES classes(id),
  from_section_id INT REFERENCES sections(id),
  to_section_id INT REFERENCES sections(id),
  academic_session_id INT REFERENCES academic_sessions(id),
  promotion_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fee structure per class (for assignment)
ALTER TABLE fee_structures ADD COLUMN class_id INT REFERENCES classes(id);
ALTER TABLE custom_funds ADD COLUMN class_id INT REFERENCES classes(id);