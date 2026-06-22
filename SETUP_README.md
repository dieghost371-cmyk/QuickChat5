# QuickChat — Setup Guide
Developed By Ghost & Dexter

QuickChat is a single-file HTML + JS real-time chat app (`index.html` + `app.js`) built on Firebase.
It will **not log in or send messages** until you connect a real Firebase project. Follow these steps.

---

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com → **Add project**.
2. Name it (e.g. `quickchat-app`) → continue through setup.

## 2. Upgrade to the Blaze (pay-as-you-go) plan
Phone number authentication (real SMS OTP) and Firebase Storage **both require Blaze**.
Console → bottom-left **⚙ Settings → Usage and billing → Modify plan → Blaze**.
You only pay for what you use — Firebase has a generous free tier within Blaze too.

## 3. Enable Phone Authentication
Console → **Build → Authentication → Get started → Sign-in method → Phone → Enable → Save**.

For testing without burning real SMS, add test numbers under
**Authentication → Sign-in method → Phone numbers for testing** (e.g. `+94771234567` / code `123456`).

## 4. Create Firestore Database
Console → **Build → Firestore Database → Create database** → start in **production mode** → pick a region close to Sri Lanka (e.g. `asia-south1`).

Then go to the **Rules** tab and paste the contents of `firestore.rules` (included in this delivery). Publish.

## 5. Enable Storage
Console → **Build → Storage → Get started** → production mode → same region.
Go to the **Rules** tab and paste the contents of `storage.rules`. Publish.

## 6. Get your config keys
Console → **⚙ Project settings → General → Your apps → Web (</> icon) → Register app**.
Copy the `firebaseConfig` object it gives you.

## 7. Paste your config into app.js
Open `app.js`, find this block near the top, and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 8. Authorize your domain
If deploying to GitHub Pages: Console → **Authentication → Settings → Authorized domains → Add domain** →
add `ghost1255656.github.io` (or whatever your Pages URL is).

## 9. Deploy
Push `index.html` and `app.js` to your GitHub Pages repo root (or a subfolder) and you're live.

---

## What's already built in
- Phone number + real SMS OTP login (Firebase Phone Auth + invisible/visible reCAPTCHA)
- New users go through a one-time profile setup (name, photo, bio)
- Returning users stay logged in automatically (Firebase auth persistence)
- Online/offline + "last seen" presence, updated on tab focus/close
- Search any user by phone number to start a chat
- Real-time 1-to-1 messaging with live delivery
- Read receipts (✓✓ turns blue when read)
- Typing indicator ("typing...")
- Image sharing (auto-compressed client-side, uploaded to Storage)
- Emoji picker
- Delete for everyone (long-press your own message)
- Privacy controls: hide last seen / hide photo / hide online status
- Block & report users
- Bottom navigation: Chats, Contacts, Calls (call log UI scaffold — no live calling backend), Settings
- About QuickChat modal with your WhatsApp contact numbers
- Dark, green-accented, WhatsApp-inspired UI, mobile-first responsive

## Notes
- **Calls tab** is a UI placeholder (call log list + icons) since real voice/video calling needs WebRTC + signaling, which is its own build — let me know if you want that added next.
- **Push notifications**: the in-app toast/badge system is live; true background push (after the browser tab is closed) needs Firebase Cloud Messaging + a service worker, which can be added as a follow-up since it needs its own server key setup.
