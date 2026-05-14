const { z } = require('zod');



/** Alphanumeric string with optional hyphens/underscores, max 50 chars */
const vendorIdField = z.string().trim().min(1, 'Vendor ID is required').max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Vendor ID must be alphanumeric (hyphens/underscores allowed)');

/** Standard email with normalization */
const emailField = z.string().trim().email('Invalid email address').max(255).toLowerCase();

/** Password: 8+ chars, at least one uppercase, one lowercase, one digit */
const passwordField = z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password is too long');

/** Username: 3-50 alphanumeric + underscores */
const usernameField = z.string().trim().min(3, 'Username must be at least 3 characters').max(50, 'Username is too long').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

/** Full name: sanitized text */
const fullNameField = z.string().trim().min(1, 'Full name is required').max(255);

/** Positive integer (for IDs, page counts, etc.) */
const positiveInt = z.coerce.number().int().positive();

/** Non-negative integer */
const nonNegativeInt = z.coerce.number().int().min(0);

/** Non-negative float (for prices/amounts) */
const nonNegativeFloat = z.coerce.number().min(0);

/** Page range string e.g. "1-5, 8, 10-12" — basic format validation */
const pageRangeField = z.string().trim().max(500).regex(/^[\d\s,\-]*$/, 'Invalid page range format').optional();

// ─────────────────────────────────────────────────────────────────────────────
// AUTH SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  username: usernameField,
  password: passwordField,
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required').max(255),
  password: z.string().min(1, 'Password is required').max(128),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'ID Token is required').max(5000),
});

const updateUsernameSchema = z.object({
  username: usernameField,
});

const verifyEmailSchema = z.object({
  userId: z.coerce.number().int().positive('User ID is required'),
  otp: z.string().trim().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
});

const resendOtpSchema = z.object({
  userId: z.coerce.number().int().positive('User ID is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const vendorLoginSchema = z.object({
  vendor_id: z.string().trim().min(1, 'Vendor ID is required').max(50),
  password: z.string().min(1, 'Password is required').max(128),
});

const vendorRegisterSchema = z.object({
  vendor_id: vendorIdField,
  password: passwordField,
  full_name: fullNameField,
  shop_name: z.string().trim().min(1, 'Shop name is required').max(255),
  phone: z.string().trim().max(20).optional().nullable(),
  upi_id: z.string().trim().max(255).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  bw_price: nonNegativeFloat.optional(),
  color_price: nonNegativeFloat.optional(),
  bw_price_single: nonNegativeFloat.optional(),
  bw_price_2_to_5: nonNegativeFloat.optional(),
  bw_price_6_to_9: nonNegativeFloat.optional(),
  bw_price_10_plus: nonNegativeFloat.optional(),
  color_price_single: nonNegativeFloat.optional(),
  color_price_2_to_5: nonNegativeFloat.optional(),
  color_price_6_to_9: nonNegativeFloat.optional(),
  color_price_10_plus: nonNegativeFloat.optional(),
  hard_binding_price: nonNegativeFloat.optional(),
  spiral_binding_price: nonNegativeFloat.optional(),
  paper_sizes: z.string().trim().max(255).optional().nullable(),
  has_bw_printer: z.boolean().optional(),
  has_color_printer: z.boolean().optional(),
});

const vendorSettingsSchema = z.object({
  shop_name: z.string().trim().min(1).max(255).optional(),
  bw_price: nonNegativeFloat.optional(),
  color_price: nonNegativeFloat.optional(),
  bw_price_single: nonNegativeFloat.optional(),
  bw_price_2_to_5: nonNegativeFloat.optional(),
  bw_price_6_to_9: nonNegativeFloat.optional(),
  bw_price_10_plus: nonNegativeFloat.optional(),
  color_price_single: nonNegativeFloat.optional(),
  color_price_2_to_5: nonNegativeFloat.optional(),
  color_price_6_to_9: nonNegativeFloat.optional(),
  color_price_10_plus: nonNegativeFloat.optional(),
  hard_binding_price: nonNegativeFloat.optional(),
  spiral_binding_price: nonNegativeFloat.optional(),
  paper_sizes: z.string().trim().max(255).optional(),
  upi_id: z.string().trim().max(255).optional(),
  auto_accept_jobs: z.boolean().optional(),
  enable_upi: z.boolean().optional(),
  min_amount: nonNegativeFloat.optional(),
  has_bw_printer: z.boolean().optional(),
  has_color_printer: z.boolean().optional(),
  bw_printer: z.string().trim().max(255).optional(),
  color_printer: z.string().trim().max(255).optional(),
}).refine(data => Object.keys(data).some(k => data[k] !== undefined), {
  message: 'At least one setting must be provided',
});

// ─────────────────────────────────────────────────────────────────────────────
// ORDER / UPLOAD SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/json',
];

