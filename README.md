# SANKALP

Build habits, keep sankalpas, and walk your 66-day journey one day at a time.

- Static progressive web app: plain HTML, CSS and ES modules. No build step.
- Google sign-in and all data in **Cloud Firestore**. The app writes nothing to `localStorage`.
- Installable and full-screen on phones and desktops (`display: fullscreen` / `standalone`).

## Project layout

```
index.html              app shell + PWA meta tags
manifest.webmanifest    install metadata (full-screen)
sw.js                   service worker: caches the shell only, never your data
css/styles.css          dark UI, floating rail, journey circles, animations
js/config.js            YOUR Firebase web config goes here
js/logic.js             journey rules (pure functions, unit tested)
js/db.js                Firebase auth + Firestore access (transactions for check-ins)
js/app.js               routing, rendering, dialogs
tests/logic.test.js     rule tests
firestore.rules         security rules: users can only touch their own data
netlify.toml            Netlify publish settings and headers
```

## 1. Run the rule tests

```bash
npm test
```

## 2. Firebase setup (one time)

1. Open the [Firebase console](https://console.firebase.google.com) and create a project (or use your existing one).
2. **Authentication** → Get started → Sign-in method → enable **Google**.
3. **Firestore Database** → Create database → production mode.
4. **Project settings** → Your apps → add a **Web** app. Copy the config object into `js/config.js`.
5. **Authentication** → Settings → **Authorized domains**: add your Netlify domain (for example `sankalp.netlify.app`). `localhost` is already there for testing.
6. Publish the security rules. Either paste `firestore.rules` into Firestore → Rules and click Publish, or run:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```
   (If you use the CLI, also add a `firebase.json` with `{ "firestore": { "rules": "firestore.rules" } }`.)

## 3. Run locally

Any static server works, for example:

```bash
npx serve .
```

Open the printed URL and sign in with Google.

## 4. Deploy to Netlify

- Drag the project folder onto app.netlify.com, or connect the Git repo.
- Build command: empty. Publish directory: `.` (already set in `netlify.toml`).
- Then add the Netlify domain to Firebase Authorized domains (step 2.5).

## How the rules work

| Rule | Behavior |
|---|---|
| Habit length | 66 days by default. |
| Sankalpa length | Chosen by you (1 to 365 days). |
| SMART goal | Your goal with five answers (Specific, Measurable, Actionable, Realistic, Time-bound) and a deadline. Checked in daily until the deadline. |
| SMART length | From the start date to the deadline, both days included (max 365). |
| Journey grid | Circles fill row by row. Only the open day can be checked. The next day unlocks after you check in. |
| Done | Circle turns green and the next day unlocks. |
| Missed, first exception | Uses an exception. The journey grows by one day (66 becomes 67). |
| Second exception | Allowed only **15 or more days** after the first. Max 2 per attempt. |
| Sankalpa exceptions | None. Any miss restarts the sankalpa. |
| SMART exceptions | Max 2 per attempt, no gap rule. Each one moves the deadline out by a day. |
| Redo | An accomplished journey can be started again from Accomplishments or its page. Pick a new start date (and length or deadline). The original stays under Accomplishments. |
| Missed, not eligible | Restart. The attempt is archived under Not accomplished. The new attempt starts the next day. |
| Two consecutive misses | Always a restart (the second miss is within 15 days of the first). |
| Completion | When the number of done days reaches the target, the journey moves to Accomplishments. |
| Abandon | Closes the journey and records it under Not accomplished. |

Constants live at the top of `js/logic.js` (`HABIT_DAYS`, `MAX_EXCEPTIONS`, `EXCEPTION_GAP_DAYS`).

## Data safety

- Every journey is one Firestore document: `users/{uid}/goals/{goalId}`. Each has `schemaVersion: 1`.
- Failed and abandoned attempts are archived inside `history`, never deleted. Goals cannot be deleted through the rules.
- Check-ins run in Firestore transactions, so two devices cannot double-apply a day.
- **Export my data** (Account → Export) downloads a JSON backup. Do this before big updates.

## Notes and known limits

- **iOS home-screen icon:** iOS needs a PNG `apple-touch-icon`. `icon.svg` is used for Android, desktop, and the manifest. Export a 180×180 PNG from `icon.svg` to `apple-touch-icon.png` and point `index.html` at it if you need it.
- **Offline:** the app shell opens offline. Journey data needs a connection because it lives only in Firestore (by design, no local copy).
- **Sign-in session:** Firebase Auth keeps your login session in the browser. That is handled by the Firebase SDK, not by app data.
- **Full screen on iOS:** Safari ignores the fullscreen flag, so iOS uses standalone mode (no browser bar after "Add to Home Screen").
