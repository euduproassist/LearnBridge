import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* ---------- small DOM helpers ---------- */
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) el && el.classList.remove('hidden'); };
const hide = id => { const el = $(id); if (el) el && el.classList.add('hidden'); };
const setActiveMenu = (id) => {
  document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
  const el = $(id); if (el) el && el.classList.add('active');
};
const elCreate = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };
function escapeHtml(s) { 
  if (s === undefined || s === null) return ''; 
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&quot;',"'":'&#39;'}[c])); 
}

/* ---------- Global state helpers ---------- */
const STATE = {
  uid: null,
  profile: null,
  availabilityCache: null,
};
const CHAT_LISTENERS = {}; // { chatId: unsubscribeFn }

/* ---------- Auth init ---------- */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = 'index.html'; // Redirect to login page
    return;
  }
  STATE.uid = user.uid;
  await initPortal(user.uid);
});

/* ---------- Init Portal ---------- */
async function initPortal(uid) {
  // Menu wiring
  $('menuDashboard').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); loadDashboard(uid); };
  $('menuSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadUpcomingAppointments(uid); };
  $('menuIncoming').onclick = () => { setActiveMenu('menuIncoming'); showSection('incomingSection'); loadClientRequests(uid); };
  $('menuAvailability').onclick = () => { setActiveMenu('menuAvailability'); showSection('availabilitySection'); openAvailabilityEditor(uid); };
  $('menuChat').onclick = () => { setActiveMenu('menuChat'); showSection('chatSection'); openChatSelector(uid); };
  $('menuNotifications').onclick = () => { setActiveMenu('menuNotifications'); showSection('notificationsSection'); loadNotifications(uid); };
  $('menuRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadCounsellorFeedback(uid); };
  $('menuReport').onclick = () => { setActiveMenu('menuReport'); showSection('reportSection'); };
  $('menuProfile').onclick = () => { setActiveMenu('menuProfile'); showSection('profileSection'); loadProfile(uid); };

  // Quick actions on dashboard
  $('updateAvailabilityQuick').onclick = () => { setActiveMenu('menuAvailability'); showSection('availabilitySection'); openAvailabilityEditor(uid); };
  $('viewIncomingQuick').onclick = () => { setActiveMenu('menuIncoming'); showSection('incomingSection'); loadClientRequests(uid); };
  $('quickChatBtn').onclick = () => { setActiveMenu('menuChat'); showSection('chatSection'); openChatSelector(uid); };
  $('quickReportBtn').onclick = () => { setActiveMenu('menuReport'); showSection('reportSection'); };

  // Profile/Report wiring
  $('saveProfileBtn').onclick = async () => { await saveProfile(uid); };
  $('resetPasswordBtn').onclick = async () => { await requestPasswordResetModal(auth.currentUser.email); };
  $('sendReportBtn').onclick = async () => { await sendIssueAsCounsellor(uid); };
  $('clearReportBtn').onclick = () => { $('reportTitle').value = ''; $('reportDesc').value = ''; };

  // Feedback wiring
  $('ratingsFilterBtn').onclick = () => { loadCounsellorFeedback(uid, $('ratingsFilter').value.trim() || ''); };
  
  // Logout
  $('logoutBtn').onclick = async () => { if (!confirm('Sign out?')) return; cleanupAllChatListeners(); await signOut(auth); window.location.href = 'index.html'; };

  // initial loads
  await loadProfile(uid);
  await loadDashboard(uid);
  await loadNotifications(uid);
  await loadPendingCounts(uid);

  // show dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');
}

/* ---------- Section toggling ---------- */
function showSection(idToShow) {
  const sections = ['dashboardSection','sessionsSection','incomingSection','availabilitySection','chatSection','notificationsSection','ratingsSection','reportSection','profileSection'];
  sections.forEach(s => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle('hidden', s !== idToShow);
  });
  cleanupAllChatListeners(); 
}

