// tutor-portal-part1.js  — PART 1 of 3
// Tutor Portal (keeps structure/style of student-portal.js)
// NOTE: Replace existing student-portal.js import paths to point to this file when ready.

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* ---------- small DOM helpers (same style) ---------- */
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) el && el.classList.remove('hidden'); };
const hide = id => { const el = $(id); if (el) el && el.classList.add('hidden'); };
const setActiveMenu = (id) => {
  document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
  const el = $(id); if (el) el && el.classList.add('active');
};
const elCreate = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };

/* ---------- Global state helpers ---------- */
const STATE = {
  uid: null,
  profile: null,
  availabilityCache: null,
  currentChats: {}, // in-memory minimal chat placeholders
};

/* ---------- Auth init ---------- */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  STATE.uid = user.uid;
  await initPortal(user.uid);
});

/* ---------- Init Portal ---------- */
async function initPortal(uid) {
  // NOTE: The HTML you provided is student-facing; we reuse it.
  // Menu wiring: map existing menu items to tutor actions where applicable.
  $('menuDashboard').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); loadDashboard(uid); };
  $('menuSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadUpcomingSessions(uid); };
  // reuse BookTutor to mean "View Requests" for tutor
  $('menuBookTutor').onclick = () => { setActiveMenu('menuBookTutor'); showSection('searchSection'); loadIncomingRequests(uid); };
  // BookCounsellor: fallback to incoming requests as well
  $('menuBookCounsellor').onclick = () => { setActiveMenu('menuBookCounsellor'); showSection('searchSection'); loadIncomingRequests(uid); };
  $('menuProfile').onclick = () => { setActiveMenu('menuProfile'); showSection('profileSection'); loadProfile(uid); };
  $('menuSupport').onclick = () => { setActiveMenu('menuSupport'); showSection('supportSection'); };
  $('menuNotifications').onclick = () => { setActiveMenu('menuNotifications'); showSection('notificationsSection'); loadNotifications(uid); };
  $('menuPending').onclick = () => { setActiveMenu('menuPending'); showSection('pendingSection'); loadIncomingRequests(uid); };
  $('menuRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadTutorRatings(uid); };

  // Quick actions on dashboard
  $('openProfile').onclick = () => { setActiveMenu('menuProfile'); showSection('profileSection'); loadProfile(uid); };
  $('openTutorSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadUpcomingSessions(uid); };
  $('openPendingRequests').onclick = () => { setActiveMenu('menuPending'); showSection('pendingSection'); loadIncomingRequests(uid); };
  $('openRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadTutorRatings(uid); };

  // search/back handlers reused (searchSection will be Admissions/Requests listing here)
  $('quickSearchBtn').onclick = () => { openRequestsSearch($('quickSearch').value.trim()); };
  $('searchBtn').onclick = () => { openRequestsSearch($('searchInput').value.trim(), $('filterRole')?.value || ''); };
  $('searchBackBtn').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); loadDashboard(uid); };

  // profile save
  $('saveProfileBtn').onclick = async () => { await saveProfile(uid); };

  // support (report issue) uses sendSupport - tutors report to admin via same collection but different payload
  $('sendSupportBtn').onclick = async () => { await sendIssueAsTutor(uid); };

  // ratings search button
  $('ratingsSearchBtn').onclick = () => { loadTutorRatings(uid, $('ratingsFilterRole')?.value || '', $('ratingsSearch')?.value.trim() || ''); };

  // initial loads
  await loadProfile(uid);
  await loadDashboard(uid);
  await loadNotifications(uid);
  await loadPendingCounts(uid);

  // show dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');
}

/* ---------- Section toggling (reuse) ---------- */
function showSection(idToShow) {
  const sections = ['dashboardSection','searchSection','sessionsSection','profileSection','supportSection','notificationsSection','pendingSection','ratingsSection'];
  sections.forEach(s => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle('hidden', s !== idToShow);
  });
}

/* ---------- Profile for Tutor ---------- */
async function loadProfile(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const profile = snap.exists() ? snap.data() : null;
    STATE.profile = profile || {};
    if (profile) {
      // show read only fields available in student HTML
      $('profileEmail').textContent = profile.email || (auth.currentUser && auth.currentUser.email) || '';
      $('profileNameInput').value = profile.name || '';
      $('profileYearInput').value = profile.year || '';
      $('profileDepartmentInput').value = profile.department || '';
      $('profileCourseInput').value = profile.course || '';
      $('profilePictureInput').value = profile.profilePic || '';
      // But tutors have richer fields — store in STATE and provide edit modal from dashboard later
    } else {
      $('profileEmail').textContent = auth.currentUser ? auth.currentUser.email : '';
    }
  } catch (err) {
    console.error('loadProfile', err);
  }
}

async function saveProfile(uid) {
  try {
    // We store only the common fields in this UI; advanced tutor fields are handled by edit modal
    const userRef = doc(db, 'users', uid);
    const payload = {
      name: $('profileNameInput').value.trim(),
      year: $('profileYearInput').value,
      department: $('profileDepartmentInput').value.trim(),
      course: $('profileCourseInput').value.trim(),
      profilePic: $('profilePictureInput').value.trim()
    };
    await setDoc(userRef, payload, { merge: true });
    alert('Profile saved successfully.');
    await loadProfile(uid);
  } catch (err) {
    console.error('saveProfile', err);
    alert('Failed to save profile: ' + err.message);
  }
}

