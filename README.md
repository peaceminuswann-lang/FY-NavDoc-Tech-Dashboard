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
