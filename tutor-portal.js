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
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); 
}

/* ---------- Global state helpers ---------- */
const STATE = {
  uid: null,
  profile: null,
  availabilityCache: null,
  currentChats: {}, // in-memory minimal chat placeholders
  // Cache for sessions and requests to prevent redundant queries
  sessionsCache: [],
  requestsCache: [],
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

/* ---------- Init Portal (Ensure all click handlers are here) ---------- */
async function initPortal(uid) {
  // Menu wiring (FIXED IDs)
  // Ensure we check if the element exists before attaching the listener
  $('menuDashboard')?.onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); loadDashboard(uid); };
  $('menuSessions')?.onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadUpcomingSessions(uid); };
  $('menuIncoming')?.onclick = () => { setActiveMenu('menuIncoming'); showSection('incomingSection'); loadIncomingRequests(uid); };
  $('menuAvailability')?.onclick = () => { setActiveMenu('menuAvailability'); showSection('availabilitySection'); openAvailabilityEditor(uid); };
  $('menuChat')?.onclick = () => { setActiveMenu('menuChat'); showSection('chatSection'); openChatSelector(uid); };
  $('menuNotifications')?.onclick = () => { setActiveMenu('menuNotifications'); showSection('notificationsSection'); loadNotifications(uid); };
  $('menuRatings')?.onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadTutorRatings(uid); };
  $('menuReport')?.onclick = () => { setActiveMenu('menuReport'); showSection('reportSection'); };
  $('menuProfile')?.onclick = () => { setActiveMenu('menuProfile'); showSection('profileSection'); loadProfile(uid); };

  // Quick actions on dashboard (FIXED IDs)
  // Use the optional chaining operator (?.) for safety
  $('updateAvailabilityQuick')?.onclick = () => { setActiveMenu('menuAvailability'); showSection('availabilitySection'); openAvailabilityEditor(uid); };
  $('viewIncomingQuick')?.onclick = () => { setActiveMenu('menuIncoming'); showSection('incomingSection'); loadIncomingRequests(uid); };
  $('quickChatBtn')?.onclick = () => { setActiveMenu('menuChat'); showSection('chatSection'); openChatSelector(uid); };
  $('quickReportBtn')?.onclick = () => { setActiveMenu('menuReport'); showSection('reportSection'); };

  // Profile/Report wiring (FIXED IDs)
  $('saveProfileBtn')?.onclick = async () => { await saveProfile(uid); };
  $('resetPasswordBtn')?.onclick = async () => { await requestPasswordResetModal(auth.currentUser.email); };
  $('sendReportBtn')?.onclick = async () => { await sendIssueAsTutor(uid); };
  $('clearReportBtn')?.onclick = () => { $('reportTitle').value = ''; $('reportDesc').value = ''; };

  // Ratings wiring (FIXED IDs)
  $('ratingsFilterBtn')?.onclick = () => { loadTutorRatings(uid, $('ratingsFilter').value.trim() || ''); };
  
  // Logout
  $('logoutBtn')?.onclick = async () => { if (!confirm('Sign out?')) return; cleanupAllChatListeners(); await signOut(auth); window.location.href = 'index.html'; };


  // initial loads
  await loadProfile(uid);
  await loadDashboard(uid);
  // Real-time listener for notifications and pending counts
  setupRealTimeListeners(uid);

  // show dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');
}



/* ---------- Setup Real-time Listeners for Badges & Quick Stats ---------- */
function setupRealTimeListeners(uid) {
    // Listener for Incoming Requests (Pending)
    const qPending = query(collection(db,'sessions'), where('personId','==', uid), where('status','in',['pending', 'suggested']));
    onSnapshot(qPending, (snap) => {
        const count = snap.size;
        const badge = $('incomingBadge');
        if (badge) {
            badge.style.display = count > 0 ? 'inline-block' : 'none';
            badge.textContent = String(count);
        }
        const statPending = $('statPending'); 
        if (statPending) statPending.textContent = String(count);
        // If we are on the Incoming section, we should refresh it
        if (!$('incomingSection').classList.contains('hidden')) {
            loadIncomingRequests(uid);
        }
    }, (error) => console.error("Pending Listener Error:", error));

    // Listener for New Notifications (Placeholder: Reschedule, New Chat, etc.)
    const qNotifs = query(collection(db,'notifications'), where('userId','==', uid), where('read','==', false));
    onSnapshot(qNotifs, (snap) => {
        const count = snap.size;
        const badge = $('notifBadge');
        if (badge) {
            badge.style.display = count > 0 ? 'inline-block' : 'none';
            badge.textContent = String(count);
        }
        if (!$('notificationsSection').classList.contains('hidden')) {
            loadNotifications(uid);
        }
    }, (error) => console.error("Notification Listener Error:", error));
}