/* ---------- Dashboard: stats, quick actions, calendar summary ---------- */
async function loadDashboard(uid) {
  try {
    // gather stats for tutor identified by user record role === 'tutor' or 'counsellor'
    const meRef = doc(db, 'users', uid);
    const meSnap = await getDoc(meRef);
    const me = meSnap.exists() ? meSnap.data() : {};
    const isTutor = (me.role === 'tutor' || me.role === 'counsellor');

    // total sessions this week (approved & completed)
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday-ish (not perfect for locales)
    startOfWeek.setHours(0,0,0,0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const sessionsCol = collection(db, 'sessions');

    // query all sessions where tutor/counsellor is this user (we stored tutorId/counsellorId)
    const qAll = query(sessionsCol, where('personId', '==', uid)); // personId stored always
    const snapAll = await getDocs(qAll);
    const docs = snapAll.docs.map(d => ({ id: d.id, ...d.data() }));

    // compute stats
    const stats = {
      totalThisWeek: 0,
      upcoming: 0,
      pendingRequests: 0,
      avgRating: 0,
      completedSessions: 0,
      newNotifications: 0
    };

    // compute upcoming & pending
    const nowISO = now.toISOString();
    docs.forEach(s => {
      const dt = s.datetime ? new Date(s.datetime) : null;
      if (dt && dt >= startOfWeek && dt < endOfWeek) stats.totalThisWeek++;
      if (s.status === 'approved' && dt && dt >= now) stats.upcoming++;
      if (s.status === 'pending') stats.pendingRequests++;
      if (s.status === 'completed') stats.completedSessions++;
    });

    // avg rating
    const ratingsSnap = await getDocs(query(collection(db,'ratings'), where('personId','==', uid)));
    const ratings = ratingsSnap.docs.map(d => d.data());
    if (ratings.length) {
      stats.avgRating = (ratings.reduce((a,b) => a + (Number(b.stars)||0), 0) / ratings.length).toFixed(2);
    } else stats.avgRating = '—';

    // new notifications: reuse student's notification pattern but for tutor's sessions
    const notifSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), where('status','in', ['pending','approved'])));
    stats.newNotifications = notifSnap.size;

    // inject into dashboard cards (using same IDs as student HTML to avoid changing HTML)
    const maybeCard = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    maybeCard('summaryName', me.name || '—');
    maybeCard('summaryYear', me.year || '—');
    maybeCard('summaryDepartment', me.department || '—');
    maybeCard('summaryCourse', me.course || '—');

    maybeCard('tutorSessionSummary', `${stats.upcoming} upcoming` );
    maybeCard('counsellorSessionSummary', `${stats.pendingRequests} pending` );
    maybeCard('pendingCount', stats.pendingRequests);
    const rb = $('pendingBadge'); if (rb) rb.style.display = stats.pendingRequests>0 ? 'inline-block' : 'none';

    // create a quick stats area on dashboard (we will append a small block)
    renderDashboardQuickStats(stats);

  } catch (err) {
    console.error('loadDashboard', err);
  }
}

