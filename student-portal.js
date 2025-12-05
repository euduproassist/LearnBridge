// student-portal.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

import { auth, db } from './firebase-config.js'; // your firebase-config exports auth and db

// If firebase-config already exports, you may remove redundant getAuth/getFirestore imports above.
// This file assumes firebase-config.js exists and exports `auth` and `db`.

onAuthStateChanged(auth, async user => {
  if (!user) {
    // Not logged in -> redirect to login
    window.location.href = 'index.html';
    return;
  }

  // Initialize portal with the authenticated user's uid
  await initPortal(user.uid);
});

// ---------- UI helpers ----------
const $ = (sel) => document.getElementById(sel);
function showSection(idToShow) {
  const sections = ['dashboardSection','sessionsSection','profileSection'];
  sections.forEach(s => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle('hidden', s !== idToShow);
  });
}

// ---------- Init ----------
async function initPortal(uid) {
  // wire up menu clicks
  $('menuDashboard').onclick = () => showSection('dashboardSection');
  $('menuSessions').onclick = () => { showSection('sessionsSection'); loadSessionsList(uid); };
  $('menuProfile').onclick = () => { showSection('profileSection'); loadProfile(uid); };

  // click handlers for dashboard boxes
  $('openProfile').onclick = () => { showSection('profileSection'); loadProfile(uid); };
  $('openTutorSessions').onclick = () => { showSection('sessionsSection'); loadSessionsList(uid, 'tutor'); };
  $('openCounsellorSessions').onclick = () => { showSection('sessionsSection'); loadSessionsList(uid, 'counsellor'); };

  // save profile button
  $('saveProfileBtn').onclick = async () => {
    await saveProfile(uid);
  };

  // Load profile summary and sessions summary
  await loadProfile(uid);
  await loadSessionSummaries(uid);

  // show dashboard by default
  showSection('dashboardSection');
}

// ---------- Profile ----------
async function loadProfile(uid) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const profile = snap.exists() ? snap.data() : null;

  if (profile) {
    $('profileEmail').textContent = profile.email || '';
    // password remains hidden
    $('profileNameInput').value = profile.name || '';
    $('profileYearInput').value = profile.year || '';
    $('profileDepartmentInput').value = profile.department || '';
    $('profileCourseInput').value = profile.course || '';
    $('profilePictureInput').value = profile.profilePic || '';

    // Update the dashboard summary text too
    $('summaryName').textContent = profile.name || '—';
    $('summaryYear').textContent = profile.year || '—';
    $('summaryDepartment').textContent = profile.department || '—';
    $('summaryCourse').textContent = profile.course || '—';
  } else {
    // user doc missing — still populate email if auth has it
    const email = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : '';
    $('profileEmail').textContent = email;
  }
}

async function saveProfile(uid) {
  const userRef = doc(db, 'users', uid);
  const newData = {
    name: $('profileNameInput').value.trim(),
    year: $('profileYearInput').value.trim(),
    department: $('profileDepartmentInput').value.trim(),
    course: $('profileCourseInput').value.trim(),
    profilePic: $('profilePictureInput').value.trim()
  };
  try {
    await setDoc(userRef, newData, { merge: true });
    alert('Profile saved successfully.');
    // refresh summary
    await loadProfile(uid);
  } catch (err) {
    console.error(err);
    alert('Failed to save profile: ' + err.message);
  }
}