/* ---------- Profile for Counsellor (UPDATED Fields) ---------- */
async function loadProfile(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const profile = snap.exists() ? snap.data() : null;

    if (!profile) {
      alert("Error: Profile data missing. Logging out.");
      await signOut(auth); 
      return;
    }

    // FIX 1: CRITICAL SECURITY CHECK - Must be a counsellor
    if (profile.role !== 'counsellor') {
      alert(`Access Denied: Your role is '${profile.role}'. This portal is for Counsellors.`);
      await signOut(auth); 
      return;
    }

    STATE.profile = profile;
    
    // Populate profile fields (Ensure your HTML IDs match these)
    $('profileEmail').textContent = profile.email || (auth.currentUser && auth.currentUser.email) || '';
    $('profileNameInput').value = profile.name || '';
    
    // FIX 2: Ensure we read the fields the Admin Portal manages
    $('profileBioInput').value = profile.bio || ''; 
    $('profileModulesInput').value = profile.modules || ''; 
    $('profileDepartmentInput').value = profile.department || '';
    $('profileQualificationsInput').value = profile.qualifications || ''; 
    $('profilePictureInput').value = profile.profilePictureInput || '';
    $('profileLocationInput').value = profile.location || ''; 
    $('profileRateInput').value = profile.rate || ''; 
    
    // FIX 3: Display the Admin-set status
    const statusEl = $('profileStatusDisplay');
    if (statusEl) statusEl.textContent = profile.status || 'pending';

  } catch (err) {
    console.error('loadProfile failed', err);
    // Fail safe: log out on critical error
    await signOut(auth); 
  }
}


async function saveProfile(uid) {
  // Check if current status is suspended (prevent saving)
  if (STATE.profile?.status === 'suspended') {
      return alert('Profile changes cannot be saved while your account is suspended.');
  }

  try {
    const userRef = doc(db, 'users', uid);
    
    const payload = {
      name: $('profileNameInput').value.trim(),
      bio: $('profileBioInput').value.trim(),
      modules: $('profileModulesInput').value.trim(),
      department: $('profileDepartmentInput').value.trim(),
      qualifications: $('profileQualificationsInput').value.trim(),
      profilePictureInput: $('profilePictureInput').value.trim(),
      location: $('profileLocationInput').value.trim(),
      rate: $('profileRateInput').value.trim(),
      
      // CRITICAL - Preserve the Admin-set status
      status: STATE.profile?.status || 'pending', 
      
      // Hardcode role, but also include email and timestamp for Admin data integrity
      role: 'counsellor', 
      email: STATE.profile?.email || (auth.currentUser && auth.currentUser.email) || '', 
      updatedAt: new Date().toISOString()
    };
    
    await setDoc(userRef, payload, { merge: true });
    alert('Profile saved successfully.');
    await loadProfile(uid);
  } catch (err) {
    console.error('saveProfile', err);
    alert('Failed to save profile: ' + err.message);
  }
}


/* ---------- Dashboard (UPDATED Terminology) ---------- */
async function loadDashboard(uid) {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); 
    startOfWeek.setHours(0,0,0,0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const sessionsCol = collection(db, 'sessions');
    const qAll = query(sessionsCol, where('personId', '==', uid)); 
    const snapAll = await getDocs(qAll);
    const docs = snapAll.docs.map(d => ({ id: d.id, ...d.data() }));

    const stats = { totalThisWeek: 0, upcoming: 0, pendingRequests: 0, avgRating: '—', completedSessions: 0, notificationsSummary: 'Loading...' };

    let todaySessions = [];
    docs.forEach(s => {
      const dt = s.datetime ? new Date(s.datetime) : null;
      if (dt && dt >= startOfWeek && dt < endOfWeek && s.status === 'completed') stats.totalThisWeek++;
      if (s.status === 'approved' && dt && dt >= now) stats.upcoming++;
      if (s.status === 'pending') stats.pendingRequests++;
      if (s.status === 'completed') stats.completedSessions++;
      if (dt && dt.toDateString() === now.toDateString() && (s.status === 'approved' || s.status === 'in-progress')) {
          todaySessions.push(s);
      }
    });

    // avg rating/feedback
    const ratingsSnap = await getDocs(query(collection(db,'ratings'), where('personId','==', uid)));
    const ratings = ratingsSnap.docs.map(d => d.data());
    if (ratings.length) {
      stats.avgRating = (ratings.reduce((a,b) => a + (Number(b.stars)||0), 0) / ratings.length).toFixed(2);
    } 

    // Inject into dashboard cards
    $('statThisWeek').textContent = stats.totalThisWeek;
    $('statUpcoming').textContent = stats.upcoming;
    $('statPending').textContent = stats.pendingRequests; 
    $('statRating').textContent = stats.avgRating;
    
    // Today's schedule
    if (todaySessions.length) {
        $('todayList').innerHTML = todaySessions.slice(0, 3).map(s => 
          `<p style="margin-bottom:4px;">${new Date(s.datetime).toLocaleTimeString()} - ${escapeHtml(s.studentName || 'Client')}</p>`
        ).join('');

        if (todaySessions.length > 3) {
            $('todayList').innerHTML += `<small class="muted">...and ${todaySessions.length - 3} more.</small>`;
        }
    } else {
        $('todayList').textContent = "No appointments today.";
    }
    
    // Notifications summary 
    const notifSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), where('status','in', ['pending','suggested','rescheduleRequested'])));
    stats.notificationsSummary = notifSnap.size > 0 ? `${notifSnap.size} appointment actions pending.` : 'All clear.';
    $('dashNotifs').textContent = stats.notificationsSummary;

  } catch (err) {
    console.error('loadDashboard', err);
  }
}

