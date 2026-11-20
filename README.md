# SANKALP

**A personal commitment tracker. Pick a habit, a sankalpa, or a SMART goal, and show up for it one day at a time.**

Most habit apps ask one question: did you do it, yes or no. SANKALP asks the right question for each kind of commitment, keeps an honest record of every attempt. Nothing is deleted unless you choose to delete it.

## Why it matters

- **Setbacks don't erase progress.** A missed day is recorded, not hidden. Each attempt stays in your history, so you can see how far you have come.
- **Three kinds of commitment, three honest rules.**
  - A **habit** runs 66 days, the time research commonly links to a habit taking hold, and allows two exception days, spaced at least 15 days apart.
  - A **sankalpa** is a vow for a fixed number of days with no exceptions.
  - A **SMART goal** is a plan. You set the actions, how much each one takes per day or per week, and a deadline, then log your numbers daily.
- **Your reason is required.** Every journey asks *why*, and that is what you see when the day gets hard.
- **Your data is yours.** Everything lives in your own Google account's Firestore, with security rules that let only you read or write it. The app keeps no local copy and writes nothing to `localStorage`. You can export everything as JSON at any time.

## Features

| | |
|---|---|
| **Habit grid** | 66 circles fill row by row. Tap a day to mark it done or missed. |
| **Sankalpa** | Choose your own length, from 1 to 365 days. |
| **SMART goal** | Describe the goal, list actions with measurable amounts per day or per week, and pick a deadline or a number of days. Each day you log your numbers. The app shows what is done, what remains, and what you need from here on, plus zero days. |
| **Check in from home** | Everything due today is on the home screen, including SMART number boxes. |
| **Your order** | Reorder your journeys with one button. The order is saved and the same on every device. |
| **Drop-down columns** | On Check In and Your Journeys, each type (Habits, Sankalpas, SMART goals) opens as a drop-down. Opening one closes the other. |
| **Accomplishments** | Accomplished and not accomplished journeys, sorted into Habits, Sankalpas and SMART goals. Columns on a wide screen, a single stack on a phone. |
| **Redo** | Start an accomplished journey again with a new date, keeping its record intact. |
| **Installable app** | Works as a full-screen app on phones and desktops, and the app shell opens offline. |

## How the rules work

| Rule | What happens |
|---|---|
| Habit | 66 days. The first miss uses an exception and adds a day. |
| Second exception | Only 15 or more days after the first. Two per attempt. |
| Any other miss | The attempt is archived under Not accomplished, and the next day begins a fresh attempt. |
| Sankalpa | Your chosen length. No exceptions: a miss restarts it. |
| SMART goal | No exceptions. Targets are summed over the whole goal. A goal is accomplished when every target is met by the deadline. |
| Completion | The journey moves to Accomplishments. |
| Abandon | Closes a journey and records it under Not accomplished. Nothing is deleted. |
| Delete | Permanently removes a journey and its history, after a confirmation. Edit journey has the button. |

Rule constants live at the top of `js/logic.js`.

## Architecture

- **Static PWA**: plain HTML, CSS and ES modules. No build step, no framework.
- **Firebase**: Google sign-in and Cloud Firestore. Check-ins and number logs run in transactions, so two devices cannot double-count a day.
- **Pure rules**: `js/logic.js` holds all journey and SMART math with no DOM or database access, so it is fully unit tested.
- **Tests**: `npm test` runs the rule tests with Node's built-in test runner.

```
index.html              app shell and PWA tags
css/styles.css          dark UI, floating rail, journey circles, dropdowns
js/logic.js             journey and SMART rules (pure, unit tested)
js/db.js                Firebase auth and Firestore access (transactions)
js/app.js               routing, rendering and dialogs
js/config.js            your Firebase web config
tests/logic.test.js     rule tests
firestore.rules         users can only read and write their own data
netlify.toml            Netlify publish settings and headers
sw.js                   service worker: caches the app shell, never your data
```

## Getting started

### 1. Firebase (one time)

1. In the [Firebase console](https://console.firebase.google.com), create a project.
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → create a database in production mode.
4. **Project settings** → Your apps → add a **Web** app. Copy its config into `js/config.js`.
5. **Authentication** → Settings → Authorized domains: add your domain. `localhost` is already there.
6. Publish `firestore.rules` (Firestore → Rules → Publish, or `firebase deploy --only firestore:rules`).

### 2. Run it

```bash
npm test          # rule tests
npx serve .       # then open the printed URL and sign in with Google
```

### 3. Deploy

Drag the folder onto [Netlify](https://app.netlify.com), or connect the Git repository. The build command is empty and the publish directory is `.`, both set in `netlify.toml`. Then add the Netlify domain to Firebase's authorized domains.

## Privacy and safety

- Each journey is one document at `users/{uid}/goals/{goalId}`, versioned with `schemaVersion`.
- Failed, abandoned and expired attempts are kept in `history`. **Reset account** deletes all journeys and profile data but keeps your sign-in. **Export my data** downloads a JSON backup.
- Outside requests are limited to Google sign-in, your own Firebase project, and the Inter font and Lucide icon library from public CDNs.

## Roadmap

- Reminders for due check-ins
- Weekly review of SMART progress
- iOS home-screen icon (PNG `apple-touch-icon`)
