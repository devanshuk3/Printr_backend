# Printr Project Structure

This document outlines the detailed structure of the Printr project, which consists of a Node.js backend and a React Native (Expo) mobile application.

## Directory Tree

```text
.
├── backend/                       # Node.js Express backend
│   ├── index.js                   # Application entry point
│   ├── db.js                      # Database connection setup
│   ├── init-db.js                 # Database initialization script
│   ├── r2.js                      # Cloudflare R2 integration (storage)
│   ├── schema.sql                 # SQL database schema
│   ├── migrate_indexes.js         # Database migration for indexes
│   ├── migrate_payment_columns.js # Database migration for payment columns
│   ├── middleware/                # Express middleware
│   │   ├── auth.js                # Authentication middleware
│   │   ├── rateLimiter.js         # Rate limiting middleware
│   │   ├── roleAuth.js            # Role-based authorization
│   │   ├── schemas.js             # Validation schemas
│   │   └── validator.js           # Request validation
│   ├── routes/                    # API route definitions
│   │   ├── auth.js                # Authentication routes
│   │   ├── payment.js             # Payment processing routes
│   │   └── vendors.js             # Vendor management routes
│   ├── utils/                     # Utility functions
│   │   ├── cleanup.js             # Cleanup jobs
│   │   ├── converter.js           # Document conversion utilities
│   │   ├── errorHandler.js        # Global error handling
│   │   ├── lockout.js             # Account lockout logic
│   │   ├── mailer.js              # Email sending utilities
│   │   ├── meta.js                # Metadata extraction utilities
│   │   ├── otp.js                 # OTP generation and verification
│   │   └── pricing.js             # Pricing calculation logic
│   ├── public/                    # Static assets
│   │   └── docs/                  # Legal documents (Privacy Policy, Terms)
│   ├── scripts/                   # Utility scripts for testing/ops
│   │   └── test-vendor-register.js
│   └── package.json               # Backend dependencies
│
├── mobile-app/                    # React Native Expo mobile application
│   ├── app/                       # Expo Router application routes
│   │   ├── _layout.tsx            # Root layout
│   │   ├── index.tsx              # Entry screen
│   │   ├── (auth)/                # Authentication flow screens
│   │   │   ├── login.tsx
│   │   │   └── signup.tsx
│   │   ├── (main)/                # Main application screens
│   │   │   ├── home.tsx
│   │   │   ├── modal.tsx
│   │   │   └── print-preferences.tsx
│   │   └── (admin)/               # Admin screens
│   │       └── vendors.tsx
│   ├── components/                # Reusable React components
│   │   ├── modals/                # Modal components (OTP, FilePreview)
│   │   └── ui/                    # Base UI components (Inputs, Text, etc.)
│   ├── constants/                 # Application constants
│   │   ├── apiConfig.ts           # API configuration
│   │   ├── auth.ts                # Auth constants
│   │   ├── supabaseConfig.ts      # Supabase configuration
│   │   └── theme.ts               # Theming constants
│   ├── hooks/                     # Custom React hooks
│   ├── utils/                     # Utility functions for mobile app
│   │   ├── authStorage.ts         # Secure auth token storage
│   │   ├── avatar.ts              # Avatar utilities
│   │   ├── pageCounter.ts         # Page counting logic
│   │   ├── sharedState.ts         # Global state management
│   │   └── supabaseClient.ts      # Supabase client initialization
│   ├── assets/                    # Images, fonts, and static assets
│   ├── package.json               # Mobile app dependencies
│   ├── app.json                   # Expo configuration
│   └── tsconfig.json              # TypeScript configuration
│
└── Assets/                        # Project-level generic assets
```

## Overview
- **Backend**: An Express.js server providing APIs for authentication, printing services, vendor management, and payments. Uses a relational database and Cloudflare R2 for storage.
- **Mobile App**: A React Native application built with Expo and Expo Router, connecting to the backend for the user interface. It integrates with Supabase and has flows for Auth, Main User, and Admin.
