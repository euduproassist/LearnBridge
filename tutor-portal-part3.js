// tutor-portal-part3.js — PART 3 of 3
// Final helpers, calendar integration, final wiring and cleanup

import { auth, db } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* Utility helpers (ensure they exist when combined with part1/part2) */
const $ = id => document.getElementById(id);
function escapeHtml(s) { if (s === undefined || s === null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- Calendar / ICS export helpers ---------- */
export function generateGoogleCalendarLink({ title, details, location, start, end }) {
  const fmt = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, details: details || '', location: location || '', dates: `${fmt(start)}/${fmt(end)}` });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

export function generateICS({ title, details, location, start, end }) {
  // Very small ICS generator
  function toUTCString(d) { return d.toISOString().replace(/-|:|\.\d+/g, ''); }
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LearnBridge Tutor Portal//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@learnbridge.local`,
    `DTSTAMP:${toUTCString(new Date())}`,
    `DTSTART:${toUTCString(start)}`,
    `DTEND:${toUTCString(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    `LOCATION:${location || ''}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  return ics;
}

export function downloadICSFile({ title, details, location, start, end, filename = 'event.ics' }) {
  const ics = generateICS({ title, details, location, start, end });
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---------- Final wiring: logout + unload cleanup ---------- */
export function attachGlobalHandlers() {
  // logout if there's a logout button
  const lbtn = $('logoutBtn');
  if (lbtn) lbtn.onclick = async () => { if (!confirm('Sign out?')) return; await signOut(auth); window.location.href = 'index.html'; };

  // unload cleanup
  window.addEventListener('beforeunload', () => {
    try { if (typeof cleanupAllChatPollers === 'function') cleanupAllChatPollers(); } catch (e) {}
  });
}

/* ---------- Small QA checks to avoid runtime errors on integration ---------- */
export function assertEnvironment() {
  // make sure expected DOM IDs exist (non-fatal but helpful)
  const expected = ['dashboardSection','searchSection','sessionsSection','profileSection','supportSection','notificationsSection','pendingSection','ratingsSection'];
  expected.forEach(id => { if (!$(id)) console.warn(`Expected DOM element '${id}' not found. The UI will still work but some features may not display.`); });
}

/* ---------- Small helper: safely call function if exists on window (used by combined scripts) ---------- */
export function safeCall(fn, ...args) { try { if (typeof fn === 'function') return fn(...args); } catch (e) { console.error('safeCall error', e); } }

/* ---------- Export a convenience init that stitches parts together when the three files are loaded separately ---------- */
export async function tutorPortalInit() {
  try {
    assertEnvironment();
    safeCall(attachGlobalHandlers);
    // load initial notifications/stats if user signed in
    if (auth && auth.currentUser) {
      const uid = auth.currentUser.uid;
      safeCall(window.loadDashboard, uid);
      safeCall(window.loadNotifications, uid);
      safeCall(window.loadPendingCounts, uid);
    }
  } catch (err) {
    console.error('tutorPortalInit failed', err);
  }
}

/* ---------- End of PART 3 ---------- */
