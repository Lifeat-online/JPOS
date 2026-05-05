-- Migration: Add password_hash column to staff table
-- Run this SQL on your MariaDB database to add password support

ALTER TABLE staff ADD COLUMN password_hash VARCHAR(255) AFTER email;

-- Create index on email for faster lookups (if not already created)
-- Note: email already has an index if it was defined as UNIQUE, otherwise add:
-- CREATE INDEX idx_staff_email ON staff(email);