// ---------- Dashboard summaries (counts + brief messages) ----------
async function loadSessionSummaries(uid) {
  // Query approved tutor sessions for this student
  const sessionsCol = collection(db, 'sessions');

  const qTutor = query(sessionsCol, where('studentId', '==', uid), where('role', '==', 'tutor'), where('status', '==', 'approved'));
  const qCoun = query(sessionsCol, where('studentId', '==', uid), where('role', '==', 'counsellor'), where('status', '==', 'approved'));

  const [snapTutor, snapCoun] = await Promise.all([getDocs(qTutor), getDocs(qCoun)]);
  const tutorSessions = snapTutor.docs.map(d => ({ id: d.id, ...d.data() }));
  const counSessions = snapCoun.docs.map(d => ({ id: d.id, ...d.data() }));

  // tutor summary
  if (tutorSessions.length === 0) {
    $('tutorSessionSummary').textContent = 'No upcoming tutor sessions.';
  } else {
    // summarize the soonest upcoming session
    tutorSessions.sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
    const s = tutorSessions[0];
    $('tutorSessionSummary').textContent = `${s.personName} — ${new Date(s.datetime).toLocaleString()} (${s.mode})`;
  }

  // counsellor summary
  if (counSessions.length === 0) {
    $('counsellorSessionSummary').textContent = 'No upcoming counsellor sessions.';
  } else {
    counSessions.sort((a,b)=> new Date(a.datetime) - new Date(b.datetime));
    const s = counSessions[0];
    $('counsellorSessionSummary').textContent = `${s.personName} — ${new Date(s.datetime).toLocaleString()} (${s.mode})`;
  }
}

// ---------- Sessions page (detailed list and actions) ----------
async function loadSessionsList(uid, filterRole = null) {
  const container = $('sessionList');
  container.innerHTML = 'Loading sessions...';

  try {
    const sessionsCol = collection(db, 'sessions');
    let q = query(sessionsCol, where('studentId', '==', uid), where('status', '==', 'approved'));

    // Firestore requires compound indexes — if you add role filtering you may need to create an index.
    if (filterRole) {
      q = query(sessionsCol, where('studentId', '==', uid), where('status', '==', 'approved'), where('role', '==', filterRole));
    }

    const snap = await getDocs(q);
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty">No upcoming sessions found.</div>';
      return;
    }

    // build table
    const rows = sessions.map(s => {
      const datetime = new Date(s.datetime).toLocaleString();
      const modeClass = s.mode === 'online' ? 'session-online' : 'session-inperson';
      return `
        <tr data-id="${s.id}">
          <td>${escapeHtml(s.personName || '—')}</td>
          <td>${escapeHtml(datetime)}</td>
          <td class="${modeClass}">${escapeHtml(s.mode || '—')}</td>
          <td>
            <button class="cancel-btn">Cancel</button>
            <button class="update-btn">Update</button>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table>
        <thead>
          <tr><th>Person</th><th>Date & Time</th><th>Mode</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    // attach handlers
    container.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        const id = tr.dataset.id;
        if (!confirm('Cancel this session?')) return;
        try {
          // Option A: delete the session document
          // await deleteDoc(doc(db, 'sessions', id));
          // Option B (safer): update status to 'cancelled'
          await updateDoc(doc(db, 'sessions', id), { status: 'cancelled' });
          alert('Session cancelled.');
          await loadSessionsList(uid, filterRole);
          await loadSessionSummaries(uid);
        } catch (err) {
          console.error(err);
          alert('Failed to cancel: ' + err.message);
        }
      });
    });

    container.querySelectorAll('.update-btn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        const id = tr.dataset.id;
        const newISO = prompt('Enter new date & time (YYYY-MM-DDTHH:MM) in 24h (example: 2025-12-10T14:00)');
        if (!newISO) return;
        if (isNaN(new Date(newISO))) { alert('Invalid date format'); return; }
        const newMode = prompt('Enter new mode (online / in-person)', 'online');
        if (!newMode) return;
        try {
          await updateDoc(doc(db, 'sessions', id), {
            datetime: new Date(newISO).toISOString(),
            mode: newMode
          });
          alert('Session updated.');
          await loadSessionsList(uid, filterRole);
          await loadSessionSummaries(uid);
        } catch (err) {
          console.error(err);
          alert('Failed to update: ' + err.message);
        }
      });
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="empty">Failed to load sessions: ${escapeHtml(err.message || '')}</div>`;
  }
}

// ---------- small utility ----------
function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

