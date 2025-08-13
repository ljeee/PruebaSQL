// server.js - Simple Express CRUD for users (Postgres)
// This file is a basic web server with CRUD operations for users

// ========== IMPORT DEPENDENCIES ========== 
const express = require('express'); // Web framework
const { Pool } = require('pg'); // PostgreSQL client
const cors = require('cors'); // Allow cross-origin requests
const fs = require('fs'); // File system
const path = require('path'); // Path utilities
const multer = require('multer'); // File upload middleware
const csv = require('csv-parser'); // CSV file parser
require('dotenv').config(); // Load environment variables

// ========== DATABASE CONNECTION ========== 
// Create a connection pool to PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});


// ========== EXPRESS APP SETUP ========== 
const app = express();
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies


// ========== MASS UPLOAD FROM CSV ========== 
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
const upload = multer({ dest: uploadsDir });

// ========== IMPORT ALL NORMALIZED DATA ========== 
// POST /import-all - Import normalized CSV into all tables
app.post('/import-all', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const filePath = req.file.path;
  const rows = [];
  try {
    // Read CSV and collect all rows
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    let insertedCustomers = 0;
    let insertedInvoices = 0;
    let insertedTransactions = 0;

    for (const row of rows) {
      // 1. Insert/find customer
      const customerResult = await pool.query(
        `INSERT INTO customers (name, identification_number, address, phone, email)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (identification_number) DO UPDATE SET name=EXCLUDED.name RETURNING *`,
        [
          row.name?.trim(),
          row.identification_number,
          row.address?.trim(),
          row.phone?.trim(),
          row.email?.trim()
        ]
      );
      const customer = customerResult.rows[0];
      if (customerResult.rowCount > 0) insertedCustomers++;

      // 2. Insert/find invoice
      // Convert billing_period to date (YYYY-MM or YYYY-MM-DD)
      let billingPeriod = row.billing_period;
      if (billingPeriod && billingPeriod.length === 7) billingPeriod += '-01';
      const invoiceResult = await pool.query(
        `INSERT INTO invoices (customer_id, invoice_number, billing_period, invoiced_amount, paid_amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (invoice_number) DO UPDATE SET invoiced_amount=EXCLUDED.invoiced_amount RETURNING *`,
        [
          customer.customer_id,
          row.invoice_number,
          billingPeriod,
          row.invoices_amount || row.invoiced_amount,
          row.paid_amount || 0
        ]
      );
      const invoice = invoiceResult.rows[0];
      if (invoiceResult.rowCount > 0) insertedInvoices++;

      // 3. Insert transaction
      // Map status/type to DB values
      let status = row.transaction_status?.toUpperCase();
      if (status === 'PENDIENTE') status = 'PENDING';
      if (status === 'COMPLETADA') status = 'COMPLETED';
      if (status === 'FALLIDA') status = 'FAILED';
      let type = row.transaction_type?.toUpperCase();
      if (type === 'PAGO DE FACTURA') type = 'INVOICE_PAYMENT';
      // Insert transaction
      await pool.query(
        `INSERT INTO transactions (transaction_id, invoice_id, transaction_datetime, transaction_amount, transaction_status, transaction_type, payment_platform)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [
          row.transaction_id,
          invoice.invoice_id,
          row.transaction_datetime,
          row.transaction_amount,
          status,
          type,
          row.payment_platform
        ]
      );
      insertedTransactions++;
    }

    res.status(201).json({
      message: 'Import completed',
      customers: insertedCustomers,
      invoices: insertedInvoices,
      transactions: insertedTransactions
    });
  } catch (error) {
    console.error('Error importing all data:', error);
    res.status(500).json({ error: 'Internal error importing all data.' });
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// ========== CRUD ENDPOINTS FOR CUSTOMERS ========== 
// GET /customers - Get all customers
app.get('/customers', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM customers ORDER BY customer_id');
    res.json(r.rows);
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ error: 'Error getting customers' });
  }
});

// POST /customers - Create a new customer
app.post('/customers', async (req, res) => {
  try {
    const { name, identification_number, address, phone, email } = req.body;
    // Check all fields
    if (!name || !identification_number || !address || !phone || !email) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    // Insert customer into database
    const r = await pool.query(
      `INSERT INTO customers (name, identification_number, address, phone, email)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, identification_number, address, phone, email]
    );
    res.status(201).json(r.rows[0]);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Error creating customer' });
  }
});