/* ---------- Appointments List (renamed from loadUpcomingSessions) ---------- */
async function loadUpcomingAppointments(uid) {
  const container = $('sessionList');
  if (!container) return;
  container.innerHTML = 'Loading appointments...';
  
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('personId','==', uid), where('status','==','approved'), orderBy('datetime','asc'));
    const snap = await getDocs(q);
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty">No upcoming appointments.</div>';
      return;
    }

    container.innerHTML = '<table><thead><tr><th>Time</th><th>Client</th><th>Service</th><th>Mode</th><th>Actions</th></tr></thead><tbody>';
    sessions.forEach(s => {
      const dt = s.datetime ? new Date(s.datetime) : null;
      if (!dt || dt < new Date()) return;

      const tr = elCreate('tr');
      tr.innerHTML = `
        <td>${dt.toLocaleString()}</td>
        <td>${escapeHtml(s.studentName || 'Client')}</td>
        <td>${escapeHtml(s.module || s.course || 'General')}</td>
        <td>${escapeHtml(s.mode)}</td>
        <td>
          <button class="btn secondary start-session" data-id="${s.id}">Start Appointment</button>
          <button class="btn secondary reschedule-session" data-id="${s.id}">Reschedule</button>
        </td>
      `;
      container.querySelector('tbody').appendChild(tr);
    });
    container.innerHTML += '</tbody></table>';

    // Handlers
    container.querySelectorAll('.start-session').forEach(btn => btn.onclick = (e) => handleStartSession(e.target.dataset.id));
    // container.querySelectorAll('.reschedule-session').forEach(btn => btn.onclick = (e) => openRescheduleRequestModal(e.target.dataset.id));
  
  } catch (err) {
    console.error('loadUpcomingAppointments', err);
    container.innerHTML = '<div class="empty">Failed to load appointments.</div>';
  }
}

/* ---------- Action: Start session (UPDATED terminology) ---------- */
async function handleStartSession(sessionId) {
  try {
    const sRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sRef);
    if (!snap.exists()) return alert('Appointment not found');
    const s = snap.data();
    
    // check mode online and time window
    if (s.mode !== 'online') {
      return alert('This appointment is not online. Start in-person appointments at the scheduled location.');
    }
    // Set status to in-progress
    await updateDoc(sRef, { status: 'in-progress', startedAt: new Date().toISOString() });
    alert('Appointment started. You can now chat / share materials.');
    
    // open chat window automatically
    openChatWindow({ id: s.studentId, name: s.studentName, photo: s.studentPhoto });
    // refresh
    await loadUpcomingAppointments(STATE.uid);
  } catch (err) {
    console.error('handleStartSession', err);
    alert('Failed to start appointment: ' + err.message);
  }
}

