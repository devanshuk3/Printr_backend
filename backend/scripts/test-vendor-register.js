require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

async function main() {
  const vendorId = `testvendor${Math.floor(Math.random() * 100000)}`;
  const password = 'Password123';

  const data = {
    vendor_id: vendorId,
    password,
    full_name: 'Test Vendor',
    shop_name: 'Test Shop',
    phone: '9999999999',
    upi_id: 'test@upi',
    address: 'Somewhere',
    bw_price: 5,
    color_price: 15,
    paper_sizes: 'A4',
    has_bw_printer: true,
    has_color_printer: false,
  };

  try {
    const check = await db.query('SELECT id FROM vendors WHERE LOWER(vendor_id) = LOWER($1)', [data.vendor_id]);
    if (check.rows.length > 0) {
      console.log('already exists', data.vendor_id);
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const query = `
      INSERT INTO vendors (vendor_id, password, full_name, shop_name, phone, upi_id, address, bw_price, color_price, paper_sizes, has_bw_printer, has_color_printer)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING vendor_id
    `;

    const values = [
      data.vendor_id,
      hashedPassword,
      data.full_name,
      data.shop_name,
      data.phone,
      data.upi_id,
      data.address,
      data.bw_price || 0,
      data.color_price || 0,
      data.paper_sizes,
      data.has_bw_printer ?? true,
      data.has_color_printer ?? false,
    ];

    const result = await db.query(query, values);
    console.log('inserted', result.rows[0]);
  } catch (err) {
    console.error('ERROR', err.code, err.message);
    process.exitCode = 1;
  } finally {
    // Pool is internal to db.js; end process after query completes.
  }
}

main();

