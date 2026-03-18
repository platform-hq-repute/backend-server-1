import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { authenticator } from 'otplib';import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Generate config.js for web pages from env vars (replaces cloud build placeholder substitution)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configOutputPath = path.join(__dirname, '../web/config.js');
const configContent = `window.REPUTEHQ_CONFIG = {
  SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
  SUPABASE_ANON_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
  OPENAI_API_KEY: '${process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY || ''}',
  APP_NAME: 'ReputeHQ',
  ENVIRONMENT: '${process.env.NODE_ENV || 'production'}'
};`;
fs.writeFileSync(configOutputPath, configContent);
console.log('config.js generated for web pages');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Serve web frontend static files
app.use(express.static(path.join(__dirname, '../web')));

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Email sending function using Resend
async function sendEmail(to, subject, html) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  console.log('=== Email Send Attempt ===');
  console.log('To:', to);
  console.log('From:', EMAIL_FROM);
  console.log('API Key exists:', !!RESEND_API_KEY);
  console.log('API Key starts with:', RESEND_API_KEY ? RESEND_API_KEY.substring(0, 6) + '...' : 'N/A');

  if (!RESEND_API_KEY || RESEND_API_KEY === 're_your_api_key') {
    console.log('(Email not sent - RESEND_API_KEY not configured)');
    return { success: true, mock: true };
  }

  try {
    const emailPayload = {
      from: EMAIL_FROM,
      to: [to],
      subject: subject,
      html: html
    };

    console.log('Sending email with payload:', JSON.stringify({ ...emailPayload, html: '[HTML content]' }));

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    const data = await response.json();
    console.log('Resend API response status:', response.status);
    console.log('Resend API response:', JSON.stringify(data));

    if (!response.ok) {
      console.error('Email send failed:', data);
    }

    return { success: response.ok, data };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

// Generate verification token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Hash password (same as frontend)
async function hashPassword(password) {
  const hash = crypto.createHash('sha256');
  hash.update(password);
  return hash.digest('hex');
}

// ============================================
// AUTH ROUTES
// ============================================

// Sign up with email verification
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email_verified')
      .ilike('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Generate verification token
    const verificationToken = generateToken();
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        name: name,
        password_hash: passwordHash,
        status: 'pending_verification',
        email_verified: false,
        verification_token: verificationToken,
        verification_token_expires: tokenExpiry,
        business_count: 0
      })
      .select()
      .single();

    if (createError) {
      throw new Error(createError.message);
    }

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email.html?token=${verificationToken}`;

    const emailResult = await sendEmail(
      email,
      'Verify your ReputeHQ account',
      `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1A1F36 0%, #2D3555 100%); padding: 40px 30px; text-align: center; }
          .header h1 { color: #00D4AA; margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .content h2 { color: #1A1F36; margin-top: 0; }
          .content p { color: #6B7280; line-height: 1.6; }
          .button { display: inline-block; background: #00D4AA; color: #1A1F36 !important; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { padding: 20px 30px; background: #f9fafb; text-align: center; color: #9CA3AF; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ReputeHQ</h1>
          </div>
          <div class="content">
            <h2>Welcome, ${name}!</h2>
            <p>Thank you for signing up for ReputeHQ. Please verify your email address to activate your account.</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #00D4AA;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ReputeHQ. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
      `
    );

    res.json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      emailSent: emailResult.success
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message || 'Failed to create account' });
  }
});

// Verify email
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user with this token
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('verification_token', token)
      .single();

    if (findError || !user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Check if token expired
    if (new Date(user.verification_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
    }

    // Update user as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        status: 'active',
        verification_token: null,
        verification_token_expires: null
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Send welcome/confirmation email
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login.html`;
    await sendEmail(
      user.email,
      'Welcome to ReputeHQ - Email Verified!',
      `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1A1F36 0%, #2D3555 100%); padding: 40px 30px; text-align: center; }
          .header h1 { color: #00D4AA; margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .content h2 { color: #1A1F36; margin-top: 0; }
          .content p { color: #6B7280; line-height: 1.6; }
          .success-badge { display: inline-block; background: #00D4AA; color: #1A1F36; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin-bottom: 20px; }
          .button { display: inline-block; background: #00D4AA; color: #1A1F36 !important; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { padding: 20px 30px; background: #f9fafb; text-align: center; color: #9CA3AF; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ReputeHQ</h1>
          </div>
          <div class="content">
            <span class="success-badge">✓ Email Verified</span>
            <h2>Welcome, ${user.name}!</h2>
            <p>Great news! Your email address has been successfully verified and your ReputeHQ account is now active.</p>
            <p>You can now sign in and start managing your business reputation.</p>
            <p style="text-align: center;">
              <a href="${loginUrl}" class="button">Sign In to Your Account</a>
            </p>
            <p>Here's what you can do with ReputeHQ:</p>
            <ul style="color: #6B7280; line-height: 2;">
              <li>Monitor and respond to customer reviews</li>
              <li>Track your business reputation score</li>
              <li>Generate AI-powered review responses</li>
              <li>Manage multiple business locations</li>
            </ul>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ReputeHQ. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
      `
    );

    res.json({ success: true, message: 'Email verified successfully. You can now sign in.' });

  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify email' });
  }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .single();

    if (findError || !user) {
      return res.status(400).json({ error: 'No account found with this email' });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new token
    const verificationToken = generateToken();
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Update user with new token
    await supabase
      .from('users')
      .update({
        verification_token: verificationToken,
        verification_token_expires: tokenExpiry
      })
      .eq('id', user.id);

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email.html?token=${verificationToken}`;

    await sendEmail(
      email,
      'Verify your ReputeHQ account',
      `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
          .header { background: linear-gradient(135deg, #1A1F36 0%, #2D3555 100%); padding: 40px 30px; text-align: center; }
          .header h1 { color: #00D4AA; margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .button { display: inline-block; background: #00D4AA; color: #1A1F36 !important; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
          .footer { padding: 20px 30px; background: #f9fafb; text-align: center; color: #9CA3AF; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ReputeHQ</h1>
          </div>
          <div class="content">
            <h2>Verify your email</h2>
            <p>Click the button below to verify your email address:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>This link will expire in 24 hours.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} ReputeHQ. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
      `
    );

    res.json({ success: true, message: 'Verification email sent' });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: error.message || 'Failed to resend verification email' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .single();

    if (findError || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if email is verified
    if (!user.email_verified) {
      return res.status(401).json({
        error: 'Please verify your email before signing in',
        needsVerification: true,
        email: user.email
      });
    }

    // Verify password
    const passwordHash = await hashPassword(password);
    if (user.password_hash !== passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if 2FA is enabled
    if (user.two_factor_enabled) {
      // Return partial login - needs 2FA code
      return res.json({
        success: true,
        requires2FA: true,
        userId: user.id
      });
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        two_factor_enabled: user.two_factor_enabled || false
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// ============================================
// TWO-FACTOR AUTHENTICATION ROUTES
// ============================================

// Generate 2FA secret and QR code
app.post('/api/auth/2fa/setup', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Find user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (findError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    // Generate secret
    const secret = authenticator.generateSecret();

    // Store secret temporarily (not enabled yet)
    await supabase
      .from('users')
      .update({ two_factor_secret: secret })
      .eq('id', userId);

    // Generate QR code
    const otpauthUrl = authenticator.keyuri(user.email, 'ReputeHQ', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({
      success: true,
      secret: secret,
      qrCode: qrCodeDataUrl,
      manualEntryKey: secret.match(/.{1,4}/g).join(' ') // Formatted for manual entry
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: error.message || 'Failed to setup 2FA' });
  }
});

// Verify and enable 2FA
app.post('/api/auth/2fa/verify-setup', async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: 'User ID and verification code are required' });
    }

    // Find user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, two_factor_secret, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (findError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.two_factor_secret) {
      return res.status(400).json({ error: 'Please start 2FA setup first' });
    }

    // Verify the code
    const isValid = authenticator.verify({
      token: code,
      secret: user.two_factor_secret
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Enable 2FA
    await supabase
      .from('users')
      .update({
        two_factor_enabled: true,
        two_factor_backup_codes: backupCodes
      })
      .eq('id', userId);

    res.json({
      success: true,
      message: '2FA has been enabled',
      backupCodes: backupCodes
    });

  } catch (error) {
    console.error('2FA verify setup error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify 2FA' });
  }
});

// Verify 2FA code during login
app.post('/api/auth/2fa/verify', async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ error: 'User ID and code are required' });
    }

    // Find user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (findError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.two_factor_enabled || !user.two_factor_secret) {
      return res.status(400).json({ error: '2FA is not enabled for this account' });
    }

    // Check if it's a backup code
    const backupCodes = user.two_factor_backup_codes || [];
    const backupCodeIndex = backupCodes.indexOf(code.toUpperCase());

    let isValid = false;

    if (backupCodeIndex !== -1) {
      // Valid backup code - remove it
      backupCodes.splice(backupCodeIndex, 1);
      await supabase
        .from('users')
        .update({ two_factor_backup_codes: backupCodes })
        .eq('id', userId);
      isValid = true;
    } else {
      // Verify TOTP code
      isValid = authenticator.verify({
        token: code,
        secret: user.two_factor_secret
      });
    }

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        two_factor_enabled: true
      }
    });

  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify 2FA' });
  }
});

// Disable 2FA
app.post('/api/auth/2fa/disable', async (req, res) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ error: 'User ID and password are required' });
    }

    // Find user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, password_hash, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (findError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const passwordHash = await hashPassword(password);
    if (user.password_hash !== passwordHash) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Disable 2FA
    await supabase
      .from('users')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_backup_codes: null
      })
      .eq('id', userId);

    res.json({ success: true, message: '2FA has been disabled' });

  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: error.message || 'Failed to disable 2FA' });
  }
});

// ============================================
// GOOGLE BUSINESS API ROUTES (Foundation)
// ============================================

// Note: Full Google Business integration requires:
// 1. Google Cloud Console project
// 2. Business Profile API enabled
// 3. OAuth 2.0 credentials
// 4. Google verification process

app.get('/api/google/auth-url', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId || clientId === 'your_google_client_id') {
    return res.status(400).json({
      error: 'Google API not configured',
      message: 'Please configure GOOGLE_CLIENT_ID in environment variables'
    });
  }

  const redirectUri = `${process.env.FRONTEND_URL}/google-callback.html`;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/business.manage');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  res.json({ authUrl });
});

app.post('/api/google/callback', async (req, res) => {
  try {
    const { code } = req.body;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Google API not configured' });
    }

    const redirectUri = `${process.env.FRONTEND_URL}/google-callback.html`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return res.status(400).json({ error: tokens.error_description || 'Failed to get tokens' });
    }

    res.json({
      success: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in
    });

  } catch (error) {
    console.error('Google callback error:', error);
    res.status(500).json({ error: 'Failed to complete Google authentication' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`ReputeHQ Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