/* ---------- Section toggling (FIXED IDs) ---------- */
function showSection(idToShow) {
  const sections = ['dashboardSection','sessionsSection','incomingSection','availabilitySection','chatSection','notificationsSection','ratingsSection','reportSection','profileSection'];
  sections.forEach(s => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle('hidden', s !== idToShow);
  });
  cleanupAllChatListeners(); // Clean up listeners when leaving chat section
}

/* ---------- Profile for Tutor (FIXED Fields) ---------- */
// ... (loadProfile and saveProfile logic remains the same) ...
async function loadProfile(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const profile = snap.exists() ? snap.data() : null;
    STATE.profile = profile || {};
    if (profile) {
      $('profileEmail').textContent = profile.email || (auth.currentUser && auth.currentUser.email) || '';
      $('profileNameInput').value = profile.name || '';
      $('profileBioInput').value = profile.bio || '';
      $('profileModulesInput').value = profile.modules || '';
      $('profileDepartmentInput').value = profile.department || '';
      $('profileQualificationsInput').value = profile.qualifications || '';
      $('profilePictureInput').value = profile.profilePictureInput || '';
      $('profileLocationInput').value = profile.location || '';
      $('profileRateInput').value = profile.rate || '';
    } else {
      $('profileEmail').textContent = auth.currentUser ? auth.currentUser.email : '';
    }
  } catch (err) {
    console.error('loadProfile', err);
  }
}

async function saveProfile(uid) {
  try {
    const payload = {
      name: $('profileNameInput').value.trim(),
      bio: $('profileBioInput').value.trim(),
      modules: $('profileModulesInput').value.trim(),
      department: $('profileDepartmentInput').value.trim(),
      qualifications: $('profileQualificationsInput').value.trim(),
      profilePictureInput: $('profilePictureInput').value.trim(),
      location: $('profileLocationInput').value.trim(),
      rate: $('profileRateInput').value.trim(),
      role: STATE.profile?.role || 'tutor' 
    };
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    alert('Profile saved successfully.');
    await loadProfile(uid);
  } catch (err) {
    console.error('saveProfile', err);
    alert('Failed to save profile: ' + err.message);
  }
}

/* ---------- Dashboard: stats, quick actions, calendar summary (FIXED STATS) ---------- */
async function loadDashboard(uid) {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); 
    startOfWeek.setHours(0,0,0,0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const sessionsCol = collection(db, 'sessions');
    const qAll = query(sessionsCol, where('personId', '==', uid), orderBy('datetime', 'asc')); // Order by date for today's schedule
    const snapAll = await getDocs(qAll);
    const docs = snapAll.docs.map(d => ({ id: d.id, ...d.data() }));

    const stats = { totalThisWeek: 0, upcoming: 0, pendingRequests: 0, avgRating: '—', completedSessions: 0 };

    let todaySessions = [];
    docs.forEach(s => {
      const dt = s.datetime ? new Date(s.datetime) : null;
      if (s.status === 'completed' && dt && dt >= startOfWeek && dt < endOfWeek) stats.totalThisWeek++;
      if (s.status === 'approved' && dt && dt > now) stats.upcoming++;
      if (s.status === 'pending' || s.status === 'suggested') stats.pendingRequests++;
      if (s.status === 'completed') stats.completedSessions++;
      if (dt && dt.toDateString() === now.toDateString() && (s.status === 'approved' || s.status === 'in-progress')) {
          todaySessions.push(s);
      }
    });

    // avg rating
    const ratingsSnap = await getDocs(query(collection(db,'ratings'), where('personId','==', uid)));
    const ratings = ratingsSnap.docs.map(d => d.data());
    if (ratings.length) {
      stats.avgRating = (ratings.reduce((a,b) => a + (Number(b.stars)||0), 0) / ratings.length).toFixed(2);
    } 

    // Inject into dashboard cards (FIXED IDs)
    $('statThisWeek').textContent = stats.totalThisWeek;
    $('statUpcoming').textContent = stats.upcoming;
    $('statPending').textContent = stats.pendingRequests;
    $('statRating').textContent = stats.avgRating;
    
    // Today's schedule
    todaySessions.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    if (todaySessions.length) {
        $('todayList').innerHTML = todaySessions.slice(0, 3).map(s => 
          `<p style="margin-bottom:4px;">${new Date(s.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${escapeHtml(s.studentName)}</p>`
        ).join('');
        if (todaySessions.length > 3) {
            $('todayList').innerHTML += `<small class="muted">...and ${todaySessions.length - 3} more.</small>`;
        }
    } else {
        $('todayList').textContent = "No sessions today.";
    }
    
    // Notifications summary (using the real-time badge count)
    const notifCount = Number($('notifBadge').textContent || 0);
    $('dashNotifs').textContent = notifCount > 0 ? `${notifCount} new alerts in Notification Center.` : 'All clear.';

  } catch (err) {
    console.error('loadDashboard', err);
  }
}