const uploadUrlSchema = z.object({
  vendorId: vendorIdField,
  fileName: z.string().trim().min(1, 'File name is required').max(100),
  contentType: z.enum(ALLOWED_CONTENT_TYPES, { errorMap: () => ({ message: 'Unsupported file type' }) }),
  totalPages: nonNegativeInt.optional(),
  totalAmount: nonNegativeFloat.optional(),
  orderId: positiveInt.optional(),
  isColor: z.boolean().optional(),
  pageCount: positiveInt.optional(),
  pageSize: z.string().trim().max(50).optional(),
});

const orderBatchSchema = z.object({
  vendorId: vendorIdField,
  paymentMethod: z.enum(['Online', 'Cash on Delivery']).optional().default('Online'),
  paymentStatus: z.enum(['pending', 'completed']).optional().default('pending'),
  files: z.array(z.object({
    pageCount: positiveInt.optional().default(1),
    totalAmount: nonNegativeFloat.optional().default(0),
    isColor: z.boolean().optional().default(false),
    pageSize: z.string().trim().max(50).optional(),
  })).min(1, 'At least one file is required').max(20, 'Maximum 20 files per batch'),
});

const patchOrderSchema = z.object({
  total_amount: nonNegativeFloat.optional(),
  is_color: z.boolean().optional(),
  page_count: positiveInt.optional(),
  pageSize: z.string().trim().max(50).optional(),
  payment_method: z.enum(['Online', 'Cash on Delivery']).optional(),
  payment_status: z.enum(['pending', 'completed']).optional(),
}).refine(data => Object.keys(data).some(k => data[k] !== undefined), {
  message: 'At least one field to update is required',
});

const incrementStatsSchema = z.object({
  vendorId: vendorIdField,
  pages: z.coerce.number().int().min(1, 'Pages must be at least 1'),
  totalAmount: nonNegativeFloat.optional(),
});

const updateOrderStatusSchema = z.object({
  orderId: z.coerce.number().int().positive('Order ID is required'),
  status: z.enum(['printed', 'rejected', 'cancelled'], { errorMap: () => ({ message: 'Status must be one of: printed, rejected, cancelled' }) }),
});

const clearVendorSchema = z.object({
  vendorId: vendorIdField,
});

const downloadSchema = z.object({
  file_key: z.string().trim().min(1, 'file_key is required').max(512),
  id: positiveInt.optional(),
});

const printedLegacySchema = z.object({
  id: z.coerce.number().int().positive('Order ID is required'),
});

const deleteOrderSchema = z.object({
  id: z.coerce.number().int().positive('Order ID is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const calculatePaymentSchema = z.object({
  vendorId: vendorIdField,
  totalPages: nonNegativeInt,
  copies: z.coerce.number().int().min(1, 'Copies must be at least 1').max(999, 'Maximum 999 copies'),
  colorMode: z.enum(['Colored', 'Black & White'], { errorMap: () => ({ message: 'Color mode must be "Colored" or "Black & White"' }) }),
  doubleSided: z.enum(['YES', 'NO'], { errorMap: () => ({ message: 'Double sided must be "YES" or "NO"' }) }),
  pageSelection: z.enum(['All', 'Custom'], { errorMap: () => ({ message: 'Page selection must be "All" or "Custom"' }) }),
  customRange: pageRangeField,
  pageSize: z.string().trim().max(50).optional(),
  binding: z.enum(['None', 'Spiral Binding', 'Hard Binding'], { errorMap: () => ({ message: 'Binding must be None, Spiral Binding, or Hard Binding' }) }).optional().default('None'),
});

// ─────────────────────────────────────────────────────────────────────────────
// PARAM SCHEMAS (for URL parameters)
// ─────────────────────────────────────────────────────────────────────────────

const vendorIdParamSchema = z.object({
  vendorId: vendorIdField,
});

const fileParamsSchema = z.object({
  vendorId: vendorIdField,
  fileName: z.string().trim().min(1).max(255),
});

const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Order ID must be a positive integer'),
});

const usernameParamSchema = z.object({
  username: z.string().trim().min(1).max(50),
});

// ─────────────────────────────────────────────────────────────────────────────
// QUERY SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const queueQuerySchema = z.object({
  vendor_id: z.string().trim().min(1, 'vendor_id is required').max(50),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  cursor: z.string().optional(),
});

const downloadQuerySchema = z.object({
  key: z.string().trim().min(1, 'key is required').max(512),
});


module.exports = {
  // Auth
  registerSchema,
  loginSchema,
  googleAuthSchema,
  updateUsernameSchema,
  verifyEmailSchema,
  resendOtpSchema,

  // Vendor
  vendorLoginSchema,
  vendorRegisterSchema,
  vendorSettingsSchema,

  // Orders / Uploads
  uploadUrlSchema,
  orderBatchSchema,
  patchOrderSchema,
  incrementStatsSchema,
  updateOrderStatusSchema,
  clearVendorSchema,
  downloadSchema,
  printedLegacySchema,
  deleteOrderSchema,

  // Payment
  calculatePaymentSchema,

  // Params
  vendorIdParamSchema,
  fileParamsSchema,
  orderIdParamSchema,
  usernameParamSchema,

  // Query
  queueQuerySchema,
  downloadQuerySchema,
};