/* ---------- CLIENT REQUESTS (Pending requests) - for counsellors to act on (UPDATED terminology) ---------- */
async function loadClientRequests(uid) {
  const container = $('incomingList'); 
  const emptyEl = $('incomingEmpty'); 
  if (!container) return;
  container.innerHTML = 'Loading incoming client requests...';
  hide('incomingEmpty');

  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('personId','==', uid), where('status','in',['pending', 'suggested']), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (requests.length === 0) {
      container.innerHTML = '';
      show('incomingEmpty');
      emptyEl.textContent = 'No incoming client requests.';
      return;
    }
    hide('incomingEmpty');
    
    container.innerHTML = '';
    requests.forEach(req => {
        let dtDisplay = req.datetime ? new Date(req.datetime).toLocaleString() : '—';
        let statusBadge = req.status === 'suggested' ? `<span class="badge" style="background:orange">Awaiting Client Confirmation</span>` : `<span class="badge">Pending Your Approval</span>`;
        let timeRequested = req.datetime ? new Date(req.datetime).toLocaleString() : '—';
        let suggestedTime = req.suggestedTime ? new Date(req.suggestedTime).toLocaleString() : null;

        const card = document.createElement('div');
        card.className = 'profile-card';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '8px';
        card.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center">
            <img src="${escapeHtml(req.studentPhoto || 'assets/logos/uj.png')}" class="profile-photo" style="width:48px;height:48px"/>
            <div style="flex:1">
                <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <strong>${escapeHtml(req.studentName || 'Client')}</strong>
                    <div class="muted">${escapeHtml(req.module || req.course || '')} (Service)</div>
                </div>
                <div class="muted">${new Date(req.createdAt).toLocaleString()}</div>
                </div>
                <div style="margin-top:8px">Requested: <strong>${escapeHtml(timeRequested)}</strong> (${escapeHtml(req.mode||'—')})</div>
                ${suggestedTime ? `<div style="margin-top:4px;color:orange">Suggested: <strong>${escapeHtml(suggestedTime)}</strong></div>` : ''}
                <div style="margin-top:8px">${statusBadge}</div>
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
        
        // Handlers remain the same, using the fixed conflict check
        card.querySelector('.approve-req').onclick = async () => {
          const conflict = await checkConflictForPerson(uid, req.datetime);
          if (conflict) {
              const suggested = await findNextAvailable(uid, req.datetime);
              if (suggested) {
                  if (!confirm(`Conflict at requested time. Suggest ${new Date(suggested).toLocaleString()} instead?`)) return;
                  // Update session with suggested
                  await updateDoc(doc(db,'sessions',req.id), { suggestedTime: suggested, suggestedBy: 'counsellor', status: 'suggested' });
                  alert('Suggested time sent to client.');
              } else {
                  if (!confirm('You are unavailable. Approve anyway?')) return;
              }
          }
          // Approve: set status approved
          if (!conflict || confirm('Proceeding with approval despite conflict.')) {
              await updateDoc(doc(db,'sessions',req.id), { status: 'approved', approvedAt: new Date().toISOString(), suggestedTime: null });
              alert('Request approved.');
          }
          await loadClientRequests(uid);
          await loadPendingCounts(uid);
        };
        
        card.querySelector('.reject-req').onclick = async () => {
          if (!confirm('Reject this request?')) return;
          await updateDoc(doc(db,'sessions',req.id), { status: 'rejected', rejectedAt: new Date().toISOString() });
          alert('Request rejected.');
          await loadClientRequests(uid);
          await loadPendingCounts(uid);
        };
        
        card.querySelector('.suggest-req').onclick = async () => {
          const newISO = prompt('Enter suggested date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00');
          if (!newISO || isNaN(new Date(newISO))) return alert('Invalid date');
          const iso = new Date(newISO).toISOString();
          await updateDoc(doc(db,'sessions',req.id), { suggestedTime: iso, suggestedBy: 'counsellor', status: 'suggested' });
          alert('Suggested time sent to client.');
          await loadClientRequests(uid);
          await loadPendingCounts(uid);
        };

        card.querySelector('.chat-req').onclick = () => {
          openChatWindow({ id: req.studentId, name: req.studentName, photo: req.studentPhoto });
        };
    });

  } catch (err) {
    console.error('loadClientRequests', err);
    container.innerHTML = `<div class="empty">Failed to load incoming client requests</div>`;
  }
}

