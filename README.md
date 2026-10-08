# Fuel Analysis Dashboard

A web application for analyzing flight fuel data for Firefly Airlines.

## Features

- View fuel consumption data by fleet (B737, ATR72)
- Monthly, quarterly, and yearly analysis
- Interactive charts and tables
- Admin panel for uploading CSV/XLSX data
- Responsive design for mobile and desktop

## Deployment on GitHub Pages

1. Create a new GitHub repository
2. Push this code to the repository
3. Go to Settings > Pages
4. Set source to "Deploy from a branch" and select main branch
5. The site will be live at https://yourusername.github.io/repository-name/

## Firebase Setup

This app uses Firebase Firestore for cloud data storage to share data across devices.

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Firestore Database
4. Go to Project Settings > General > Your apps > Add web app
5. Copy the Firebase config and replace the placeholder in `index.html` and `admin.html`

### Firebase Config

Replace the `firebaseConfig` object in both `index.html` and `admin.html` with your actual config:

```javascript
const firebaseConfig = {
    apiKey: "your-actual-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
};
```

### Firestore Security Rules

Set up Firestore rules to allow read/write access (for demo purposes):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Note: This allows public access. For production, implement proper authentication.**

## Usage

- Visit the main page to view data
- Click "Admin Login" to upload new data
- Username: FYFOTD
- Password: firefly@123

## Gmail Email Reminders

Navigation database and payment reminders are configured separately below, but use the same free Gmail and Google Apps Script project. The script runs on a daily time trigger, so your PC does not need to stay on. Google applies daily sending and execution quotas to free accounts; see [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas) and [time-driven triggers](https://developers.google.com/apps-script/guides/triggers/installable).

### Shared setup

1. Sign in to [script.google.com](https://script.google.com/) using the Gmail account you want the email to come **from**, then create a project.
2. Replace the default code with the contents of [database-shipout-reminder.gs](./database-shipout-reminder.gs).
3. In `REMINDER_CONFIG`, set `recipient` to the shared email address that should receive reminders and `supabasePublishableKey` to the publishable/anon key configured near the top of `index.html`. Never use a service-role key.
4. In **Project Settings**, set the time zone to `Asia/Kuala_Lumpur`.
5. In the Supabase project, confirm the `app_storage` table permits read access to the publishable/anon role.

### Navigation database ship-out reminders

The dashboard calculates ship-out as 8 days before the cycle effective date. The script emails the configured recipient 3 days before ship-out (11 days before the effective date) for ATR and B737. It reads the latest saved cycle data from Supabase and handles the 28-day cycle rollover.

To test this reminder, select `testShipOutReminderEmail` in the Apps Script function menu, click **Run**, approve Google's authorization prompt, and confirm the test email arrives.

### Payment due reminders

Add a payment term of 15, 30, 60, or 90 days. The Payment Dashboard calculates the expected payment date by adding the selected term to the payment's created date. The script sends a consolidated email 3 days before the due date for payments due that day. It skips any payment with a `paymentDoneDate`, so entering a Payment Done Date stops future reminders for that payment. It reads the latest `paymentDashboardData` saved in Supabase.

To test this reminder, select `testPaymentDueReminderEmail` in the Apps Script function menu, click **Run**, approve Google's authorization prompt if prompted, and confirm the test email arrives.

### Enable the daily reminder schedule

After testing the reminders you want, select `setupDailyShipOutReminderTrigger` and click **Run** once. The script creates one daily trigger that checks both navigation ship-out and payment due reminders at around 9 AM Malaysia time. Google may run it at a slightly varied time within that hour. Verify it under **Triggers**. If you already created the database-only trigger, running setup again replaces it with the combined reminder trigger.

No paid service is required. The script sends through Gmail's free Apps Script allowance; it does not require Gmail SMTP passwords or app passwords. The sender must keep the Gmail account active and the installed trigger enabled. The calendar marks payment due dates in red, the exact reminder date (3 days before) in yellow, and created dates in soft orange, with labels and payment names shown on each date.

## Mobile Compatibility

The app is fully responsive and works on:
- Desktop computers
- Tablets (iPad, Android tablets)
- Mobile phones (iPhone, Android)

## Technologies Used

- HTML5, CSS3, JavaScript
- Bootstrap 5
- DataTables
- Chart.js
- Firebase Firestore
- SheetJS for Excel parsing</content>
<parameter name="filePath">c:\Users\2360692\Desktop\Fuel Analysis\README.md
