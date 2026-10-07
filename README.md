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

## Navigation Database Ship-out Email Reminders

You can use a separate Gmail account as the **sender** without Outlook or Power Automate. The reminder runs using a free Google Apps Script time trigger, so your PC does not need to stay on. Google applies daily sending and execution quotas to free accounts; these are more than enough for a few database reminders, but Google can change quotas. See [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas) and [time-driven triggers](https://developers.google.com/apps-script/guides/triggers/installable).

The dashboard calculates ship-out as 8 days before cycle effective date. The script sends one email to the configured recipient 3 days before ship-out (11 days before effective date), for ATR and B737. It reads the latest saved cycle data from Supabase and handles the 28-day cycle rollover.

1. Sign in to [script.google.com](https://script.google.com/) using the Gmail account you want the email to come **from**, then create a new project.
2. Replace the default code with the contents of [](./database-shipout-remind`database-shipout-reminder.gs`er.gs).
3. In `REMINDER_CONFIG`, set:
   - `recipient` to the shared email address that should receive the reminders.
   - `supabasePublishableKey` to the Supabase publishable key configured near the top of `index.html`. Use only the publishable/anon key; never use a service-role key.
4. In **Project Settings**, set the time zone to `Asia/Kuala_Lumpur`.
5. Select `testShipOutReminderEmail` in the function menu and click **Run**. Approve Google's authorization prompts and confirm the test arrives.
6. Select `setupDailyShipOutReminderTrigger` and click **Run** once. The script creates a daily trigger for around 9 AM Malaysia time. Google may run it at a slightly varied time within that hour. You can verify it under **Triggers**.
7. In the Supabase project, confirm the `app_storage` table permits read access to the publishable/anon role. The script reports an error rather than silently skipping if Supabase is unavailable or the row cannot be read.

No paid service is required for this setup. The script sends through Gmail's free Apps Script allowance (currently up to 100 email recipients per day for consumer accounts); it does not require Gmail SMTP passwords or app passwords. The sender must keep the Gmail account active and the installed trigger enabled. When cycle details are changed and saved on the Database Admin page, the next run uses those updated settings.

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
