/*************************************************
  TUTOR PORTAL JS
  PART 1 / 2
  - Auth + Startup
  - Navigation
  - Load Dashboard
  - Load Sessions + Requests
**************************************************/

// Firestore imports (same as student)
import {
  getAuth, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import {
  getFirestore, collection, query, where, addDoc, getDocs,
  doc, getDoc, updateDoc, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { app } from "./firebase-config.js"; 

const db = getFirestore(app);
const auth = getAuth(app);

/* ------------------ Utilities ------------------ */
function $(id) { return document.getElementById(id); }
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

/* ============ AUTH + PAGE INIT ============ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  window.currentTutor = user;
  await loadTutorProfile(user.uid);
  initNavigation();
  showPage("dashPage");
  await loadTutorDashboard(user.uid);
});

/* ============ NAVIGATION HANDLERS ============ */
function initNavigation() {
  const menu = {
    "menuDashboard": "dashPage",
    "menuUpcoming": "upcomingPage",
    "menuRequests": "requestsPage",
    "menuAvailability": "availabilityPage",
    "menuChat": "chatPage",
    "menuNotifications": "notifPage",
    "menuRatings": "ratingsPage",
    "menuIssue": "issuePage",
    "menuProfile": "profilePage"
  };

  Object.keys(menu).forEach(key => {
    let btn = $(key);
    if (!btn) return;
    btn.onclick = () => {
      showPage(menu[key]);
      if (menu[key] === "upcomingPage") loadUpcomingSessions(currentTutor.uid);
      if (menu[key] === "requestsPage") loadIncomingRequests(currentTutor.uid);
    };
  });
}

/* Switch page */
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

/*************************************************
  SECTION 1: LOAD TUTOR PROFILE
**************************************************/
async function loadTutorProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  window.tutorData = data;

  // Fill profile fields
  $("profName").value = data.name || "";
  $("profBio").value = data.bio || "";
  $("profDept").value = data.department || "";
  $("profModules").value = data.modules || "";
  $("profQual").value = data.qualifications || "";
  $("profCity").value = data.city || "";
  $("profCampus").value = data.campus || "";
}

/*************************************************
  SECTION 2: DASHBOARD (Top Stats)
**************************************************/
async function loadTutorDashboard(uid) {
  await Promise.all([
    countUpcoming(uid),
    countPending(uid),
    loadAvgRating(uid),
    countCompleted(uid)
  ]);
}

/* Count upcoming sessions */
async function countUpcoming(uid) {
  const q1 = query(
    collection(db, "sessions"),
    where("tutorId", "==", uid),
    where("status", "==", "approved")
  );
  const snap = await getDocs(q1);
  $("statUpcoming").textContent = snap.size;
}

/* Count pending requests */
async function countPending(uid) {
  const q1 = query(
    collection(db, "sessions"),
    where("tutorId", "==", uid),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q1);
  $("statPending").textContent = snap.size;
}

/* Count completed */
async function countCompleted(uid) {
  const q1 = query(
    collection(db, "sessions"),
    where("tutorId", "==", uid),
    where("status", "==", "completed")
  );
  const snap = await getDocs(q1);
  $("statCompleted").textContent = snap.size;
}

/*************************************************
  SECTION 3: UPCOMING SESSIONS
**************************************************/
async function loadUpcomingSessions(uid) {
  const q1 = query(
    collection(db, "sessions"),
    where("tutorId", "==", uid),
    where("status", "==", "approved"),
    orderBy("datetime", "asc")
  );
  const snap = await getDocs(q1);

  let html = "";
  snap.forEach(docu => {
    const d = docu.data();
    const dt = new Date(d.datetime).toLocaleString();
    html += `
      <div class="card session-card">
        <div class="row">
          <div>
            <b>${escapeHtml(d.studentName || "")}</b>
            <div>${dt}</div>
            <div>Mode: ${d.mode}</div>
            <div class="request-msg">${escapeHtml(d.notes || "")}</div>
          </div>
          <div class="actions">
            <button class="btn" onclick="startOnline('${docu.id}', '${d.mode}')">Start</button>
            <button class="btn secondary" onclick="markCompleted('${docu.id}')">Completed</button>
            <button class="btn warn" onclick="openReschedule('${docu.id}', '${d.datetime}')">Reschedule</button>
            <button class="btn danger" onclick="cancelSession('${docu.id}')">Cancel</button>
          </div>
        </div>
      </div>
    `;
  });

  $("upcomingList").innerHTML = html || "<p>No scheduled upcoming sessions.</p>";
}

/*************************************************
  SECTION 4: INCOMING REQUESTS
**************************************************/
async function loadIncomingRequests(uid) {
  const q1 = query(
    collection(db, "sessions"),
    where("tutorId", "==", uid),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q1);

  let html = "";
  snap.forEach(docu => {
    const d = docu.data();
    const dt = new Date(d.datetime).toLocaleString();
    html += `
      <div class="card request-card">
        <b>${escapeHtml(d.studentName)}</b>
        <div>Date: ${dt}</div>
        <div>Mode: ${d.mode}</div>
        <div>${escapeHtml(d.notes || "")}</div>

        <div class="actions">
          <button class="btn" onclick="approveRequest('${docu.id}')">Approve</button>
          <button class="btn danger" onclick="rejectRequest('${docu.id}')">Reject</button>
          <button class="btn warn" onclick="openSuggestTime('${docu.id}', '${d.datetime}')">Suggest Time</button>
        </div>
      </div>
    `;
  });

  $("requestList").innerHTML = html || "<p>No pending requests.</p>";
}


/* ---------- Session action handlers ---------- */

/* Start online session - opens meeting link if exists */
window.startOnline = async function(sessionId, mode) {
  try {
    const sRef = doc(db, 'sessions', sessionId);
    const sSnap = await getDoc(sRef);
    if (!sSnap.exists()) return alert('Session not found');
    const s = sSnap.data();
    if (s.meetingLink) {
      window.open(s.meetingLink, '_blank');
    } else {
      // Option: create a meeting link or instruct tutor to paste one
      const addLink = confirm('No meeting link found. Add a meeting link now?');
      if (addLink) {
        const link = prompt('Paste meeting link (e.g. Teams/Zoom):', '');
        if (!link) return;
        await updateDoc(sRef, { meetingLink: link });
        window.open(link, '_blank');
      } else {
        alert('No meeting link. Use chat to coordinate with student.');
      }
    }
  } catch (err) {
    console.error('startOnline', err);
    alert('Failed to start session: ' + err.message);
  }
};

/* Mark session as completed */
window.markCompleted = async function(sessionId) {
  if (!confirm('Mark this session as completed?')) return;
  try {
    await updateDoc(doc(db,'sessions',sessionId), { status: 'completed', completedAt: new Date().toISOString() });
    alert('Session marked as completed.');
    if (window.currentTutor) loadUpcomingSessions(window.currentTutor.uid);
    if (window.currentTutor) loadTutorDashboard(window.currentTutor.uid);
  } catch (err) { console.error('markCompleted', err); alert('Failed: ' + err.message); }
};

/* Request reschedule: tutor suggests new time (student must accept) */
window.openReschedule = async function(sessionId, oldDatetime) {
  const newISO = prompt('Suggest new date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00', oldDatetime ? new Date(oldDatetime).toISOString().slice(0,16) : '');
  if (!newISO) return;
  if (isNaN(new Date(newISO))) { alert('Invalid date'); return; }
  try {
    await updateDoc(doc(db,'sessions',sessionId), { rescheduleSuggestion: new Date(newISO).toISOString(), status: 'reschedule_requested', rescheduleRequestedAt: new Date().toISOString() });
    alert('Reschedule suggested. Student will be notified.');
    if (window.currentTutor) loadIncomingRequests(window.currentTutor.uid);
    if (window.currentTutor) loadUpcomingSessions(window.currentTutor.uid);
  } catch (err) { console.error('openReschedule', err); alert('Failed: ' + err.message); }
};

/* Cancel session */
window.cancelSession = async function(sessionId) {
  if (!confirm('Cancel this session?')) return;
  try {
    await updateDoc(doc(db,'sessions',sessionId), { status: 'cancelled', cancelledAt: new Date().toISOString() });
    alert('Session cancelled.');
    if (window.currentTutor) loadUpcomingSessions(window.currentTutor.uid);
    if (window.currentTutor) loadTutorDashboard(window.currentTutor.uid);
  } catch (err) { console.error('cancelSession', err); alert('Failed: ' + err.message); }
};

/* Approve incoming request */
window.approveRequest = async function(sessionId) {
  if (!confirm('Approve this request?')) return;
  try {
    // allow tutor to optionally set meeting link
    const link = prompt('Add meeting link (optional):', '');
    const updates = { status: 'approved', approvedAt: new Date().toISOString() };
    if (link) updates.meetingLink = link;
    await updateDoc(doc(db,'sessions',sessionId), updates);
    alert('Request approved.');
    if (window.currentTutor) loadIncomingRequests(window.currentTutor.uid);
    if (window.currentTutor) loadTutorDashboard(window.currentTutor.uid);
  } catch (err) { console.error('approveRequest', err); alert('Failed: ' + err.message); }
};

/* Reject incoming request */
window.rejectRequest = async function(sessionId) {
  const reason = prompt('Reason for rejection (optional):', '') || '';
  if (!confirm('Reject this request?')) return;
  try {
    await updateDoc(doc(db,'sessions',sessionId), { status: 'rejected', rejectedReason: reason, rejectedAt: new Date().toISOString() });
    alert('Request rejected.');
    if (window.currentTutor) loadIncomingRequests(window.currentTutor.uid);
    if (window.currentTutor) loadTutorDashboard(window.currentTutor.uid);
  } catch (err) { console.error('rejectRequest', err); alert('Failed: ' + err.message); }
};

/* Suggest a new time for a pending request (alias of openReschedule) */
window.openSuggestTime = async function(sessionId, oldDatetime) {
  await window.openReschedule(sessionId, oldDatetime);
};

/* ---------- Availability quick helpers (used also in Part 1) ---------- */
/* Upsert slot was implemented in Part 1? We'll include a safe helper here */
async function upsertAvailabilitySlot(uid, day, slot) {
  try {
    const userRef = doc(db,'users',uid);
    const sSnap = await getDoc(userRef);
    const p = sSnap.exists() ? sSnap.data() : {};
    const av = p.availability || {};
    const arr = av[day] || [];
    arr.push(slot);
    av[day] = arr;
    await setDoc(userRef, { availability: av }, { merge: true });
  } catch (err) { console.error('upsertAvailabilitySlot', err); throw err; }
}

/* ---------- Ratings average (called from dashboard) ---------- */
async function loadAvgRating(uid) {
  try {
    const q = query(collection(db,'ratings'), where('personId','==',uid));
    const snap = await getDocs(q);
    const arr = snap.docs.map(d=>d.data());
    const avg = arr.length ? (arr.reduce((a,b)=>a + (Number(b.stars)||0),0)/arr.length).toFixed(2) : '—';
    // write to stat if exists
    if ($('statRating')) $('statRating').textContent = avg;
    return avg;
  } catch (err) { console.error('loadAvgRating', err); return '—'; }
}

/* ---------- Notifications loader (simple) ---------- */
async function loadNotificationsList(uid) {
  try {
    const q = query(collection(db,'sessions'), where('tutorId','==',uid), orderBy('createdAt','desc'), );
    const snap = await getDocs(q);
    const items = [];
    snap.forEach(snapDoc => {
      const s = snapDoc.data();
      items.push(`${s.status} — ${s.personName || s.studentName || 'Student'} at ${s.datetime ? new Date(s.datetime).toLocaleString() : '—'}`);
    });
    if ($('notificationsList')) {
      $('notificationsList').innerHTML = items.length ? `<ul>${items.slice(0,20).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<div class="muted">No notifications</div>';
    }
  } catch (err) { console.error('loadNotificationsList', err); if ($('notificationsList')) $('notificationsList').innerHTML = '<div class="empty">Failed to load</div>'; }
}

/* ---------- Basic Chat Helpers ---------- */
/* Open chat modal for a studentId (very similar to student implementation) */
window.openChatModalWith = async function(personId, personName) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Chat with ${escapeHtml(personName||'')}</h3>
        <div id="chatArea" style="height:300px;overflow:auto;border:1px solid #eee;padding:8px;border-radius:8px;background:#fafafa"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="chatMsg" placeholder="Type a message..." style="flex:1">
          <button class="btn" id="chatSend">Send</button>
          <button class="btn secondary" id="chatClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const convoId = `t_${auth.currentUser.uid}_p_${personId}`;
    const chatArea = modal.querySelector('#chatArea');

    // load messages
    try {
      const q = query(collection(db,'messages'), where('convoId','==',convoId), orderBy('createdAt','asc'));
      const snap = await getDocs(q);
      const msgs = snap.docs.map(d=>d.data());
      chatArea.innerHTML = msgs.map(m=>`<div><strong>${escapeHtml(m.fromName||m.from)}:</strong> ${escapeHtml(m.text)}</div>`).join('');
      chatArea.scrollTop = chatArea.scrollHeight;
    } catch (err) { console.error('load chat messages', err); chatArea.innerHTML = '<div class="muted">Failed to load messages</div>'; }

    modal.querySelector('#chatClose').onclick = () => modal.remove();
    modal.querySelector('#chatSend').onclick = async () => {
      const text = modal.querySelector('#chatMsg').value.trim();
      if (!text) return;
      try {
        await addDoc(collection(db,'messages'), {
          convoId,
          from: auth.currentUser.uid,
          fromName: window.tutorData ? (window.tutorData.name || '') : (auth.currentUser.email || ''),
          to: personId,
          text,
          createdAt: new Date().toISOString()
        });
        chatArea.innerHTML += `<div><strong>You:</strong> ${escapeHtml(text)}</div>`;
        modal.querySelector('#chatMsg').value = '';
        chatArea.scrollTop = chatArea.scrollHeight;
      } catch (err) { console.error('chat send', err); alert('Failed to send message'); }
    };
  } catch (err) { console.error('openChatModalWith', err); alert('Failed to open chat'); }
};

/* ---------- Profile save ---------- */
async function saveTutorProfile(uid) {
  try {
    const payload = {
      name: $('profName') ? $('profName').value.trim() : '',
      bio: $('profBio') ? $('profBio').value.trim() : '',
      department: $('profDept') ? $('profDept').value.trim() : '',
      modules: $('profModules') ? $('profModules').value.trim() : '',
      qualifications: $('profQual') ? $('profQual').value.trim() : '',
      city: $('profCity') ? $('profCity').value.trim() : '',
      campus: $('profCampus') ? $('profCampus').value.trim() : ''
    };
    await setDoc(doc(db,'users',uid), payload, { merge: true });
    alert('Profile updated.');
    await loadTutorProfile(uid);
  } catch (err) { console.error('saveTutorProfile', err); alert('Failed to save profile'); }
}
// expose to global so UI buttons can call
window.saveTutorProfile = saveTutorProfile;

/* ---------- Report Issue (if not already handled) ---------- */
async function sendTutorReport(uid) {
  const title = $('reportTitle') ? $('reportTitle').value.trim() : '';
  const category = $('reportCategory') ? $('reportCategory').value : 'Other';
  const priority = $('reportPriority') ? $('reportPriority').value : 'Normal';
  const desc = $('reportDesc') ? $('reportDesc').value.trim() : '';
  if (!title || !desc) return alert('Please enter title and description');
  try {
    await addDoc(collection(db,'reports'), {
      tutorId: uid,
      title,
      category,
      priority,
      description: desc,
      createdAt: new Date().toISOString(),
      status: 'open'
    });
    alert('Report sent to admin.');
    if ($('reportTitle')) $('reportTitle').value = '';
    if ($('reportDesc')) $('reportDesc').value = '';
  } catch (err) { console.error('sendTutorReport', err); alert('Failed to send report'); }
}
window.sendTutorReport = sendTutorReport;

/* ---------- Password reset (OTP-based) ---------- */
async function sendPasswordReset(email) {
  if (!email) return alert('Enter email to send reset');
  try {
    await sendPasswordResetEmail(auth, email);
    alert('Password reset email sent. Check your inbox.');
  } catch (err) { console.error('sendPasswordReset', err); alert('Failed to send reset: ' + err.message); }
}
window.sendPasswordReset = sendPasswordReset;

/* ---------- Helper: load/update incoming & upcoming after actions ---------- */
async function refreshAfterAction() {
  if (window.currentTutor) {
    await loadIncomingRequests(window.currentTutor.uid);
    await loadUpcomingSessions(window.currentTutor.uid);
    await loadTutorDashboard(window.currentTutor.uid);
  }
}

/* ---------- Expose some functions used by Part1 UI (safety) ---------- */
window.loadIncomingRequests = loadIncomingRequests;
window.loadUpcomingSessions = loadUpcomingSessions;
window.loadTutorDashboard = loadTutorDashboard;
window.loadNotificationsList = loadNotificationsList;
window.loadAvgRating = loadAvgRating;

/* ---------- Wire profile save button if element exists ---------- */
if ($('saveProfileBtn')) {
  $('saveProfileBtn').addEventListener('click', async () => {
    if (!window.currentTutor) return alert('Not signed in');
    await saveTutorProfile(window.currentTutor.uid);
  });
}

/* ---------- Wire report send button if element exists ---------- */
if ($('sendReportBtn')) {
  $('sendReportBtn').addEventListener('click', async () => {
    if (!window.currentTutor) return alert('Not signed in');
    await sendTutorReport(window.currentTutor.uid);
  });
}

/* ---------- Final note ---------- */
console.log('Tutor portal Part 2 loaded — action handlers active.');

