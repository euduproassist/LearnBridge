// set-admin.js
const admin = require('firebase-admin');

// 1. Point to the secure key you just downloaded
const serviceAccount = require('./service-key.json'); 

// Initialize the Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 2. The UID that needs the admin tag
const adminUid = 'hwNv2k636LMjPUfkjJLSpung77t1'; 

console.log(`Attempting to set Admin security tag for UID: ${adminUid}...`);

// This line applies the 'admin: true' tag to your user account
admin.auth().setCustomUserClaims(adminUid, { admin: true })
  .then(() => {
    console.log('✅ SUCCESS! The Admin security tag is now set on your user account. Please LOG OUT and LOG BACK IN to your portal.');
    process.exit();
  })
  .catch((error) => {
    console.error('❌ ERROR setting the Admin tag:', error);
    process.exit(1);
  });


