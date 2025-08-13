-- ============================================
-- TABLE: customers
-- ============================================
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    identification_number BIGINT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE
);

-- ============================================
-- TABLE: invoices
-- ============================================
CREATE TABLE invoices (
    invoice_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    invoice_number VARCHAR(20) UNIQUE NOT NULL,
    billing_period DATE NOT NULL,
    invoiced_amount NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) DEFAULT 0,
    CONSTRAINT fk_invoice_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id)
        ON DELETE CASCADE
);

-- ============================================
-- TABLE: transactions
-- ============================================
CREATE TABLE transactions (
    transaction_id VARCHAR(20) PRIMARY KEY,
    invoice_id INT NOT NULL,
    transaction_datetime TIMESTAMP NOT NULL,
    transaction_amount NUMERIC(12,2) NOT NULL,
    transaction_status VARCHAR(20) NOT NULL CHECK (transaction_status IN ('PENDING','COMPLETED','FAILED')),
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('INVOICE_PAYMENT','REFUND')),
    payment_platform VARCHAR(50) NOT NULL,
    CONSTRAINT fk_transaction_invoice
        FOREIGN KEY (invoice_id)
        REFERENCES invoices(invoice_id)
        ON DELETE CASCADE
);
