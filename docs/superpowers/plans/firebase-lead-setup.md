# Firebase Setup for Leads Feature

## 1. Firestore Security Rules

Add to the existing rules in Firebase Console (Firestore → Rules):

```
match /leads/{leadId} {
  allow read: if true;
  allow create: if request.resource.data.status == 'cold_lead'
                && request.resource.data.customerName is string
                && request.resource.data.email is string;
  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'hotLeadAt'])
                && resource.data.status == 'cold_lead'
                && request.resource.data.status == 'hot_lead';
  allow delete: if isWhitelisted();
}

match /mail/{mailId} {
  allow create: if true;
  allow read, update, delete: if false;
}
```

Update existing config/products rule:

```
match /config/{docId} {
  allow read: if true;        // was: isWhitelisted()
  allow write: if false;
}
```

## 2. Firebase Extension: Trigger Email from Firestore

1. Go to Firebase Console → Extensions
2. Install "Trigger Email from Firestore" by Firebase
3. Configure:
   - Email documents collection: `mail`
   - SMTP connection URI: (configure with your email provider)
   - Default FROM address: noreply@smartpeak.be (or similar)

## 3. Verify

- Visit lead.html, complete the wizard
- Check Firestore → leads collection for new document
- Check email inbox for result link
- Click result link, verify page loads
- Click "Contacteer mij", verify status changes to hot_lead
