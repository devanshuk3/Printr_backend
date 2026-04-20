const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS
  }
});

async function sendOTPEmail(toEmail, otp) {
  await transporter.sendMail({
    from: `"Printr" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify your Printr account',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fafafa; border-radius: 12px;">
        <h1 style="color: #1a1a1a; font-size: 22px; margin-bottom: 8px;">Verify your email</h1>
        <p style="color: #555; font-size: 15px; margin-bottom: 24px;">Enter this code in the Printr app to verify your account:</p>
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111;">${otp}</span>
        </div>
        <p style="color: #999; font-size: 13px;">This code expires in 10 minutes. If you didn't sign up for Printr, you can ignore this email.</p>
      </div>
    `
  });
}

module.exports = { sendOTPEmail };