/* ---------- Upcoming Sessions (Approved Bookings) (FIXED Rendering) ---------- */
async function loadUpcomingSessions(uid) {
    const container = $('sessionList'); 
    container.innerHTML = 'Loading approved sessions...';

    try {
        const now = new Date();
        const sessionsCol = collection(db, 'sessions');
        // Get approved sessions that start now or in the future
        const q = query(sessionsCol, 
            where('personId', '==', uid), 
            where('status', 'in', ['approved', 'in-progress']), 
            orderBy('datetime', 'asc') // Sort chronologically
        );
        const snap = await getDocs(q);
        const upcomingSessions = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => new Date(s.datetime) > now || s.status === 'in-progress');
        
        STATE.sessionsCache = upcomingSessions;

        if (upcomingSessions.length === 0) {
            container.innerHTML = `<div class="empty">No upcoming approved sessions.</div>`;
            return;
        }

        container.innerHTML = upcomingSessions.map(s => {
            const dt = new Date(s.datetime);
            const timeDiffMin = Math.round((dt - now) / (60 * 1000));
            
            let statusBadge = `<span class="badge">Upcoming</span>`;
            let isUrgent = false;
            let startAction = '';
            
            if (s.status === 'in-progress') {
                statusBadge = `<span class="badge" style="background:#007bff">In-Progress</span>`;
            } else if (dt.toDateString() === now.toDateString() && timeDiffMin <= 30 && timeDiffMin >= 0) {
                statusBadge = `<span class="badge" style="background:red">In ${timeDiffMin} minutes!</span>`;
                isUrgent = true;
            } else if (dt.toDateString() === now.toDateString()) {
                statusBadge = `<span class="badge" style="background:green">Today</span>`;
            }

            // Start Session Action
            if (s.mode === 'online' && timeDiffMin <= 10 && timeDiffMin >= -60 && s.status !== 'in-progress') {
                startAction = `<button class="btn start-session-btn" data-id="${s.id}">Start Session</button>`;
            } else if (s.status === 'in-progress') {
                startAction = `<button class="btn start-session-btn" data-id="${s.id}" disabled style="background:#007bff">Session Running</button>`;
            }

            return `
                <div class="profile-card ${isUrgent ? 'urgent' : ''}" style="margin-bottom:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <strong>${escapeHtml(s.studentName || 'Student')}</strong>
                            <div class="muted">${escapeHtml(s.module || s.course || '')}</div>
                        </div>
                        <div style="text-align:right">
                            ${statusBadge}
                        </div>
                    </div>
                    <div style="margin-top:8px">
                        Date & Time: <strong>${dt.toLocaleString()}</strong>
                        <br>Mode: <strong>${escapeHtml(s.mode)}</strong>
                    </div>
                    <div style="margin-top:8px">
                        <small>Request Message: <em>${escapeHtml(s.notes || 'No message.')}</em></small>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        ${startAction}
                        <button class="btn secondary mark-completed-btn" data-id="${s.id}">Mark as Completed</button>
                        <button class="btn secondary reschedule-btn" data-id="${s.id}">Request Reschedule</button>
                        <button class="btn secondary cancel-session-btn" data-id="${s.id}">Cancel Session</button>
                        <button class="btn secondary chat-btn" data-id="${s.studentId}" data-name="${escapeHtml(s.studentName)}">Chat</button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach action handlers
        container.querySelectorAll('.start-session-btn').forEach(b => b.onclick = () => handleStartSession(b.dataset.id));
        container.querySelectorAll('.mark-completed-btn').forEach(b => b.onclick = () => handleMarkCompleted(b.dataset.id));
        container.querySelectorAll('.reschedule-btn').forEach(b => b.onclick = () => openRescheduleRequestModal(b.dataset.id));
        container.querySelectorAll('.cancel-session-btn').forEach(b => b.onclick = () => handleCancelSession(b.dataset.id));
        container.querySelectorAll('.chat-btn').forEach(b => b.onclick = () => openChatWindow({ id: b.dataset.id, name: b.dataset.name, photo: '' }));

    } catch (err) {
        console.error('loadUpcomingSessions', err);
        container.innerHTML = `<div class="empty">Failed to load sessions.</div>`;
    }
}

/* ---------- Session Actions ---------- */

async function handleStartSession(sessionId) {
  try {
    const sRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sRef);
    if (!snap.exists()) return alert('Session not found');
    const s = snap.data();
    
    // check mode online and time window
    const now = new Date();
    const sessionTime = new Date(s.datetime);
    const timeDiffMin = Math.round((now - sessionTime) / (60 * 1000)); // Current time minus scheduled time
    
    if (s.mode !== 'online') {
      return alert('This session is not online. Start in-person sessions at the scheduled location.');
    }
    // Allow start 10 min early, up to 60 min late
    if (timeDiffMin < -10) {
        return alert('It is too early to start this session.');
    }
    if (timeDiffMin > 60) {
        return alert('Session time has passed. Please use "Request Reschedule" or "Mark as Completed" if it happened offline.');
    }

    // Set status to in-progress
    await updateDoc(sRef, { status: 'in-progress', startedAt: now.toISOString() });
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

async function handleMarkCompleted(sessionId) {
    if (!confirm('Mark this session as completed?')) return;
    try {
        await updateDoc(doc(db, 'sessions', sessionId), { 
            status: 'completed', 
            completedAt: new Date().toISOString()
        });
        alert('Session marked as completed.');
        await loadUpcomingSessions(STATE.uid);
        await loadDashboard(STATE.uid);
    } catch (err) {
        console.error('handleMarkCompleted', err);
        alert('Failed to mark session as completed: ' + err.message);
    }
}

function openRescheduleRequestModal(sessionId) {
    const newISO = prompt('Enter NEW suggested date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00');
    if (!newISO || isNaN(new Date(newISO))) return alert('Invalid date format/time.');
    
    const iso = new Date(newISO).toISOString();
    if (!confirm(`Confirm reschedule request to ${new Date(iso).toLocaleString()}? Student will be notified.`)) return;
    
    // Send reschedule request (same update logic as suggest time)
    updateDoc(doc(db, 'sessions', sessionId), { 
        status: 'rescheduleRequested', 
        suggestedTime: iso, 
        suggestedBy: 'tutor' 
    }).then(() => {
        alert('Reschedule request sent to student.');
        loadUpcomingSessions(STATE.uid);
    }).catch(err => {
        console.error('Reschedule failed', err);
        alert('Failed to send reschedule request: ' + err.message);
    });
}

async function handleCancelSession(sessionId) {
    if (!confirm('Are you sure you want to CANCEL this session? The student will be notified.')) return;
    try {
        await updateDoc(doc(db, 'sessions', sessionId), { 
            status: 'cancelled', 
            cancelledBy: 'tutor',
            cancelledAt: new Date().toISOString()
        });
        alert('Session cancelled.');
        await loadUpcomingSessions(STATE.uid);
    } catch (err) {
        console.error('handleCancelSession', err);
        alert('Failed to cancel session: ' + err.message);
    }
}

/* ---------- INCOMING REQUESTS (Pending requests) - for tutors to act on (FIXED IDs) ---------- */
async function loadIncomingRequests(uid) {
  const container = $('incomingList'); 
  const emptyEl = $('incomingEmpty'); 
  if (!container) return;
  container.innerHTML = 'Loading incoming requests...';
  hide('incomingEmpty');

  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('personId','==', uid), where('status','in',['pending', 'suggested']), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    STATE.requestsCache = requests;
    
    if (requests.length === 0) {
      container.innerHTML = '';
      show('incomingEmpty');
      emptyEl.textContent = 'No incoming requests.';
      return;
    }
    hide('incomingEmpty');
    
    container.innerHTML = ''; // clear
    requests.forEach(req => {
        let timeRequested = req.datetime ? new Date(req.datetime).toLocaleString() : '—';
        let suggestedTime = req.suggestedTime ? new Date(req.suggestedTime).toLocaleString() : null;

        let statusBadge = '';
        if (req.status === 'suggested' && req.suggestedBy === 'tutor') {
            statusBadge = `<span class="badge" style="background:#ff9800">Your Suggestion (Awaiting Student)</span>`;
        } else if (req.status === 'suggested' && req.suggestedBy === 'student') {
             statusBadge = `<span class="badge" style="background:#00bcd4">Student Reschedule Offer</span>`;
        } else {
             statusBadge = `<span class="badge" style="background:#ff7a00">Pending Your Approval</span>`;
        }

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
                            <strong>${escapeHtml(req.studentName || 'Student')}</strong>
                            <div class="muted">${escapeHtml(req.module || req.course || '')}</div>
                        </div>
                        <div class="muted">${new Date(req.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div style="margin-top:8px">Requested: <strong>${escapeHtml(timeRequested)}</strong> (${escapeHtml(req.mode||'—')})</div>
                    ${suggestedTime ? `<div style="margin-top:4px;color:orange">Suggested Time: <strong>${escapeHtml(suggestedTime)}</strong></div>` : ''}
                    <div style="margin-top:8px">${statusBadge}</div>
                    <div style="margin-top:8px" class="muted">Need Help With: ${escapeHtml(req.notes || '—')}</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn approve-req" data-req-id="${req.id}" data-time="${req.datetime}">Approve</button>
                <button class="btn secondary reject-req" data-req-id="${req.id}">Reject</button>
                <button class="btn secondary suggest-req" data-req-id="${req.id}">Suggest New Time</button>
                <button class="btn secondary chat-req" data-id="${req.studentId}" data-name="${escapeHtml(req.studentName)}">Chat Before Accepting</button>
            </div>
        `;
        container.appendChild(card);
        
        // Handlers for dynamic actions
        card.querySelector('.approve-req').onclick = async (ev) => {
            const reqId = ev.target.dataset.reqId;
            const requestedTime = ev.target.dataset.time;

            const conflict = await checkConflictForPerson(uid, requestedTime);
            if (conflict) {
                const suggested = await findNextAvailable(uid, requestedTime);
                if (suggested) {
                    if (confirm(`Conflict at requested time. Auto-suggest closest available slot: ${new Date(suggested).toLocaleString()} instead?`)) {
                        // Auto-suggest closest: Update session with suggested
                        await updateDoc(doc(db,'sessions',reqId), { suggestedTime: suggested, suggestedBy: 'tutor', status: 'suggested' });
                        alert('Conflict detected. Suggested time sent to student.');
                    } else {
                        return; // Stop if tutor doesn't want to suggest or approve anyway
                    }
                } else {
                    if (!confirm('You are unavailable and no next available slot was found. Approve anyway (overriding conflict)?')) {
                        return;
                    }
                }
            }
            // Approve: set status approved (only if no conflict, or if conflict override confirmed)
            if (!conflict || confirm('Proceeding with approval despite conflict.')) {
                await updateDoc(doc(db,'sessions',reqId), { status: 'approved', approvedAt: new Date().toISOString(), suggestedTime: null });
                alert('Request approved.');
            }
            await loadIncomingRequests(uid);
        };
        
        card.querySelector('.reject-req').onclick = async (ev) => {
          if (!confirm('Reject this request?')) return;
          await updateDoc(doc(db,'sessions',ev.target.dataset.reqId), { status: 'rejected', rejectedAt: new Date().toISOString() });
          alert('Request rejected.');
          await loadIncomingRequests(uid);
        };
        
        card.querySelector('.suggest-req').onclick = async (ev) => {
          const newISO = prompt('Enter suggested date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00');
          if (!newISO || isNaN(new Date(newISO))) return alert('Invalid date');
          const iso = new Date(newISO).toISOString();
          await updateDoc(doc(db,'sessions',ev.target.dataset.reqId), { suggestedTime: iso, suggestedBy: 'tutor', status: 'suggested' });
          alert('Suggested time sent to student.');
          await loadIncomingRequests(uid);
        };

        card.querySelector('.chat-req').onclick = (ev) => {
          openChatWindow({ id: ev.target.dataset.id, name: ev.target.dataset.name, photo: '' });
        };
    });

  } catch (err) {
    console.error('loadIncomingRequests', err);
    container.innerHTML = `<div class="empty">Failed to load incoming requests</div>`;
  }
}

