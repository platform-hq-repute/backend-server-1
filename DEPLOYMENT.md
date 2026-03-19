# ReputeHQ Backend Deployment Guide

This guide will help you deploy the ReputeHQ backend server to production.

## Overview

The backend provides:
- **Email Verification** - New users receive a verification email before they can log in
- **Two-Factor Authentication (2FA)** - Users can enable TOTP-based 2FA using apps like Google Authenticator
- **Google Business API** (Foundation) - Ready for future Google Business integration

## Files Included

```
backend/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── .env.example           # Environment variables template
└── database-migration.sql # SQL to update your Supabase database
```

```
public/
├── login.html            # Updated with 2FA support
├── signup.html           # Updated with email verification
├── verify-email.html     # Email verification page
├── security-settings.html # 2FA settings page
└── (other existing files)
```

---

## Step 1: Update Your Supabase Database

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `database-migration.sql`
4. Click **Run**

This adds the following columns to your `users` table:
- `email_verified` (boolean)
- `verification_token` (text)
- `verification_token_expires` (timestamp)
- `two_factor_enabled` (boolean)
- `two_factor_secret` (text)
- `two_factor_backup_codes` (text array)

---

## Step 2: Set Up Email Service (Resend)

1. Go to [resend.com](https://resend.com) and create an account
2. Add and verify your domain (or use their test domain for development)
3. Create an API key
4. Save the API key for the next step

**Note:** Free tier includes 100 emails/day, which is enough to start.

---

## Step 3: Deploy the Backend

### Option A: Deploy to Railway (Recommended - Free tier available)

1. Go to [railway.app](https://railway.app) and sign up
2. Click **New Project** → **Deploy from GitHub**
3. Connect your repo (or upload the backend folder)
4. Add environment variables in Railway dashboard:
   ```
   SUPABASE_URL=https://djwrwqbyujbkvvftjvud.supabase.co
   SUPABASE_SERVICE_KEY=your_supabase_service_role_key
   RESEND_API_KEY=re_your_api_key
   EMAIL_FROM=noreply@yourdomain.com
   FRONTEND_URL=https://yourdomain.com
   PORT=3000
   ```
5. Deploy and copy your backend URL (e.g., `https://reputehq-backend.railway.app`)

### Option B: Deploy to Render (Free tier available)

1. Go to [render.com](https://render.com) and sign up
2. Click **New** → **Web Service**
3. Connect your repo or upload files
4. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add the same environment variables as above
6. Deploy and copy your backend URL

### Option C: Deploy to Your Own Server

1. Upload the `backend` folder to your server
2. Install Node.js 18+ if not already installed
3. Run:
   ```bash
   cd backend
   npm install
   ```
4. Create a `.env` file with your variables
5. Use PM2 to keep it running:
   ```bash
   npm install -g pm2
   pm2 start server.js --name reputehq-backend
   pm2 save
   pm2 startup
   ```

---

## Step 4: Update Frontend Files

In ALL your HTML files (login.html, signup.html, verify-email.html, security-settings.html), update the API_URL:

```javascript
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://YOUR-BACKEND-URL.com'; // ← Replace with your actual backend URL
```

---

## Step 5: Deploy Updated Frontend

1. Re-download all the HTML files
2. Upload them to Hostinger (replacing the old versions)
3. Make sure `verify-email.html` and `security-settings.html` are included

---

## Step 6: Get Supabase Service Role Key

The backend needs the **Service Role Key** (not the anon key) to manage users:

1. Go to Supabase Dashboard → **Settings** → **API**
2. Copy the `service_role` key (keep this secret!)
3. Add it as `SUPABASE_SERVICE_KEY` in your backend environment

---

## Testing

1. **Test Signup:**
   - Go to signup.html
   - Create a new account
   - Check email for verification link
   - Click link to verify

2. **Test Login:**
   - Go to login.html
   - Try logging in with unverified email (should fail)
   - After verifying, login should work

3. **Test 2FA:**
   - Login and go to security-settings.html
   - Enable 2FA
   - Scan QR code with Google Authenticator
   - Enter code to verify
   - Save backup codes
   - Log out and log back in (should require 2FA code)

---

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Yes |
| `RESEND_API_KEY` | Resend.com API key for emails | Yes |
| `EMAIL_FROM` | Email sender address | Yes |
| `FRONTEND_URL` | Your frontend URL (for email links) | Yes |
| `PORT` | Server port (default: 3000) | No |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No (for future) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | No (for future) |

---

## Google Business Integration (Future)

The foundation is ready. To fully enable Google Business integration:

1. Create a Google Cloud Console project
2. Enable the Google Business Profile API
3. Create OAuth 2.0 credentials
4. Add credentials to environment variables
5. Implement the business listing features

This requires going through Google's verification process, which takes time.

---

## Troubleshooting

**Emails not sending:**
- Check RESEND_API_KEY is correct
- Verify your domain in Resend dashboard
- Check server logs for errors

**2FA not working:**
- Ensure time on user's phone is accurate
- TOTP codes are time-sensitive

**Database errors:**
- Run the migration SQL again
- Check Supabase logs

**CORS errors:**
- Update FRONTEND_URL in backend environment
- Make sure it matches your actual frontend domain

---

## Support

For issues, check:
1. Backend logs (Railway/Render dashboard or `pm2 logs`)
2. Browser console for frontend errors
3. Supabase logs for database errors
