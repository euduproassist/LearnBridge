// ---------- admin-portal.part1.js ----------
// Put this at the top of admin-portal.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit, startAt, endAt
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* ---------- Small DOM helpers ---------- */
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) el.classList.remove('hidden'); };
const hide = id => { const el = $(id); if (el) el.classList.add('hidden'); };
const setActiveMenu = (id) => {
  document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
};
function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Admin Auth check ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  try {
    // check users collection for admin role
    const uDoc = await getDoc(doc(db, 'users', user.uid));
    const uData = uDoc.exists() ? uDoc.data() : null;
    if (!uData || uData.role !== 'admin') {
      alert('Access denied — admin role required.');
      await auth.signOut();
      window.location.href = 'index.html';
      return;
    }
    // init portal
    await initAdminPortal(user.uid);
  } catch (err) {
    console.error('admin init error', err);
    alert('Failed to load admin portal: ' + err.message);
  }
});


/* ---------- Init Admin Portal ---------- */
async function initAdminPortal(adminUid) {

  // menu wiring
  $('menuDashboard').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); loadDashboardMetrics(); };
  $('menuUsers').onclick = () => { setActiveMenu('menuUsers'); showSection('usersSection'); loadUsersTable(); };
  $('menuSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadAllSessions(); };
  $('menuBookings').onclick = () => { setActiveMenu('menuBookings'); showSection('bookingsSection'); loadBookingRequests(); };
  $('menuIssues').onclick = () => { setActiveMenu('menuIssues'); showSection('issuesSection'); loadIssues(); };
  $('menuRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadRatingsAnalytics(); };
  $('menuUniversity').onclick = () => { setActiveMenu('menuUniversity'); showSection('universitySection'); loadUniversitySettings(); };
  $('menuNotifications').onclick = () => { setActiveMenu('menuNotifications'); showSection('notificationsSection'); loadNotificationsPanel(); };
  $('menuContent').onclick = () => { setActiveMenu('menuContent'); showSection('contentSection'); loadContentPanel(); };
  $('menuReports').onclick = () => { setActiveMenu('menuReports'); showSection('reportsSection'); loadReportsPanel(); };
  $('menuAdminProfile').onclick = () => { setActiveMenu('menuAdminProfile'); showSection('adminProfileSection'); loadAdminProfile(adminUid); };

  // clickable dashboard cards (makes all .dash-card clickable to route to intended menu)
  document.querySelectorAll('.dash-card').forEach(card => {
    card.style.cursor = 'pointer';
  });
  // Map card text to actions - uses contains for simple mapping
  document.querySelectorAll('.dash-card').forEach(card => {
    card.addEventListener('click', () => {
      const txt = card.textContent || '';
      if (/Student/i.test(txt)) { setActiveMenu('menuUsers'); showSection('usersSection'); loadUsersTable('student'); }
      else if (/Tutor/i.test(txt) || /Counselor|Counsellor/i.test(txt)) { setActiveMenu('menuUsers'); showSection('usersSection'); loadUsersTable('tutor'); }
      else if (/Pending Tutor/i.test(txt)) { setActiveMenu('menuUsers'); showSection('usersSection'); loadUsersTable('', { onlyPendingTutors: true }); }
      else if (/Booking Requests/i.test(txt) || /Pending/i.test(txt)) { setActiveMenu('menuBookings'); showSection('bookingsSection'); loadBookingRequests(); }
      else if (/Sessions Today/i.test(txt) || /Sessions In Progress/i.test(txt)) { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadAllSessions(); }
      else if (/Issues/i.test(txt)) { setActiveMenu('menuIssues'); showSection('issuesSection'); loadIssues(); }
      else if (/Rating/i.test(txt)) { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadRatingsAnalytics(); }
      else { /* fallback */ setActiveMenu('menuDashboard'); showSection('dashboardSection'); loadDashboardMetrics(); }
    });
  });

  // initial loads
  await loadDashboardMetrics();
  // show dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');
}

/* ---------- Section toggling ---------- */
function showSection(idToShow) {
  const sections = ['dashboardSection','usersSection','sessionsSection','bookingsSection','issuesSection','ratingsSection','universitySection','notificationsSection','contentSection','reportsSection','adminProfileSection'];
  sections.forEach(s => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle('hidden', s !== idToShow);
  });
}

/* ---------- Simple CSV export helper ---------- */
function exportToCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- Basic notification helper (write to notifications collection) ---------- */
async function pushNotification({ title, message, target = 'all', meta = {} }) {
  try {
    await addDoc(collection(db, 'notifications'), {
      title, message, target, meta, createdAt: new Date().toISOString(), fromAdmin: true
    });
    return true;
  } catch (err) {
    console.error('pushNotification', err);
    return false;
  }
}

