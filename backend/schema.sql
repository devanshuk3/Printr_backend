-- Printr Database Schema

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(50) UNIQUE NOT NULL,
    shop_name VARCHAR(255) NOT NULL,
    bw_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    color_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    phone VARCHAR(20),
    upi_id VARCHAR(255),
    pages_printed INTEGER DEFAULT 0,
    platform_fee DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_files (
    id SERIAL PRIMARY KEY,
    object_key VARCHAR(512) UNIQUE NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    user_id INTEGER NOT NULL,
    file_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'uploaded',
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delete_after TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS print_queue (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    vendor_id VARCHAR(50) NOT NULL,
    user_id INTEGER,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    username VARCHAR(255),
    total_pages INTEGER,
    total_amount DECIMAL(10, 2),
    page_count INTEGER,
    status VARCHAR(50) DEFAULT 'queued',
    object_key VARCHAR(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);