function renderDashboardQuickStats(stats) {
  // create or update a small stats box inside dashboardSection
  const parent = $('dashboardSection');
  if (!parent) return;
  let box = parent.querySelector('.tutor-stats');
  if (!box) {
    box = document.createElement('div');
    box.className = 'tutor-stats';
    box.style.margin = '16px 0';
    parent.insertBefore(box, parent.querySelector('.dashboard-cards') || null);
  }
  box.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div class="dash-card" style="min-width:160px"><h4>Total this week</h4><div style="font-size:22px">${stats.totalThisWeek}</div></div>
      <div class="dash-card" style="min-width:160px"><h4>Upcoming</h4><div style="font-size:22px">${stats.upcoming}</div></div>
      <div class="dash-card" style="min-width:160px"><h4>Pending requests</h4><div style="font-size:22px">${stats.pendingRequests}</div></div>
      <div class="dash-card" style="min-width:160px"><h4>Avg rating</h4><div style="font-size:22px">${stats.avgRating}</div></div>
      <div class="dash-card" style="min-width:160px"><h4>Completed</h4><div style="font-size:22px">${stats.completedSessions}</div></div>
      <div class="dash-card" style="min-width:160px"><h4>Notifications</h4><div style="font-size:22px">${stats.newNotifications}</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn" id="quickUpdateAvailability">Update Availability</button>
      <button class="btn" id="quickViewRequests">View Requests</button>
      <button class="btn" id="quickStartChat">Start Chat</button>
      <button class="btn" id="quickReportIssue">Report Issue</button>
    </div>
  `;

  // attach quick action handlers
  const uid = STATE.uid;
  box.querySelector('#quickUpdateAvailability').onclick = () => openAvailabilityModal(uid);
  box.querySelector('#quickViewRequests').onclick = () => { setActiveMenu('menuPending'); showSection('pendingSection'); loadIncomingRequests(uid); };
  box.querySelector('#quickStartChat').onclick = () => openChatSelector(uid);
  box.querySelector('#quickReportIssue').onclick = () => openReportIssueModal(uid);
}

/* ---------- UPCOMING SESSIONS (Approved bookings) ---------- */
async function loadUpcomingSessions(uid) {
  const container = $('sessionList');
  if (!container) return;
  container.innerHTML = 'Loading upcoming sessions...';
  try {
    // Fetch sessions where personId equals this tutor and status is approved
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('personId','==', uid), where('status','==','approved'), orderBy('datetime','asc'));
    const snap = await getDocs(q);
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty">No upcoming sessions.</div>';
      return;
    }

    // render table with action buttons
    const rows = sessions.map(s => {
      const datetime = s.datetime ? new Date(s.datetime).toLocaleString() : '—';
      // compute badge label: Today, In 30 minutes, Upcoming
      const badge = computeSessionBadgeLabel(s.datetime);
      const badgeCls = badge === 'In 30 minutes' ? 'avail-red' : (badge === 'Today' ? 'avail-green' : '');
      return `<tr data-id="${s.id}">
        <td style="width:220px">
          <div style="display:flex;align-items:center;gap:10px">
            <img src="${escapeHtml(s.studentPhoto||'assets/logos/uj.png')}" style="width:48px;height:48px;border-radius:8px;object-fit:cover">
            <div><strong>${escapeHtml(s.studentName||s.studentDisplayName||'Student')}</strong><div class="muted">${escapeHtml(s.module||s.course||'—')}</div></div>
          </div>
        </td>
        <td>${escapeHtml(datetime)}</td>
        <td>${escapeHtml(s.mode||'—')}</td>
        <td style="min-width:220px">
          <span class="${badgeCls}" style="padding:6px;border-radius:8px">${escapeHtml(badge)}</span>
        </td>
        <td style="max-width:420px">${escapeHtml(s.notes||'—')}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn start-session">Start</button>
            <button class="btn secondary mark-completed">Mark Completed</button>
            <button class="btn secondary request-reschedule">Request Reschedule</button>
            <button class="btn secondary cancel-session">Cancel</button>
            <button class="btn secondary chat-session">Chat</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `<table><thead><tr><th>Student</th><th>Date & Time</th><th>Mode</th><th>Status</th><th>Request Message</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;

    // attach handlers for each action
    container.querySelectorAll('.start-session').forEach(btn => {
      btn.onclick = async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        await handleStartSession(id);
      };
    });
    container.querySelectorAll('.mark-completed').forEach(btn => {
      btn.onclick = async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        if (!confirm('Mark this session as completed?')) return;
        try {
          await updateDoc(doc(db,'sessions',id), { status: 'completed', completedAt: new Date().toISOString() });
          alert('Marked completed.');
          await loadUpcomingSessions(uid);
        } catch (err) { console.error(err); alert('Failed to mark as completed: '+err.message); }
      };
    });
    container.querySelectorAll('.request-reschedule').forEach(btn => {
      btn.onclick = async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        await openRescheduleRequestModal(uid, id);
      };
    });
    container.querySelectorAll('.cancel-session').forEach(btn => {
      btn.onclick = async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        if (!confirm('Cancel this session?')) return;
        try {
          await updateDoc(doc(db,'sessions',id), { status: 'cancelled' });
          alert('Session cancelled.');
          await loadUpcomingSessions(uid);
        } catch (err) { console.error(err); alert('Failed to cancel: ' + err.message); }
      };
    });
    container.querySelectorAll('.chat-session').forEach(btn => {
      btn.onclick = async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        const row = ev.target.closest('tr');
        // open chat window with student
        const sdoc = sessions.find(x => x.id === id);
        if (!sdoc) return alert('Session data not found');
        openChatWindow({ id: sdoc.studentId, name: sdoc.studentName, photo: sdoc.studentPhoto });
      };
    });

    // auto-highlight urgent rows
    highlightUrgentSessions(container);

  } catch (err) {
    console.error('loadUpcomingSessions', err);
    container.innerHTML = `<div class="empty">Failed to load upcoming sessions</div>`;
  }
}

function computeSessionBadgeLabel(iso) {
  if (!iso) return 'Upcoming';
  const now = new Date();
  const dt = new Date(iso);
  const diff = dt - now;
  const mins = Math.round(diff / 60000);
  if (mins <= 30 && mins >= 0) return 'In 30 minutes';
  if (dt.toDateString() === now.toDateString()) return 'Today';
  if (mins < 0 && Math.abs(mins) < 1440) return 'Ongoing';
  return 'Upcoming';
}

function highlightUrgentSessions(container) {
  try {
    container.querySelectorAll('tbody tr').forEach(tr => {
      const id = tr.dataset.id;
      const dtCell = tr.children[1];
      if (!dtCell) return;
      const dtText = dtCell.textContent || '';
      // simple logic: if contains "In 30 minutes" or start within 30 minutes highlight
      const badgeCell = tr.children[3];
      if (!badgeCell) return;
      if (badgeCell.textContent.includes('In 30 minutes')) {
        tr.style.boxShadow = '0 6px 18px rgba(215,58,58,0.12)';
        tr.style.borderLeft = '4px solid #d73a3a';
      }
    });
  } catch (e) { /* ignore */ }
}

/* ---------- Action: Start session ---------- */
async function handleStartSession(sessionId) {
  try {
    const sRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sRef);
    if (!snap.exists()) return alert('Session not found');
    const s = snap.data();
    // check mode online and time window
    if (s.mode !== 'online') {
      return alert('This session is not online. Start in-person sessions at the scheduled location.');
    }
    const now = new Date();
    const dt = new Date(s.datetime);
    const diff = Math.abs(now - dt);
    // allow start if within +/- 15 minutes
    if (diff > 15 * 60 * 1000) {
      if (!confirm('Session is not within the 15-minute start window. Start anyway?')) return;
    }
    // set status to in-progress if needed
    await updateDoc(sRef, { status: 'in-progress', startedAt: new Date().toISOString() });
    alert('Session started. You can now chat / share materials.');
    // open chat window automatically
    openChatWindow({ id: s.studentId, name: s.studentName, photo: s.studentPhoto });
    // refresh
    await loadUpcomingSessions(STATE.uid);
  } catch (err) {
    console.error('handleStartSession', err);
    alert('Failed to start session: ' + err.message);
  }
}

/* ---------- Reschedule modal (tutor requests reschedule to student) ---------- */
async function openRescheduleRequestModal(tutorId, sessionId) {
  try {
    // fetch session
    const sRef = doc(db, 'sessions', sessionId);
    const sSnap = await getDoc(sRef);
    if (!sSnap.exists()) return alert('Session not found');
    const s = sSnap.data();

    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Request Reschedule — ${escapeHtml(s.studentName||'Student')}</h3>
        <div>
          <label>Propose new date & time</label>
          <input id="rs_dt" type="datetime-local" style="width:100%;margin-bottom:8px"/>
          <label>Message to student (optional)</label>
          <textarea id="rs_msg" rows="3" style="width:100%;margin-bottom:8px"></textarea>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn" id="rs_send">Send Request</button>
            <button class="btn secondary" id="rs_cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#rs_cancel').onclick = () => modal.remove();
    modal.querySelector('#rs_send').onclick = async () => {
      const newDT = modal.querySelector('#rs_dt').value;
      const message = modal.querySelector('#rs_msg').value.trim();
      if (!newDT) return alert('Pick a new date & time');
      const iso = new Date(newDT).toISOString();
      // Save a reschedule request subdocument or mark session with rescheduleRequested flag
      try {
        await updateDoc(sRef, {
          rescheduleRequested: true,
          rescheduleProposal: { by: 'tutor', ts: new Date().toISOString(), proposedAt: iso, message }
        });
        alert('Reschedule request sent to student.');
        modal.remove();
        await loadUpcomingSessions(tutorId);
      } catch (err) {
        console.error('reschedule request', err);
        alert('Failed to request reschedule: ' + err.message);
      }
    };

  } catch (err) {
    console.error('openRescheduleRequestModal', err);
    alert('Failed to open reschedule modal: ' + err.message);
  }
}

/* ---------- INCOMING REQUESTS (Pending requests) - for tutors to act on ---------- */
async function loadIncomingRequests(uid) {
  const container = $('searchResults'); // reuse searchResults area to show request cards
  const emptyEl = $('searchEmpty');
  if (!container) return;
  container.innerHTML = 'Loading incoming requests...';
  emptyEl.classList.add('hidden');

  try {
    const sessionsCol = collection(db, 'sessions');
    // pending requests where personId equals this tutor
    const q = query(sessionsCol, where('personId','==', uid), where('status','==','pending'), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (requests.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      emptyEl.textContent = 'No incoming requests.';
      return;
    }
    emptyEl.classList.add('hidden');

    container.innerHTML = ''; // clear
    requests.forEach(req => {
      const card = document.createElement('div');
      card.className = 'profile-card';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '8px';
      card.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center">
          <img src="${escapeHtml(req.studentPhoto || 'assets/logos/uj.png')}" class="profile-photo" />
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${escapeHtml(req.studentName || 'Student')}</strong>
                <div class="muted">${escapeHtml(req.module || req.course || '')}</div>
              </div>
              <div class="muted">${new Date(req.createdAt).toLocaleString()}</div>
            </div>
            <div style="margin-top:8px">Requested: <strong>${escapeHtml(req.datetime ? new Date(req.datetime).toLocaleString() : '—')}</strong> (${escapeHtml(req.mode||'—')})</div>
            <div style="margin-top:8px" class="muted">${escapeHtml(req.notes || '')}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn approve-req">Approve</button>
          <button class="btn secondary reject-req">Reject</button>
          <button class="btn secondary suggest-req">Suggest Time</button>
          <button class="btn secondary chat-req">Chat</button>
        </div>
      `;
      container.appendChild(card);

      // handlers
      card.querySelector('.approve-req').onclick = async () => {
        // approve the request if tutor available; otherwise suggest next available
        const conflict = await checkConflictForPerson(uid, req.datetime);
        if (conflict) {
          const suggested = await findNextAvailable(uid, req.datetime);
          if (suggested) {
            if (!confirm(`You appear to be unavailable at the requested time. Suggest ${new Date(suggested).toLocaleString()} instead?`)) return;
            // update session with suggested (status remains pending until student accepts)
            try {
              await updateDoc(doc(db,'sessions',req.id), {
                suggestedTime: suggested,
                suggestedBy: 'tutor',
                status: 'suggested'
              });
              alert('Suggested time sent to student.');
              await loadIncomingRequests(uid);
              await loadPendingCounts(uid);
            } catch (err) { console.error(err); alert('Failed to suggest: ' + err.message); }
            return;
          } else {
            if (!confirm('You are unavailable and no suggestion was found within next 24h. Approve anyway?')) return;
          }
        }
        // approve: set status approved
        try {
          await updateDoc(doc(db,'sessions',req.id), { status: 'approved', approvedAt: new Date().toISOString() });
          alert('Request approved.');
          await loadIncomingRequests(uid);
          await loadPendingCounts(uid);
          await loadUpcomingSessions(uid);
        } catch (err) { console.error(err); alert('Failed to approve: ' + err.message); }
      };

      card.querySelector('.reject-req').onclick = async () => {
        if (!confirm('Reject this request?')) return;
        try {
          await updateDoc(doc(db,'sessions',req.id), { status: 'rejected', rejectedAt: new Date().toISOString() });
          alert('Request rejected.');
          await loadIncomingRequests(uid);
          await loadPendingCounts(uid);
        } catch (err) { console.error(err); alert('Failed to reject: ' + err.message); }
      };

      card.querySelector('.suggest-req').onclick = async () => {
        const newISO = prompt('Enter suggested date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00');
        if (!newISO) return;
        if (isNaN(new Date(newISO))) return alert('Invalid date');
        const iso = new Date(newISO).toISOString();
        try {
          await updateDoc(doc(db,'sessions',req.id), { suggestedTime: iso, suggestedBy: 'tutor', status: 'suggested' });
          alert('Suggested time sent to student.');
          await loadIncomingRequests(uid);
          await loadPendingCounts(uid);
        } catch (err) { console.error(err); alert('Failed to suggest time: ' + err.message); }
      };

      card.querySelector('.chat-req').onclick = () => {
        openChatWindow({ id: req.studentId, name: req.studentName, photo: req.studentPhoto });
      };
    });

  } catch (err) {
    console.error('loadIncomingRequests', err);
    container.innerHTML = `<div class="empty">Failed to load incoming requests</div>`;
  }
}