// PATCH /customers/:id - Update a customer
app.patch('/customers/:id', async (req, res) => {
  try {
    const { name, identification_number, address, phone, email } = req.body;
    const id = req.params.id;
    // Update customer in database
    const r = await pool.query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        identification_number = COALESCE($2, identification_number),
        address = COALESCE($3, address),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email)
      WHERE customer_id = $6 RETURNING *`,
      [name, identification_number, address, phone, email, id]
    );
    res.json(r.rows[0] || null);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Error updating customer' });
  }
});

// DELETE /customers/:id - Delete a customer
app.delete('/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query(
      'DELETE FROM customers WHERE customer_id = $1 RETURNING *',
      [id]
    );
    res.json(r.rows[0] || null);
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Error deleting customer' });
  }
});

// ========== MASS UPLOAD FROM CSV ========== 
// POST /customers/upload - Upload CSV and insert into customers, invoices, and transactions
app.post('/customers/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const filePath = req.file.path;
  const rows = [];
  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    let insertedCustomers = 0;
    let insertedInvoices = 0;
    let insertedTransactions = 0;

    for (const row of rows) {
      const customerResult = await pool.query(
        `INSERT INTO customers (name, identification_number, address, phone, email)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (identification_number) DO UPDATE SET name=EXCLUDED.name RETURNING *`,
        [
          row.name?.trim(),
          row.identification_number,
          row.address?.trim(),
          row.phone?.trim(),
          row.email?.trim()
        ]
      );
      const customer = customerResult.rows[0];
      if (customerResult.rowCount > 0) insertedCustomers++;

      let billingPeriod = row.billing_period;
      if (billingPeriod && billingPeriod.length === 7) billingPeriod += '-01';
      const invoiceResult = await pool.query(
        `INSERT INTO invoices (customer_id, invoice_number, billing_period, invoiced_amount, paid_amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (invoice_number) DO UPDATE SET invoiced_amount=EXCLUDED.invoiced_amount RETURNING *`,
        [
          customer.customer_id,
          row.invoice_number,
          billingPeriod,
          row.invoices_amount || row.invoiced_amount,
          row.paid_amount || 0
        ]
      );
      const invoice = invoiceResult.rows[0];
      if (invoiceResult.rowCount > 0) insertedInvoices++;

      let status = row.transaction_status?.toUpperCase();
      if (status === 'PENDIENTE') status = 'PENDING';
      if (status === 'COMPLETADA') status = 'COMPLETED';
      if (status === 'FALLIDA') status = 'FAILED';
      let type = row.transaction_type?.toUpperCase();
      if (type === 'PAGO DE FACTURA') type = 'INVOICE_PAYMENT';
      await pool.query(
        `INSERT INTO transactions (transaction_id, invoice_id, transaction_datetime, transaction_amount, transaction_status, transaction_type, payment_platform)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [
          row.transaction_id,
          invoice.invoice_id,
          row.transaction_datetime,
          row.transaction_amount,
          status,
          type,
          row.payment_platform
        ]
      );
      insertedTransactions++;
    }

    res.status(201).json({
      message: 'Import completed',
      customers: insertedCustomers,
      invoices: insertedInvoices,
      transactions: insertedTransactions
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Internal error processing file.' });
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// ========== NORMALIZE CUSTOMER CSV ========== 
// POST /normalize-csv - Normalize a CSV file for customers
app.post('/normalize-csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const filePath = req.file.path;
  const outputFile = path.join(uploadsDir, 'clientes_normalizados.csv');
  const clientes = [];
  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          const name = row['Nombre del Cliente'] || row['name'];
          const identification_number = row['Número de Identificación'] || row['identification_number'];
          const address = row['Dirección'] || row['address'];
          const phone = row['Teléfono'] || row['phone'];
          const email = row['Correo Electrónico'] || row['email'];
          if (
            name && identification_number && address && phone && email &&
            !isNaN(Number(identification_number))
          ) {
            clientes.push({
              name: name.trim(),
              identification_number: identification_number.trim(),
              address: address.trim(),
              phone: phone.trim(),
              email: email.trim()
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Remove duplicates by identification_number
    const unique = {};
    clientes.forEach(c => {
      unique[c.identification_number] = c;
    });
    const resultado = Object.values(unique);

    // Write normalized file
    const encabezado = 'name,identification_number,address,phone,email\n';
    const filas = resultado.map(c =>
      `"${c.name}","${c.identification_number}","${c.address}","${c.phone}","${c.email}"`
    ).join('\n');
    fs.writeFileSync(outputFile, encabezado + filas, 'utf8');

    res.status(201).json({
      message: `Normalized file generated.`,
      customers: resultado.length,
      file: 'clientes_normalizados.csv'
    });
  } catch (error) {
    console.error('Error normalizing file:', error);
    res.status(500).json({ error: 'Internal error normalizing file.' });
  } finally {
    // Delete uploaded file after processing
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});


// ========== HEALTH CHECK ========== 
// GET /health - Check if server is running
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ========== START SERVER ========== 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Express server running at http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('   GET    /health    - Server status');
  console.log('   GET    /customers     - List customers');
  console.log('   POST   /customers     - Create customer');
  console.log('   PATCH  /customers/:id - Update customer');
  console.log('   DELETE /customers/:id - Delete customer');
  console.log('   POST   /customers/upload - Mass upload CSV');
  console.log('   POST   /normalize-csv - Normalize customer CSV');
});