/* Update pending count UI (remains same) */
async function loadPendingCounts(uid) {
  try {
    const q = query(collection(db,'sessions'), where('personId','==', uid), where('status','==','pending'));
    const snap = await getDocs(q);
    const count = snap.size;
    const badge = $('incomingBadge'); 
    const statPending = $('statPending'); 
    
    if (badge) {
        badge.style.display = count>0 ? 'inline-block' : 'none';
        badge.textContent = String(count);
    }
    if (statPending) statPending.textContent = String(count);
  } catch (err) {
    console.error('loadPendingCounts', err);
  }
}

/* ---------- Manage Availability (remains same) ---------- */
function openAvailabilityEditor(uid) {
  const profile = STATE.profile || {};
  const availability = profile.availability || [];
  STATE.availabilityCache = Array.isArray(availability) ? JSON.parse(JSON.stringify(availability)) : [];
  
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const container = $('availabilityTable');
  
  const renderAvailabilityTable = () => {
    container.innerHTML = '<table><thead><tr><th>Day</th><th>From</th><th>To</th><th>Location</th><th>Actions</th></tr></thead><tbody></tbody></table>';
    const tbody = container.querySelector('tbody');
    
    if (STATE.availabilityCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty">No availability slots set. Use presets or add a slot below.</div></td></tr>`;
    }
    STATE.availabilityCache.forEach((slot, idx) => {
      const tr = elCreate('tr');
      tr.innerHTML = `
        <td>${slot.day}</td>
        <td>${slot.from}</td>
        <td>${slot.to}</td>
        <td>${slot.location || 'Any'}</td>
        <td>
          <button class="btn secondary edit-slot" data-idx="${idx}">Edit</button>
          <button class="btn secondary delete-slot" data-idx="${idx}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Delegated Edit/Delete Handlers
    container.onclick = (ev) => {
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
        renderAvailabilityTable();
      } else if (del) {
        const idx = Number(del.dataset.idx);
        if (confirm('Remove this slot?')) {
          STATE.availabilityCache.splice(idx, 1);
          renderAvailabilityTable();
        }
      }
    };
  };

  // Attach Add Slot UI only once if it doesn't exist
  if (!document.getElementById('addSlotRow')) {
    const addRow = elCreate('div', { id: 'addSlotRow', style: 'display:flex; gap:8px; margin-top:10px;' });
    addRow.innerHTML = `
      <select id="slotDay" style="padding:10px">${days.map(d => `<option>${d}</option>`).join('')}</select>
      <input id="slotFrom" placeholder="From (HH:MM)" value="09:00" style="width:120px">
      <input id="slotTo" placeholder="To (HH:MM)" value="17:00" style="width:120px">
      <input id="slotLocation" placeholder="Location (Optional)" style="flex:1">
      <button class="btn" id="addSlotBtn" style="white-space:nowrap">Add Slot</button>
    `;
    $('availabilityEditor').appendChild(addRow);

    $('addSlotBtn').onclick = () => {
      const day = $('slotDay').value;
      const from = $('slotFrom').value.trim();
      const to = $('slotTo').value.trim();
      const location = $('slotLocation').value.trim();
      if (!from || !to || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
        return alert('Enter valid times (HH:MM)');
      }
      STATE.availabilityCache.push({ day, from, to, location });
      renderAvailabilityTable();
    };
  }

  // Attach handlers for the fixed buttons in the HTML
  $('saveAvailabilityBtn').onclick = async () => {
    try {
      await setDoc(doc(db,'users',uid), { availability: STATE.availabilityCache }, { merge: true });
      alert('Availability saved.');
    } catch (err) { alert('Failed to save availability: ' + err.message); }
  };
  $('toggleAvailableNowBtn').onclick = async () => {
    const current = !!profile.availableNow;
    const newVal = !current;
    await setDoc(doc(db,'users',uid), { availableNow: newVal }, { merge: true });
    alert(`Available Now set to ${newVal ? 'ON' : 'OFF'}`);
    loadProfile(uid); 
  };
  $('offlineModeBtn').onclick = async () => {
    if (!confirm('Go offline? This will mark you unavailable for new requests.')) return;
    await setDoc(doc(db,'users',uid), { available: false, availableNow: false }, { merge: true });
    alert('You are now offline.');
    loadProfile(uid);
  };
  
  // Presets handling (remains same)
  $('presetAllWeek').onclick = () => {
    STATE.availabilityCache = [
      { day: 'Monday', from: '08:00', to: '20:00' }, { day: 'Tuesday', from: '08:00', to: '20:00' }, 
      { day: 'Wednesday', from: '08:00', to: '20:00' }, { day: 'Thursday', from: '08:00', to: '20:00' }, 
      { day: 'Friday', from: '08:00', to: '20:00' }, { day: 'Saturday', from: '09:00', to: '17:00' }, 
      { day: 'Sunday', from: '09:00', to: '17:00' }
    ];
    renderAvailabilityTable();
  };
  $('presetEvenings').onclick = () => {
    STATE.availabilityCache = [
      { day: 'Monday', from: '17:00', to: '21:00' }, { day: 'Tuesday', from: '17:00', to: '21:00' }, 
      { day: 'Wednesday', from: '17:00', to: '21:00' }, { day: 'Thursday', from: '17:00', to: '21:00' }, 
      { day: 'Friday', from: '17:00', to: '21:00' }
    ];
    renderAvailabilityTable();
  };
  $('presetWeekend').onclick = () => {
    STATE.availabilityCache = [
      { day: 'Saturday', from: '09:00', to: '17:00' }, { day: 'Sunday', from: '09:00', to: '17:00' }
    ];
    renderAvailabilityTable();
  };

  renderAvailabilityTable();
}


/* ---------- Chat UI (remains same) ---------- */
function chatIdFor(a,b) { return [a,b].sort().join('__'); }

export async function openChatSelector(uid) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Start Chat</h3>
        <div>
          <input id="chatSearchInput" placeholder="Search client name or service" style="width:100%;margin-bottom:8px" />
          <div id="chatResults" style="max-height:320px;overflow:auto"></div>
          <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="chatCancel">Cancel</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#chatCancel').onclick = () => modal.remove();

    const results = modal.querySelector('#chatResults');

    async function loadRecent() {
      results.innerHTML = 'Loading recent clients...';
      const sessionsSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), orderBy('createdAt','desc'), limit(50)));
      const clients = {};
      sessionsSnap.forEach(d => {
        const s = d.data();
        if (s.studentId) clients[s.studentId] = { id: s.studentId, name: s.studentName, photo: s.studentPhoto };
      });
      const list = Object.values(clients);
      if (list.length === 0) results.innerHTML = '<div class="empty">No recent clients. Try searching.</div>';
      else {
        results.innerHTML = list.map(st => `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #eee">
            <img src="${escapeHtml(st.photo||'assets/logos/uj.png')}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">
            <div style="flex:1">
              <div><strong>${escapeHtml(st.name||'Client')}</strong></div>
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
      const usersSnap = await getDocs(query(collection(db,'users'), where('role','==','student')));
      const users = usersSnap.docs.map(d=>({ id: d.id, ...d.data() })).filter(u => ((u.name||'') + ' ' + (u.modules||'') ).toLowerCase().includes(q));
      if (users.length === 0) results.innerHTML = '<div class="empty">No matches</div>';
      else {
        results.innerHTML = users.map(u => `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #eee">
            <img src="${escapeHtml(u.profilePic||'assets/logos/uj.png')}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">
            <div style="flex:1"><strong>${escapeHtml(u.name||'Client')}</strong><div class="muted">${escapeHtml(u.modules||'Service')}</div></div>
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

export async function openChatWindow(userObj) {
  try {
    if (!auth.currentUser) return alert('Not signed in');
    const myId = auth.currentUser.uid;
    const theirId = userObj.id;
    const chatId = chatIdFor(myId, theirId);
    
    // Cleanup any existing listener for this chat
    if (CHAT_LISTENERS[chatId]) CHAT_LISTENERS[chatId]();
    delete CHAT_LISTENERS[chatId];
    
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal" style="max-width:720px">
        <h3>Chat with ${escapeHtml(userObj.name || 'Client')}</h3>
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
      if (CHAT_LISTENERS[chatId]) CHAT_LISTENERS[chatId]();
      delete CHAT_LISTENERS[chatId];
    };

    modal.querySelector('#chatSend').onclick = async () => {
      const txt = inputEl.value.trim();
      if (!txt) return;
      try {

        inputEl.value = '';
      } catch (err) {
        console.error('send chat', err);
        alert('Failed to send message: ' + err.message);
      }
    };

    function renderMessages(snap) {
      if (!snap) return; 
      try {
        const msgs = snap.docs.map(d=>({ id: d.id, ...d.data() }));
        messagesEl.innerHTML = msgs.map(m => `
          <div style="margin-bottom:6px;display:flex;flex-direction:column;align-items:${m.from===myId?'flex-end':'flex-start'}">
            <div style="background:${m.from===myId?'#0070a0':'#f0f0f0'};color:${m.from===myId?'#fff':'#333'};padding:8px;border-radius:8px;max-width:80%">${escapeHtml(m.text)}</div>
            <div class="muted" style="font-size:11px;margin-top:4px">${new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
        `).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } catch (err) {
        console.error('renderMessages', err);
      }
    }

    // Set up real-time listener
    const q = query(collection(db,'chats'), where('chatId','==', chatId), orderBy('createdAt','asc'));
    const unsubscribe = onSnapshot(q, renderMessages, (error) => {
        console.error('Chat listener failed:', error);
        messagesEl.innerHTML = 'Failed to load messages.';
    });
    CHAT_LISTENERS[chatId] = unsubscribe; 

  } catch (err) {
    console.error('openChatWindow', err);
    alert('Failed to open chat: ' + err.message);
  }
}

/* Cleanup helper: remove all chat listeners */
function cleanupAllChatListeners() {
  Object.keys(CHAT_LISTENERS).forEach(id => { 
    if(CHAT_LISTENERS[id]) CHAT_LISTENERS[id]();
    delete CHAT_LISTENERS[id]; 
  });
}

/* ---------- Notifications List (simple list of actions needed or completed) ---------- */
async function loadNotifications(uid) {
  const container = $('notificationsList');
  if (!container) return;
  container.innerHTML = 'Loading notifications...';

  try {
    const sessionsCol = collection(db, 'sessions');
    
    // Query for sessions that require action or have had recent status changes
    const q = query(sessionsCol, 
      where('personId', '==', uid), 
      where('status', 'in', ['pending', 'suggested', 'rescheduleRequested', 'rejected', 'cancelled']), 
      orderBy('createdAt', 'desc'), 
      limit(20) 
    );
    const snap = await getDocs(q);
    const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (notifications.length === 0) {
      container.innerHTML = '<div class="empty">No recent notifications or actions required.</div>';
      return;
    }

    container.innerHTML = notifications.map(n => {
      let message;
      let badgeStyle = 'background:#888;';
      const clientName = escapeHtml(n.studentName || 'Client');
      const time = new Date(n.createdAt).toLocaleString();

      switch (n.status) {
        case 'pending':
          message = `New request from ${clientName} needs your approval.`;
          badgeStyle = 'background:red;';
          break;
        case 'suggested':
          message = `Time suggestion sent to ${clientName}. Awaiting their confirmation.`;
          badgeStyle = 'background:orange;';
          break;
        case 'rescheduleRequested':
          message = `${clientName} requested a reschedule. Action required.`;
          badgeStyle = 'background:blue;';
          break;
        case 'rejected':
          message = `A request from ${clientName} was rejected.`;
          break;
        case 'cancelled':
          message = `Appointment with ${clientName} was cancelled by the client.`;
          break;
        default:
          message = `Status update for session with ${clientName} (${n.status}).`;
      }

      return `
        <div class="notification-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #eee;">
          <div style="flex:1">
            <span class="badge" style="${badgeStyle}margin-right:8px">${n.status.toUpperCase()}</span>
            ${message}
          </div>
          <small class="muted">${time}</small>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('loadNotifications', err);
    container.innerHTML = '<div class="empty">Failed to load notifications.</div>';
  }
}

/* ---------- Client Feedback (renamed from loadTutorRatings) ---------- */
async function loadCounsellorFeedback(uid, filter = '') {
  const container = $('ratingsList');
  const emptyEl = $('ratingsEmpty');
  if (!container) return;
  container.innerHTML = 'Loading feedback...';
  hide('ratingsEmpty');

  try {
    const ratingsCol = collection(db, 'ratings');
    let q = query(ratingsCol, where('personId', '==', uid), orderBy('createdAt', 'desc'));

    if (filter) {
        // Simple text filter for notes/service name (assuming 'module' is service name in session)
        // Note: For complex filtering (e.g., star range, urgency), dedicated fields would be needed in the 'ratings' collection.
    }
    
    const snap = await getDocs(q);
    const feedback = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (feedback.length === 0) {
      container.innerHTML = '';
      show('ratingsEmpty');
      emptyEl.textContent = 'No client feedback yet.';
      return;
    }
    hide('ratingsEmpty');

    container.innerHTML = feedback.map(f => {
        const stars = f.stars || '—';
        const urgencyClass = (f.urgency === 'Urgent') ? 'urgent' : '';
        const clientName = f.studentName || 'Anonymous Client';
        
        return `
          <div class="profile-card ${urgencyClass}" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${clientName}</strong>
                <div class="badge">${stars} / 5 Score</div>
            </div>
            <p class="muted" style="margin-top:6px">Service: ${escapeHtml(f.service || 'N/A')}</p>
            <p style="margin-top:8px;padding-left:10px;border-left:3px solid #eee;">${escapeHtml(f.notes || 'No notes provided.')}</p>
            <div class="muted" style="margin-top:8px;font-size:12px">Received: ${new Date(f.createdAt).toLocaleDateString()}</div>
          </div>
        `;
    }).join('');

  } catch (err) {
    console.error('loadCounsellorFeedback', err);
    container.innerHTML = '<div class="empty">Failed to load feedback.</div>';
  }
}

/* ---------- Report an Issue (Counsellor - UPDATED role) ---------- */
async function sendIssueAsCounsellor(uid) {
  try {
    const title = $('reportTitle').value.trim();
    const desc = $('reportDesc').value.trim();
    const priority = $('reportPriority').value;
    const category = $('reportCategory').value;
    if (!title || !desc) return alert('Please provide title and description');

    await addDoc(collection(db,'supportTickets'), {
      reporterId: uid,
      title,
      description: desc,
      priority,
      category,
      status: 'open',
      role: 'counsellor',
      createdAt: new Date().toISOString()
    });
    alert('Issue reported. Admin will review.');
    $('reportTitle').value = ''; $('reportDesc').value = '';
  } catch (err) { 
    console.error('report issue', err); 
    alert('Failed to send issue: ' + err.message); 
  }
}

/* ---------- Forgot password modal (remains same) ---------- */
async function requestPasswordResetModal(email) {
    try {
        if (!confirm(`Do you want to send a password reset link to your email: ${email}?`)) return;
        await sendPasswordResetEmail(auth, email);
        alert('Password reset email sent. Check your inbox.');
    } catch (err) {
        console.error('Password reset failed:', err);
        alert('Failed to send reset email. Ensure your email is correct and registered.');
    }
}


/* ---------- Helpers: Session Conflict Check (remains same) ---------- */
async function checkConflictForPerson(personId, desiredISO, durationMinutes = 60) {
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, 
      where('personId', '==', personId), 
      where('status', 'in', ['approved', 'pending', 'in-progress']) 
    );
    const snap = await getDocs(q);
    
    const desiredStart = new Date(desiredISO);
    const desiredEnd = new Date(desiredStart.getTime() + durationMinutes * 60 * 1000);
    
    for (const d of snap.docs) {
      const s = d.data();
      if (!s.datetime) continue;

      const existingStart = new Date(s.datetime);
      const existingDuration = Number(s.duration || durationMinutes);
      const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

      const isOverlapping = (desiredStart < existingEnd) && (desiredEnd > existingStart);
      
      if (isOverlapping) {
        console.log(`Conflict found with appointment ${d.id} from ${existingStart.toLocaleString()} to ${existingEnd.toLocaleString()}`);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('checkConflictForPerson', err);
    return false;
  }
}

/* findNextAvailable(personId, desiredISO) => returns ISO string or null (remains same) */
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

