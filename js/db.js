// Firebase access layer. Everything the user owns lives in Firestore under users/{uid}.
// Nothing is written to localStorage by the app. Writes that change a journey run in a
// transaction so two devices can never double-apply a check-in.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged as fbOnAuthStateChanged, signOut as fbSignOut,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, updateDoc, getDocs, onSnapshot, query, orderBy,
  runTransaction, deleteDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import { applyCheckin, applyAbandon, applySmartLog } from './logic.js';

export const configured = !firebaseConfig.apiKey.startsWith('YOUR_');

let app = null;
let auth = null;
let db = null;

export function init() {
  if (!configured) return false;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Default Firestore cache is in-memory, so no journey data is persisted in the browser.
  db = getFirestore(app);
  return true;
}

export function onAuthChange(cb) {
  return fbOnAuthStateChanged(auth, cb);
}

export async function completeRedirectLogin() {
  try {
    await getRedirectResult(auth);
  } catch (err) {
    console.warn('Redirect sign-in failed', err);
    throw err;
  }
}

export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Popups are often blocked in installed PWAs; fall back to a full-page redirect.
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else {
      throw err;
    }
  }
}

export function logout() {
  return fbSignOut(auth);
}

export async function ensureUserDoc(user) {
  await setDoc(
    doc(db, 'users', user.uid),
    {
      email: user.email || null,
      displayName: user.displayName || null,
      lastSeenAt: new Date().toISOString(),
      schemaVersion: 1,
    },
    { merge: true },
  );
}

const goalsCol = (uid) => collection(db, 'users', uid, 'goals');

export function subscribeGoals(uid, onData, onError) {
  const q = query(goalsCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

export async function createGoal(uid, data) {
  const ref = doc(goalsCol(uid));
  await setDoc(ref, data);
  return ref.id;
}

export async function updateGoalDetails(uid, goalId, fields) {
  await updateDoc(doc(goalsCol(uid), goalId), { ...fields, updatedAt: new Date().toISOString() });
}

export async function checkIn(uid, goalId, date, answer) {
  const ref = doc(goalsCol(uid), goalId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Journey not found.');
    const goal = { id: snap.id, ...snap.data() };
    const result = applyCheckin(goal, date, answer, new Date());
    tx.update(ref, result.patch);
    return result;
  });
}

// Saves the numbers for a SMART goal. entries: [{ index, date, value }].
export async function saveSmartLog(uid, goalId, entries) {
  const ref = doc(goalsCol(uid), goalId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Journey not found.');
    const goal = { id: snap.id, ...snap.data() };
    const result = applySmartLog(goal, entries, new Date());
    tx.update(ref, result.patch);
    return result;
  });
}

// Writes the home-screen order: ids[0] is the first journey shown. One batch, so all positions stay consistent.
export async function saveOrder(uid, ids) {
  const batch = writeBatch(db);
  ids.forEach((id, i) => batch.update(doc(goalsCol(uid), id), { order: i }));
  await batch.commit();
}

export async function abandon(uid, goalId) {
  const ref = doc(goalsCol(uid), goalId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Journey not found.');
    const goal = { id: snap.id, ...snap.data() };
    const patch = applyAbandon(goal, new Date());
    tx.update(ref, patch);
  });
}

// Full export of the user's data, for backup before any app update.
export async function exportAll(uid) {
  const snap = await getDocs(goalsCol(uid));
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    goals: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

// Deletes every journey in batches (Firestore allows 500 writes per batch).
export async function deleteAllGoals(uid) {
  const snap = await getDocs(goalsCol(uid));
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return refs.length;
}

// Resets the account to brand new: every journey and the profile record are deleted.
// The Google sign-in itself stays, so the next visit starts from an empty account.
export async function resetAccount(uid) {
  const count = await deleteAllGoals(uid);
  await deleteDoc(doc(db, 'users', uid));
  return count;
}