/* Update pending count UI for tutor */
async function loadPendingCounts(uid) {
  try {
    const q = query(collection(db,'sessions'), where('personId','==', uid), where('status','==','pending'));
    const snap = await getDocs(q);
    const count = snap.size;
    const badge = $('pendingBadge');
    const pendingCountText = $('pendingCount');
    if (badge) badge.style.display = count>0 ? 'inline-block' : 'none';
    if (badge) badge.textContent = String(count);
    if (pendingCountText) pendingCountText.textContent = String(count);
  } catch (err) {
    console.error('loadPendingCounts', err);
  }
}

/* ---------- Manage Availability ---------- */
async function openAvailabilityModal(uid) {
  try {
    // fetch availability from users collection (we store availability array under users/{uid}.availability)
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const profile = snap.exists() ? snap.data() : {};
    const availability = profile.availability || []; // array of { day: 'Monday', from:'09:00', to:'11:00' }
    STATE.availabilityCache = Array.isArray(availability) ? JSON.parse(JSON.stringify(availability)) : [];

    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal" style="max-width:760px">
        <h3>Manage Availability</h3>
        <div style="display:flex;gap:12px;margin-bottom:8px">
          <button class="btn" id="avail_add_slot">Add Slot</button>
          <button class="btn secondary" id="avail_toggle_now">Toggle Available Now</button>
          <button class="btn secondary" id="avail_offline">Go Offline</button>
          <select id="avail_presets" style="margin-left:auto">
            <option value="">Quick Presets</option>
            <option value="all_week">Available All Week</option>
            <option value="only_evenings">Only Evenings</option>
            <option value="weekend_only">Weekend Only</option>
          </select>
        </div>
        <div id="avail_slots_container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px"></div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" id="avail_save">Save</button>
          <button class="btn secondary" id="avail_cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const container = modal.querySelector('#avail_slots_container');
    const renderSlots = () => {
      container.innerHTML = '';
      if (!STATE.availabilityCache || STATE.availabilityCache.length === 0) {
        container.innerHTML = '<div class="empty">No availability set.</div>';
        return;
      }
      STATE.availabilityCache.forEach((slot, idx) => {
        const card = document.createElement('div');
        card.className = 'profile-card';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '6px';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><strong>${escapeHtml(slot.day)}</strong></div>
            <div>
              <button class="btn secondary edit-slot" data-idx="${idx}">Edit</button>
              <button class="btn secondary delete-slot" data-idx="${idx}">Delete</button>
            </div>
          </div>
          <div class="muted">${escapeHtml(slot.from)} — ${escapeHtml(slot.to)}</div>
          <div class="muted">Location: ${escapeHtml(slot.location || '—')}</div>
        `;
        container.appendChild(card);
      });
    };

    // add slot handler
    modal.querySelector('#avail_add_slot').onclick = () => {
      const day = prompt('Day (e.g. Monday)');
      if (!day) return;
      const from = prompt('Start time (HH:MM)', '09:00');
      if (!from) return;
      const to = prompt('End time (HH:MM)', '11:00');
      if (!to) return;
      const location = prompt('Location (campus/building/room) (optional)', '') || '';
      STATE.availabilityCache.push({ day, from, to, location });
      renderSlots();
    };

    // edit/delete handlers (delegated)
    container.addEventListener('click', (ev) => {
      const edit = ev.target.closest('.edit-slot');
      const del = ev.target.closest('.delete-slot');
      if (edit) {
        const idx = Number(edit.dataset.idx);
        const slot = STATE.availabilityCache[idx];
        const day = prompt('Day', slot.day) || slot.day;
        const from = prompt('Start (HH:MM)', slot.from) || slot.from;
        const to = prompt('End (HH:MM)', slot.to) || slot.to;
        const location = prompt('Location', slot.location || '') || slot.location;
        STATE.availabilityCache[idx] = { day, from, to, location };
        renderSlots();
      } else if (del) {
        const idx = Number(del.dataset.idx);
        if (confirm('Remove this slot?')) {
          STATE.availabilityCache.splice(idx, 1);
          renderSlots();
        }
      }
    });

    // toggle available now
    modal.querySelector('#avail_toggle_now').onclick = async () => {
      const current = !!profile.availableNow;
      const newVal = !current;
      try {
        await setDoc(doc(db,'users',uid), { availableNow: newVal }, { merge: true });
        alert(`Available Now set to ${newVal ? 'ON' : 'OFF'}`);
        // reflect in local profile
        STATE.profile = STATE.profile || {};
        STATE.profile.availableNow = newVal;
      } catch (err) {
        console.error('toggle available now', err);
        alert('Failed to toggle available now: ' + err.message);
      }
    };

    // offline mode
    modal.querySelector('#avail_offline').onclick = async () => {
      if (!confirm('Go offline? This will mark you unavailable for new bookings.')) return;
      try {
        await setDoc(doc(db,'users',uid), { available: false }, { merge: true });
        alert('You are now offline.');
        STATE.profile = STATE.profile || {};
        STATE.profile.available = false;
      } catch (err) {
        console.error('avail offline', err);
        alert('Failed to go offline: ' + err.message);
      }
    };

    // presets
    modal.querySelector('#avail_presets').onchange = (ev) => {
      const v = ev.target.value;
      if (v === 'all_week') {
        STATE.availabilityCache = [
          { day: 'Monday', from: '08:00', to: '20:00' },
          { day: 'Tuesday', from: '08:00', to: '20:00' },
          { day: 'Wednesday', from: '08:00', to: '20:00' },
          { day: 'Thursday', from: '08:00', to: '20:00' },
          { day: 'Friday', from: '08:00', to: '20:00' },
          { day: 'Saturday', from: '09:00', to: '17:00' },
          { day: 'Sunday', from: '09:00', to: '17:00' }
        ];
      } else if (v === 'only_evenings') {
        STATE.availabilityCache = [
          { day: 'Monday', from: '17:00', to: '21:00' },
          { day: 'Tuesday', from: '17:00', to: '21:00' },
          { day: 'Wednesday', from: '17:00', to: '21:00' },
          { day: 'Thursday', from: '17:00', to: '21:00' },
          { day: 'Friday', from: '17:00', to: '21:00' }
        ];
      } else if (v === 'weekend_only') {
        STATE.availabilityCache = [
          { day: 'Saturday', from: '09:00', to: '17:00' },
          { day: 'Sunday', from: '09:00', to: '17:00' }
        ];
      }
      renderSlots();
    };

    // save/cancel
    modal.querySelector('#avail_cancel').onclick = () => modal.remove();
    modal.querySelector('#avail_save').onclick = async () => {
      try {
        await setDoc(doc(db,'users',uid), { availability: STATE.availabilityCache }, { merge: true });
        alert('Availability saved.');
        modal.remove();
      } catch (err) {
        console.error('save availability', err);
        alert('Failed to save availability: ' + err.message);
      }
    };

    // initial render
    renderSlots();

  } catch (err) {
    console.error('openAvailabilityModal', err);
    alert('Failed to open availability modal: ' + err.message);
  }
}

/* ---------- Helpers used earlier but defined here for part 1 ---------- */
/* checkConflictForPerson(personId, desiredISO) - simple scan for overlapping +/- 59 minutes */
async function checkConflictForPerson(personId, desiredISO) {
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('personId','==', personId));
    const snap = await getDocs(q);
    const desired = new Date(desiredISO);
    const startWindow = new Date(desired.getTime() - 60*60*1000);
    const endWindow = new Date(desired.getTime() + 60*60*1000);
    for (const d of snap.docs) {
      const s = d.data();
      if (!s.datetime) continue;
      const sdt = new Date(s.datetime);
      if (sdt >= startWindow && sdt <= endWindow && (s.status === 'approved' || s.status === 'pending' || s.status === 'in-progress')) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('checkConflictForPerson', err);
    return false;
  }
}

/* findNextAvailable(personId, desiredISO) => returns ISO string or null */
async function findNextAvailable(personId, desiredISO) {
  try {
    const base = new Date(desiredISO);
    for (let i = 1; i <= 24; i++) {
      const cand = new Date(base.getTime() + i * 60 * 60 * 1000);
      const iso = cand.toISOString();
      const conflict = await checkConflictForPerson(personId, iso);
      if (!conflict) return iso;
    }
    return null;
  } catch (err) {
    console.error('findNextAvailable', err);
    return null;
  }
}

/* ---------- End of PART 1 ---------- */
// When you want PART 2, request "send part 2" and I'll deliver immediately.

// tutor-portal-part2.js — PART 2 of 3
// Chat, Notifications, Ratings respond, Report Issue, Forgot-password OTP helpers

import { auth, db } from './firebase-config.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* Reuse helper functions: $, show, hide, escapeHtml, STATE expected from part1 when combined. */
const $ = id => document.getElementById(id);
function escapeHtml(s) { if (s === undefined || s === null) return ''; return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'"':'&#39;'}[c])); }

// Minimal in-memory pollers to refresh chat/messages (cleanup when modal closes)
const CHAT_POLLERS = {}; // { chatId: intervalId }

/* ---------- Chat UI ---------- */
// Opens a simple selector to pick a student to chat with (search recent students)
export async function openChatSelector(uid) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Start Chat</h3>
        <div>
          <input id="chatSearchInput" placeholder="Search student name or module" style="width:100%;margin-bottom:8px" />
          <div id="chatResults" style="max-height:320px;overflow:auto"></div>
          <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="chatCancel">Cancel</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#chatCancel').onclick = () => modal.remove();

    const results = modal.querySelector('#chatResults');

    async function loadRecent() {
      results.innerHTML = 'Loading recent...';
      // fetch recent sessions to find students
      const sessionsSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), orderBy('createdAt','desc'), limit(50)));
      const students = {};
      sessionsSnap.forEach(d => {
        const s = d.data();
        if (s.studentId) students[s.studentId] = { id: s.studentId, name: s.studentName, photo: s.studentPhoto };
      });
      const list = Object.values(students);
      if (list.length === 0) results.innerHTML = '<div class="empty">No recent students. Try searching.</div>';
      else {
        results.innerHTML = list.map(st => `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #eee">
            <img src="${escapeHtml(st.photo||'assets/logos/uj.png')}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">
            <div style="flex:1">
              <div><strong>${escapeHtml(st.name||'Student')}</strong></div>
            </div>
            <div><button class="btn start-chat" data-id="${escapeHtml(st.id)}" data-name="${escapeHtml(st.name)}">Chat</button></div>
          </div>
        `).join('');
        results.querySelectorAll('.start-chat').forEach(b => b.onclick = (ev) => {
          const id = ev.target.dataset.id; const name = ev.target.dataset.name;
          modal.remove(); openChatWindow({ id, name, photo: '' });
        });
      }
    }

    modal.querySelector('#chatSearchInput').oninput = async (ev) => {
      const q = ev.target.value.trim().toLowerCase();
      if (!q) return loadRecent();
      // search users collection for students matching
      const usersSnap = await getDocs(query(collection(db,'users'), where('role','==','student')));
      const users = usersSnap.docs.map(d=>({ id: d.id, ...d.data() })).filter(u => ((u.name||'') + ' ' + (u.modules||'') ).toLowerCase().includes(q));
      if (users.length === 0) results.innerHTML = '<div class="empty">No matches</div>';
      else {
        results.innerHTML = users.map(u => `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #eee">
            <img src="${escapeHtml(u.profilePic||'assets/logos/uj.png')}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">
            <div style="flex:1"><strong>${escapeHtml(u.name||'Student')}</strong><div class="muted">${escapeHtml(u.modules||'')}</div></div>
            <div><button class="btn start-chat" data-id="${escapeHtml(u.id)}" data-name="${escapeHtml(u.name)}">Chat</button></div>
          </div>
        `).join('');
        results.querySelectorAll('.start-chat').forEach(b => b.onclick = (ev) => { const id = ev.target.dataset.id; const name = ev.target.dataset.name; modal.remove(); openChatWindow({ id, name, photo: '' }); });
      }
    };

    await loadRecent();
  } catch (err) {
    console.error('openChatSelector', err);
    alert('Failed to open chat selector: ' + err.message);
  }
}

// constructs chatId deterministically
function chatIdFor(a,b) { return [a,b].sort().join('__'); }

// openChatWindow with minimal chat features (text only, attachments placeholder)
export async function openChatWindow(userObj) {
  try {
    if (!auth.currentUser) return alert('Not signed in');
    const myId = auth.currentUser.uid;
    const theirId = userObj.id;
    const chatId = chatIdFor(myId, theirId);

    // build modal
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal" style="max-width:720px">
        <h3>Chat with ${escapeHtml(userObj.name || 'Student')}</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div id="chatMessages" style="height:320px;overflow:auto;padding:6px;border:1px solid #eee;border-radius:8px;background:#fff"></div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="chatInput" placeholder="Write a message..." style="flex:1;padding:8px;border-radius:6px;border:1px solid #ccc" />
            <button class="btn" id="chatSend">Send</button>
            <button class="btn secondary" id="chatClose">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const messagesEl = modal.querySelector('#chatMessages');
    const inputEl = modal.querySelector('#chatInput');

    modal.querySelector('#chatClose').onclick = () => {
      modal.remove();
      // cleanup poller
      if (CHAT_POLLERS[chatId]) clearInterval(CHAT_POLLERS[chatId]);
      delete CHAT_POLLERS[chatId];
    };

    modal.querySelector('#chatSend').onclick = async () => {
      const txt = inputEl.value.trim();
      if (!txt) return;
      try {
        await addDoc(collection(db,'chats'), {
          chatId,
          from: myId,
          to: theirId,
          text: txt,
          createdAt: new Date().toISOString()
        });
        inputEl.value = '';
        await renderMessages();
      } catch (err) {
        console.error('send chat', err);
        alert('Failed to send message: ' + err.message);
      }
    };

    async function renderMessages() {
      try {
        const q = query(collection(db,'chats'), where('chatId','==', chatId), orderBy('createdAt','asc'));
        const snap = await getDocs(q);
        const msgs = snap.docs.map(d=>({ id: d.id, ...d.data() }));
        messagesEl.innerHTML = msgs.map(m => `
          <div style="margin-bottom:6px;display:flex;flex-direction:column;align-items:${m.from===myId?'flex-end':'flex-start'}">
            <div style="background:${m.from===myId?'#ff7a00':'#f0f0f0'};color:${m.from===myId?'#fff':'#333'};padding:8px;border-radius:8px;max-width:80%">${escapeHtml(m.text)}</div>
            <div class="muted" style="font-size:11px;margin-top:4px">${new Date(m.createdAt).toLocaleString()}</div>
          </div>
        `).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } catch (err) {
        console.error('renderMessages', err);
      }
    }

    // initial render
    await renderMessages();
    // poll every 3s for new messages
    CHAT_POLLERS[chatId] = setInterval(renderMessages, 3000);

  } catch (err) {
    console.error('openChatWindow', err);
    alert('Failed to open chat: ' + err.message);
  }
}

/* ---------- Notifications Center (tutor) ---------- */
export async function loadNotifications(uid) {
  try {
    // notifications derive from sessions, chat unread messages, reschedule requests
    const list = [];
    // sessions with status changes
    const sessSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), orderBy('createdAt','desc'), limit(50)));
    sessSnap.forEach(d => {
      const s = d.data();
      const label = s.status || 'update';
      list.push({ text: `${label}: ${s.studentName || 'Student'} — ${new Date(s.datetime||s.createdAt).toLocaleString()}`, ts: s.createdAt || s.datetime });
    });

    // recent chat messages to tutor (count last 20)
    const chatSnap = await getDocs(query(collection(db,'chats'), where('to','==', uid), orderBy('createdAt','desc'), limit(20)));
    chatSnap.forEach(d => {
      const c = d.data();
      list.push({ text: `Message from ${c.from}: ${String(c.text||'')}`, ts: c.createdAt });
    });

    // sort by ts desc
    list.sort((a,b) => new Date(b.ts) - new Date(a.ts));
    const con = $('notificationsList'); if (!con) return;
    con.innerHTML = list.length ? `<ul>${list.map(n => `<li>${escapeHtml(n.text)} <div class="muted" style="font-size:12px">${new Date(n.ts).toLocaleString()}</div></li>`).join('')}</ul>` : '<div class="empty">No notifications</div>';
  } catch (err) {
    console.error('loadNotifications', err);
    const con = $('notificationsList'); if (con) con.innerHTML = '<div class="empty">Failed to load notifications</div>';
  }
}

/* ---------- Ratings: Load + Respond ---------- */
export async function loadTutorRatings(uid, roleFilter = '', searchText = '') {
  try {
    const ratingsCol = collection(db,'ratings');
    const q = query(ratingsCol, where('personId','==', uid), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (roleFilter) docs = docs.filter(r => r.role === roleFilter);
    if (searchText) docs = docs.filter(r => (r.personName||'').toLowerCase().includes(searchText.toLowerCase()));
    const container = $('ratingsList'); if (!container) return;
    if (docs.length === 0) { $('ratingsEmpty')?.classList?.remove('hidden'); container.innerHTML = ''; return; }
    $('ratingsEmpty')?.classList?.add('hidden');
    container.innerHTML = docs.map(r => `
      <div class="profile-card" style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between">
          <div><strong>${escapeHtml(r.studentName||'Student')}</strong> <span class="muted">(${escapeHtml(r.role)})</span></div>
          <div>${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
        </div>
        <div class="muted" style="font-size:13px">${new Date(r.createdAt).toLocaleString()}</div>
        <div>${escapeHtml(r.comment||'')}</div>
        <div style="display:flex;gap:8px;margin-top:6px"><button class="btn reply-rating" data-id="${escapeHtml(r.id)}">Reply</button></div>
        <div class="rating-reply" id="reply_${escapeHtml(r.id)}"></div>
      </div>
    `).join('');

    // attach reply handlers
    container.querySelectorAll('.reply-rating').forEach(b => b.onclick = async (ev) => {
      const id = ev.target.dataset.id;
      openRatingReplyModal(uid, id);
    });

  } catch (err) {
    console.error('loadTutorRatings', err);
  }
}

async function openRatingReplyModal(uid, ratingId) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Reply to rating</h3>
        <div>
          <textarea id="replyText" rows="4" style="width:100%;margin-bottom:8px" placeholder="Type your reply (this will be visible to student)"></textarea>
          <div style="display:flex;gap:8px"><button class="btn" id="replySend">Send Reply</button><button class="btn secondary" id="replyCancel">Cancel</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#replyCancel').onclick = () => modal.remove();
    modal.querySelector('#replySend').onclick = async () => {
      const text = modal.querySelector('#replyText').value.trim();
      if (!text) return alert('Enter reply text');
      try {
        // store reply as subcollection under ratings/{ratingId}/replies or add reply field
        await addDoc(collection(db, `ratings/${ratingId}/replies`), {
          from: auth.currentUser.uid,
          text,
          createdAt: new Date().toISOString()
        });
        alert('Reply saved.');
        modal.remove();
        // refresh ratings
        await loadTutorRatings(uid);
      } catch (err) { console.error('reply save', err); alert('Failed to save reply: ' + err.message); }
    };
  } catch (err) { console.error('openRatingReplyModal', err); }
}

/* ---------- Report an Issue (Tutor) ---------- */
export async function openReportIssueModal(uid) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Report an Issue</h3>
        <div>
          <label>Title</label>
          <input id="issueTitle" style="width:100%;margin-bottom:8px" />
          <label>Description</label>
          <textarea id="issueDesc" rows="4" style="width:100%;margin-bottom:8px"></textarea>
          <label>Priority</label>
          <select id="issuePriority" style="width:100%;margin-bottom:8px"><option>Normal</option><option>Urgent</option></select>
          <label>Category</label>
          <select id="issueCategory" style="width:100%;margin-bottom:8px"><option>Technical</option><option>Student Behavior</option><option>Scheduling</option><option>Other</option></select>
          <div style="display:flex;gap:8px"><button class="btn" id="issueSend">Send</button><button class="btn secondary" id="issueCancel">Cancel</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#issueCancel').onclick = () => modal.remove();
    modal.querySelector('#issueSend').onclick = async () => {
      const title = modal.querySelector('#issueTitle').value.trim();
      const desc = modal.querySelector('#issueDesc').value.trim();
      const priority = modal.querySelector('#issuePriority').value;
      const category = modal.querySelector('#issueCategory').value;
      if (!title || !desc) return alert('Please provide title and description');
      try {
        await addDoc(collection(db,'issues'), {
          reporterId: uid,
          title,
          description: desc,
          priority,
          category,
          status: 'open',
          createdAt: new Date().toISOString()
        });
        alert('Issue reported. Admin will review.');
        modal.remove();
      } catch (err) { console.error('report issue', err); alert('Failed to send issue: ' + err.message); }
    };
  } catch (err) { console.error('openReportIssueModal', err); }
}

/* ---------- Forgot password (OTP-backed) ---------- */
// This implementation writes an OTP doc to "passwordResets" collection. A backend/cloud-function is expected to send the email.
export async function requestPasswordResetOTP(email) {
  try {
    if (!email) return alert('Enter email');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15*60*1000).toISOString();
    await addDoc(collection(db,'passwordResets'), { email, otp, expires, createdAt: new Date().toISOString(), used: false });
    alert('OTP generated and stored. (In production your system should email the OTP automatically).');
    return true;
  } catch (err) { console.error('requestPasswordResetOTP', err); alert('Failed to request OTP: ' + err.message); return false; }
}

export async function verifyPasswordResetOTP(email, otp, newPassword) {
  try {
    // find matching reset doc
    const snap = await getDocs(query(collection(db,'passwordResets'), where('email','==', email), where('otp','==', otp)));
    if (snap.empty) return alert('Invalid OTP');
    const docRef = snap.docs[0];
    const data = docRef.data();
    if (new Date(data.expires) < new Date()) return alert('OTP expired');
    // in real system, use admin SDK to change password or send reset link; here we call firebase.auth() reset link method
    await sendPasswordResetEmail(auth, email);
    // mark used
    await updateDoc(doc(db,'passwordResets', docRef.id), { used: true, usedAt: new Date().toISOString() });
    alert('OTP verified. A password reset email was sent to your address.');
    return true;
  } catch (err) { console.error('verifyPasswordResetOTP', err); alert('Failed to verify OTP: ' + err.message); return false; }
}

/* ---------- Notifications preferences (save) ---------- */
export async function saveNotificationPreferences(uid, { sms = false, email = true, inApp = true } = {}) {
  try {
    await setDoc(doc(db,'users',uid), { notificationPrefs: { sms, email, inApp } }, { merge: true });
    alert('Notification preferences saved.');
  } catch (err) { console.error('saveNotificationPreferences', err); alert('Failed to save preferences: ' + err.message); }
}

/* ---------- Utilities and small glue functions used by part1 and part3 ---------- */
export function generateGoogleCalendarLink({ title, details, location, start, end }) {
  const fmt = (d) => { return d.toISOString().replace(/-|:|\.\d+/g, ''); };
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, details: details || '', location: location || '', dates: `${fmt(start)}/${fmt(end)}` });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

/* Cleanup helper: remove all chat pollers (used when navigating away) */
export function cleanupAllChatPollers() {
  Object.keys(CHAT_POLLERS).forEach(id => { clearInterval(CHAT_POLLERS[id]); delete CHAT_POLLERS[id]; });
}

/* ---------- End of PART 2 ---------- */