/* ---------- Manage Availability (FIXED to use inline editor) ---------- */
// ... (openAvailabilityEditor logic remains the same) ...
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
      await setDoc(doc(db,'users',uid), { availability: STATE.availabilityCache, available: true }, { merge: true });
      alert('Availability saved. You are now available for bookings.');
      loadProfile(uid); 
    } catch (err) { alert('Failed to save availability: ' + err.message); }
  };
  $('toggleAvailableNowBtn').onclick = async () => {
    const current = !!profile.availableNow;
    const newVal = !current;
    await setDoc(doc(db,'users',uid), { availableNow: newVal, available: true }, { merge: true }); // Ensure main 'available' is true
    alert(`Available Now set to ${newVal ? 'ON' : 'OFF'}`);
    loadProfile(uid); 
  };
  $('offlineModeBtn').onclick = async () => {
    if (!confirm('Go offline? This will mark you unavailable for new bookings.')) return;
    await setDoc(doc(db,'users',uid), { available: false, availableNow: false }, { merge: true });
    alert('You are now offline.');
    loadProfile(uid);
  };
  
  // Presets handling
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


/* ---------- Chat UI (FIXED to use real-time listeners) ---------- */
function chatIdFor(a,b) { return [a,b].sort().join('__'); }

// ... (openChatSelector logic remains the same) ...
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
      const sessionsSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), orderBy('createdAt','desc'), limit(50)));
      const students = {};
      sessionsSnap.forEach(d => {
        const s = d.data();
        // Only include students from approved/completed/in-progress sessions
        if (s.studentId && (s.status === 'approved' || s.status === 'completed' || s.status === 'in-progress')) {
             students[s.studentId] = { id: s.studentId, name: s.studentName, photo: s.studentPhoto };
        }
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

// ... (openChatWindow logic remains the same, assuming 'chats' collection stores messages) ...
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
        <h3>Chat with ${escapeHtml(userObj.name || 'Student')}</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div id="chatMessages" style="height:320px;overflow:auto;padding:6px;border:1px solid #eee;border-radius:8px;background:#fff"></div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="chatInput" placeholder="Write a message..." style="flex:1;padding:8px;border-radius:6px;border:1px solid #ccc" />
            <button class="btn" id="chatSend">Send</button>
            <button class="btn secondary" id="chatClose">Close</button>
          </div>
        </div>
        <div style="margin-top:10px; display:flex; gap:8px;">
            <button class="btn secondary chat-tool" data-tool="material">Send Learning Materials</button>
            <button class="btn secondary chat-tool" data-tool="test">Send Practice Test</button>
            <button class="btn secondary chat-tool" data-tool="link">Send Resource Link</button>
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
        await addDoc(collection(db,'chats'), {
          chatId, from: myId, to: theirId, text: txt, type: 'text', createdAt: new Date().toISOString()
        });
        inputEl.value = '';
      } catch (err) {
        console.error('send chat', err);
        alert('Failed to send message: ' + err.message);
      }
    };
    
    // Tutor Tools Logic
    modal.querySelectorAll('.chat-tool').forEach(button => {
        button.onclick = async (ev) => {
            const tool = ev.target.dataset.tool;
            let promptText = '';
            let type = '';
            if (tool === 'material') { promptText = 'Enter a description and link for the material:'; type = 'material'; }
            else if (tool === 'test') { promptText = 'Enter a description and link for the practice test:'; type = 'test'; }
            else if (tool === 'link') { promptText = 'Enter a description and URL for the resource link:'; type = 'resource'; }
            
            const content = prompt(promptText);
            if (!content) return;
            
            try {
                await addDoc(collection(db,'chats'), {
                    chatId, from: myId, to: theirId, text: content, type: type, createdAt: new Date().toISOString()
                });
            } catch (err) {
                console.error('send tool message', err);
                alert('Failed to send tool message: ' + err.message);
            }
        };
    });


    function renderMessages(snap) {
      if (!snap) return; 
      try {
        const msgs = snap.docs.map(d=>({ id: d.id, ...d.data() }));
        messagesEl.innerHTML = msgs.map(m => {
            let content = escapeHtml(m.text);
            let bgColor = m.from === myId ? '#ff7a00' : '#f0f0f0';
            let textColor = m.from === myId ? '#fff' : '#333';

            if (m.type !== 'text') {
                bgColor = '#fff3e0'; // Light orange for tool messages
                textColor = '#ff7a00';
                if (m.type === 'material') content = `📚 **Learning Material:** ${content}`;
                else if (m.type === 'test') content = `📝 **Practice Test:** ${content}`;
                else if (m.type === 'resource') content = `🔗 **Resource Link:** ${content}`;
            }

            return `
              <div style="margin-bottom:6px;display:flex;flex-direction:column;align-items:${m.from===myId?'flex-end':'flex-start'}">
                <div style="background:${bgColor};color:${textColor};padding:8px;border-radius:8px;max-width:80%">
                    ${content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}
                </div>
                <div class="muted" style="font-size:11px;margin-top:4px">${new Date(m.createdAt).toLocaleTimeString()}</div>
              </div>
            `;
        }).join('');
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

/* ---------- Notifications Center (FIXED Rendering) ---------- */
async function loadNotifications(uid) {
    const container = $('notificationsList');
    container.innerHTML = 'Loading notifications...';

    try {
        const notifsCol = collection(db, 'notifications');
        const q = query(notifsCol, where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(50));
        const snap = await getDocs(q);
        const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (notifications.length === 0) {
            container.innerHTML = `<div class="empty">No notifications.</div>`;
            return;
        }

        container.innerHTML = notifications.map(n => {
            const isUnread = n.read === false;
            let icon = '🔔';
            if (n.type === 'new_request') icon = '📨';
            if (n.type === 'approved' || n.type === 'rejected') icon = '✅';
            if (n.type === 'starting_soon') icon = '⏱️';
            if (n.type === 'chat_message') icon = '💬';

            return `
                <div class="profile-card" style="margin-bottom:8px; ${isUnread ? 'background:#fff3e0;' : ''}" data-id="${n.id}">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <span style="font-size:1.5em">${icon}</span>
                        <div style="flex:1;">
                            <strong>${escapeHtml(n.title)}</strong> 
                            <span class="badge" style="background:${isUnread ? '#d73a3a' : '#ddd'};color:${isUnread ? '#fff' : '#333'}">${isUnread ? 'NEW' : 'Read'}</span>
                            <div class="muted">${escapeHtml(n.message)}</div>
                        </div>
                        <div class="muted" style="white-space:nowrap">${new Date(n.createdAt).toLocaleTimeString()}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Mark as read on click
        container.querySelectorAll('.profile-card').forEach(card => {
            card.onclick = () => {
                if (card.style.background === '#fff3e0') {
                    updateDoc(doc(db, 'notifications', card.dataset.id), { read: true });
                    loadNotifications(uid); // Re-render
                }
            };
        });

    } catch (err) {
        console.error('loadNotifications', err);
        container.innerHTML = `<div class="empty">Failed to load notifications.</div>`;
    }
}


/* ---------- Ratings & Feedback (FIXED Rendering) ---------- */
async function loadTutorRatings(uid, filter = '') {
    const container = $('ratingsList');
    const emptyEl = $('ratingsEmpty');
    container.innerHTML = 'Loading ratings...';
    hide('ratingsEmpty');

    try {
        const ratingsCol = collection(db, 'ratings');
        let q = query(ratingsCol, where('personId', '==', uid), orderBy('createdAt', 'desc'));

        if (filter.includes('star')) {
            const starMatch = filter.match(/(\d)-star/);
            if (starMatch) {
                const stars = Number(starMatch[1]);
                q = query(ratingsCol, where('personId', '==', uid), where('stars', '==', stars), orderBy('createdAt', 'desc'));
            }
        }
        // Basic filter for now; more complex filters would be database-side

        const snap = await getDocs(q);
        const ratings = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (ratings.length === 0) {
            container.innerHTML = '';
            emptyEl.textContent = filter ? `No ratings match the filter: "${filter}".` : 'No ratings yet.';
            show('ratingsEmpty');
            return;
        }

        hide('ratingsEmpty');
        
        container.innerHTML = `
            <div style="margin-bottom:12px">
                Overall Average: <strong>${$('statRating').textContent} / 5.0</strong> (${ratings.length} reviews)
            </div>
            ${ratings.map(r => {
                const sessionDate = r.sessionId ? `Session: ${r.sessionDate || 'Unknown Date'}` : '';
                const starRating = '⭐'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
                const replyButton = r.tutorReply ? `<button class="btn secondary reply-rating-btn" disabled>Replied</button>` : `<button class="btn secondary reply-rating-btn" data-id="${r.id}">Respond to Feedback</button>`;
                
                return `
                    <div class="profile-card" style="margin-bottom:12px; border-left: 4px solid ${r.stars >= 4 ? 'green' : r.stars <= 2 ? 'red' : 'orange'}; padding-left:10px;">
                        <div>
                            <strong>${starRating}</strong> from ${escapeHtml(r.studentName || 'Student')}
                            <div class="muted">${sessionDate} | ${new Date(r.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div style="margin-top:8px; padding:8px; background:#f9f9f9; border-radius:6px;">
                            "${escapeHtml(r.feedback)}"
                        </div>
                        ${r.tutorReply ? `<div style="margin-top:8px; padding:8px; background:#e0f7fa; border-left:2px solid #00bcd4; border-radius:6px;"><small>Your Reply:</small> <br><em>${escapeHtml(r.tutorReply)}</em></div>` : ''}
                        <div style="margin-top:8px">${replyButton}</div>
                    </div>
                `;
            }).join('')}
        `;

        // Attach Reply Handler
        container.querySelectorAll('.reply-rating-btn').forEach(b => {
            if (!b.disabled) {
                b.onclick = () => openRatingReplyModal(b.dataset.id, uid);
            }
        });

    } catch (err) {
        console.error('loadTutorRatings', err);
        container.innerHTML = `<div class="empty">Failed to load ratings.</div>`;
    }
}

function openRatingReplyModal(ratingId, uid) {
    const reply = prompt('Enter your response to this student feedback (optional reply):');
    if (reply === null) return; // Cancelled
    if (reply.trim() === '') return alert('Reply cannot be empty.');
    
    updateDoc(doc(db, 'ratings', ratingId), { 
        tutorReply: reply.trim(), 
        repliedAt: new Date().toISOString()
    }).then(() => {
        alert('Response sent.');
        loadTutorRatings(uid, $('ratingsFilter').value.trim() || ''); // Re-load
    }).catch(err => {
        console.error('Reply failed', err);
        alert('Failed to send reply: ' + err.message);
    });
}

/* ---------- Report an Issue (Tutor - FIXED ID) ---------- */
// ... (sendIssueAsTutor logic remains the same) ...
async function sendIssueAsTutor(uid) {
  try {
    const title = $('reportTitle').value.trim();
    const desc = $('reportDesc').value.trim();
    const priority = $('reportPriority').value;
    const category = $('reportCategory').value;
    if (!title || !desc) return alert('Please provide title and description');

    await addDoc(collection(db,'issues'), {
      reporterId: uid,
      title,
      description: desc,
      priority,
      category,
      status: 'open',
      role: 'tutor', 
      createdAt: new Date().toISOString()
    });
    alert('Issue reported. Admin will review.');
    $('reportTitle').value = ''; $('reportDesc').value = '';
    $('reportPriority').value = 'Normal';
    $('reportCategory').value = 'Technical';
  } catch (err) { 
    console.error('report issue', err); 
    alert('Failed to send issue: ' + err.message); 
  }
}

/* ---------- Forgot password modal (REMOVED custom OTP logic, using Firebase built-in) ---------- */
// ... (requestPasswordResetModal logic remains the same) ...
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


/* ---------- Helpers: Session Conflict Check (REFINED Logic) ---------- */
async function checkConflictForPerson(personId, desiredISO, durationMinutes = 60) {
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, 
      where('personId', '==', personId), 
      where('status', 'in', ['approved', 'pending', 'in-progress', 'rescheduleRequested', 'suggested']) 
    );
    const snap = await getDocs(q);
    
    const desiredStart = new Date(desiredISO);
    const desiredEnd = new Date(desiredStart.getTime() + durationMinutes * 60 * 1000);
    
    for (const d of snap.docs) {
      const s = d.data();
      let sessionStart = s.datetime ? new Date(s.datetime) : null;
      
      // Use the suggested time if the session is currently in a 'suggested' state
      if (s.status === 'suggested' && s.suggestedTime) {
          sessionStart = new Date(s.suggestedTime);
      }
      
      if (!sessionStart) continue;

      const existingDuration = Number(s.duration || durationMinutes);
      const existingEnd = new Date(sessionStart.getTime() + existingDuration * 60 * 1000);

      // Overlap occurs if (StartA < EndB) AND (EndA > StartB)
      const isOverlapping = (desiredStart < existingEnd) && (desiredEnd > sessionStart);
      
      if (isOverlapping) {
        console.log(`Conflict found with session ${d.id} from ${sessionStart.toLocaleString()} to ${existingEnd.toLocaleString()}`);
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
      // Only check against approved, in-progress, or already suggested/pending sessions
      const conflict = await checkConflictForPerson(personId, iso); 
      if (!conflict) return iso;
    }
    return null;
  } catch (err) {
    console.error('findNextAvailable', err);
    return null;
  }
}

// Ensure the functions are exported so the main HTML script can use them
export { openChatSelector };


