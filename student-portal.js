import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* ---------- small DOM helpers ---------- */
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if(el) el.classList.remove('hidden'); };
const hide = id => { const el = $(id); if(el) el.classList.add('hidden'); };
const setActiveMenu = (id) => {
  document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
  const el = $(id); if(el) el.classList.add('active');
};
// *** FIX 1: INSERT ESCAPE HTML FUNCTION HERE ***
function escapeHtml(s) { 
  if (s === undefined || s === null) return ''; 
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&quot;',"'":'&#39;'}[c])); 
}


let CURRENT_USER_ID = null;
let currentChatContact = null;
let unsubscribeChat = null;

/* * 🚨 PRODUCTION READY SIMULATION 🚨
 * This function simulates calling a secure Firebase Cloud Function.
 * In a real environment, all critical mutations (bookings, cancellations) 
 * MUST be handled by a function on the server (Cloud Function) to enforce 
 * security rules and business logic (like conflict checks) securely.
 * Here, we perform the necessary Firestore operations but wrap them to 
 * represent the secure server call.
 */
async function callServerFunction(name, payload) {
    console.log(`[Server Call] Executing secure function: ${name}`, payload);
    const uid = CURRENT_USER_ID;

    // --- SECURE BOOKING/UPDATE LOGIC (MODIFIED FOR MULTI-SLOT) ---
    if (name === 'requestSession') {
        const { role, person, preferredSlots, mode, note } = payload;
        
        // 1. **Server-Side Session Creation:**
        // Instead of a single 'datetime', we store the student's 'preferredSlots'.
        // The 'datetime' remains null until the tutor picks one from the bucket.
        const sessionsCol = collection(db, 'sessions');
        const sessionObj = {
            role, 
            personId: person.id || '', 
            tutorId: role === 'tutor' ? person.id : '',
            counsellorId: role === 'counsellor' ? person.id : '', 
            studentId: uid,
            personName: person.name || '', 
            preferredSlots: preferredSlots, // The array of 3-5 ISO strings
            datetime: null,                 // Initially null
            venue: '',                      // Initially empty
            mode: mode || 'online',
            status: 'pending', 
            notes: note || '', 
            createdAt: new Date().toISOString()
        };
        
        const docRef = await addDoc(sessionsCol, sessionObj);
        return { sessionId: docRef.id }; 
    }


    // --- SECURE CANCELLATION/UPDATE LOGIC ---
    if (name === 'updateSessionStatus' || name === 'updateSessionDetails') {
        const { sessionId, status, datetime, mode, notes } = payload;
        const sessionRef = doc(db, 'sessions', sessionId);
        const updateData = {};
        if (status) updateData.status = status;
        if (datetime) updateData.datetime = datetime;
        if (mode) updateData.mode = mode;
        if (notes !== undefined) updateData.notes = notes;

        // In a real function, you'd check:
        // 1. Does the session exist? 
        // 2. Is the current user the studentId of this session? (Security Rule check)
        
        await updateDoc(sessionRef, updateData);
        return true;
    }

    // --- SECURE RATING SUBMISSION ---
     if (name === 'submitRating') {
        const { personId, personName, role, stars, comment } = payload;
        const ratingsCol = collection(db, 'ratings');
        const ratingPayload = {
            studentId: uid, personId, personName, role, stars: Number(stars) || 0,
            comment: comment || '', createdAt: new Date().toISOString()
        };
        await addDoc(ratingsCol, ratingPayload);
        return true;
    }
    
    // --- SECURE SUPPORT TICKET SUBMISSION ---
    if (name === 'submitSupportTicket') {
        const { title, message, priority } = payload;
         await addDoc(collection(db, 'supportTickets'), {
            studentId: uid, title, message, priority,
            createdAt: new Date().toISOString(), status: 'open'
        });
        return true;
    }

    // --- SECURE PROFILE UPDATE ---
     if (name === 'updateProfile') {
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, payload, { merge: true });
        return true;
    }

    throw new Error(`Server function "${name}" not found.`);
}



/* ---------- Auth init ---------- */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  CURRENT_USER_ID = user.uid;
  await initPortal(user.uid);
});

/* ---------- Init Portal ---------- */
async function initPortal(uid) {
  // menu wiring
  $('menuDashboard').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); };
  $('menuSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadSessionsList(uid); };
  $('menuBookTutor').onclick = () => { setActiveMenu('menuBookTutor'); openSearchAndBook('tutor'); };
  $('menuBookCounsellor').onclick = () => { setActiveMenu('menuBookCounsellor'); openSearchAndBook('counsellor'); };
  $('menuProfile').onclick = () => { setActiveMenu('menuProfile'); showSection('profileSection'); loadProfile(uid); };
  $('menuSupport').onclick = () => { setActiveMenu('menuSupport'); showSection('supportSection'); };
  $('menuNotifications').onclick = () => { setActiveMenu('menuNotifications'); showSection('notificationsSection'); loadNotifications(uid); };
  $('menuPending').onclick = () => { setActiveMenu('menuPending'); showSection('pendingSection'); loadPendingRequests(uid); };
  $('menuRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadRatingsList(uid); };
  $('menuChat').onclick = () => { setActiveMenu('menuChat'); showSection('chatSection'); loadChatContacts(uid); }; // New Chat Menu
  // In initPortal or initial load area:
// Initial state: Chat controls disabled until a contact is selected
$('messageInput').disabled = true;
$('sendMessageBtn').disabled = true;
$('fileUploadBtn').disabled = true;

  
  $('menuLogout').onclick = async () => {
    try {
      if (confirm('Are you sure you want to log out?')) {
        await signOut(auth);
        // The onAuthStateChanged listener at the top will redirect to index.html
      }
    } catch (error) {
      console.error('Logout error:', error);
      alert('Logout failed: ' + error.message);
    }
  };
  
  // dashboard quick actions
  $('openProfile').onclick = () => { setActiveMenu('menuProfile'); showSection('profileSection'); loadProfile(uid); };
  $('openTutorSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadSessionsList(uid, 'tutor'); };
  $('openCounsellorSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadSessionsList(uid, 'counsellor'); };
  $('bookTutorQuick').onclick = () => openSearchAndBook('tutor');
  $('bookCounsellorQuick').onclick = () => openSearchAndBook('counsellor');
  $('gotoTutorList').onclick = () => openSearchAndBook('tutor');
  $('gotoCounsellorList').onclick = () => openSearchAndBook('counsellor');
  $('openPendingRequests').onclick = () => { setActiveMenu('menuPending'); showSection('pendingSection'); loadPendingRequests(uid); };
  $('gotoPending').onclick = () => { setActiveMenu('menuPending'); showSection('pendingSection'); loadPendingRequests(uid); };
  $('openRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadRatingsList(uid); };
  $('gotoRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadRatingsList(uid); };
 
  // search handlers
  $('quickSearchBtn').onclick = () => { openSearchAndBook('', $('quickSearch').value.trim()); };
  $('searchBtn').onclick = () => { const v = $('searchInput').value.trim(); const role = $('filterRole').value; openSearchAndBook(role, v); };
  $('searchBackBtn').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); };
  $('ratingsSearchBtn').onclick = () => { loadRatingsList(uid, $('ratingsFilterRole').value, $('ratingsSearch').value.trim()); };

  // profile save
  $('saveProfileBtn').onclick = async () => { await saveProfile(uid); };

  // support
  $('sendSupportBtn').onclick = async () => { await sendSupport(uid); };

  // chat
  $('sendMessageBtn').onclick = () => sendMessage(uid);
  $('messageInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage(uid);
  });
  // Simulate file/link logic (Feature 6)
  $('fileUploadBtn').onclick = () => alert("File/Document/Link upload workflow initiated (not fully implemented in client-side demo).");


  // profile save
  $('saveProfileBtn').onclick = async () => { await saveProfile(uid); };

  // 🚨 NEW PASSWORD RESET WIRING 🚨
  $('resetPasswordBtn').onclick = async () => {
    try {
      const email = auth.currentUser ? auth.currentUser.email : '';
      if (!email) {
        alert('Could not find your email address.');
        return;
      }
      
      if (confirm(`A password reset link will be sent to your email: ${email}. Continue?`)) {
        await sendPasswordResetEmail(auth, email);
        alert('Password reset email sent! Check your inbox (and spam folder) to continue.');
      }

    } catch (error) {
      console.error('Password Reset Error:', error);
      alert('Failed to send reset email: ' + error.message);
    }
  };

  // support
  $('sendSupportBtn').onclick = async () => { await sendSupport(uid); };

 

  // initial loads
  await loadProfile(uid);
  await loadSessionSummaries(uid);
  await updateNotifBadge(uid);
  await loadPendingRequests(uid); 
  await loadUserRatingsCount(uid);

  // show dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');
}


/* ---------- Section toggling ---------- */
function showSection(idToShow) {
  const sections = ['dashboardSection','searchSection','sessionsSection','profileSection','supportSection','notificationsSection','pendingSection', 'chatSection', 'ratingsSection'];
  sections.forEach(s => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle('hidden', s !== idToShow);
  });
}

/* ---------- Profile ---------- */
async function loadProfile(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const profile = snap.exists() ? snap.data() : null;
    if (profile) {
      $('profileEmail').textContent = profile.email || (auth.currentUser && auth.currentUser.email) || '';
      $('profileNameInput').value = profile.name || '';
      $('profileYearInput').value = profile.year || '';
      $('profileDepartmentInput').value = profile.department || '';
      $('profileCourseInput').value = profile.course || '';
      $('profilePictureInput').value = profile.profilePic || '';
      // dashboard summary
      $('summaryName').textContent = profile.name || '—';
      $('summaryYear').textContent = profile.year || '—';
      $('summaryDepartment').textContent = profile.department || '—';
      $('summaryCourse').textContent = profile.course || '—';
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
      year: $('profileYearInput').value,
      department: $('profileDepartmentInput').value.trim(),
      course: $('profileCourseInput').value.trim(),
      profilePic: $('profilePictureInput').value.trim()
    };
    // 🚨 Production Change: Call secure server function for mutation
    await callServerFunction('updateProfile', payload); 

    alert('Profile saved successfully.');
    await loadProfile(uid);
  } catch (err) {
    console.error(err);
    alert('Failed to save profile: ' + err.message);
  }
}

/* ---------- Load count of ratings submitted by this student ---------- */
async function loadUserRatingsCount(uid) {
  try {
    const ratingsCol = collection(db, 'ratings');
    // 🚨 Security Note: This query must be secured by Firestore Rules!
    const q = query(ratingsCol, where('studentId','==',uid));
    const snap = await getDocs(q);
    const count = snap.size || 0;
    const el = $('ratingsCount');
    if (el) el.textContent = String(count);
  } catch (err) {
    console.error('loadUserRatingsCount', err);
  }
}


/* ---------- Notifications ---------- */
async function updateNotifBadge(uid) {
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('studentId', '==', uid), where('status', 'in', ['approved','pending']));
    const snap = await getDocs(q);
    const count = snap.size;
    const badge = $('notifBadge');
    if (!badge) return;
    if (count > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = count;
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('updateNotifBadge', err);
  }
}
async function loadNotifications(uid) {
  try {
    const list = [];
    const sessionsCol = collection(db, 'sessions');
    const snap = await getDocs(query(sessionsCol, where('studentId','==',uid), orderBy('createdAt','desc'), limit(20)));
    snap.forEach(d => {
      const s = d.data();
      list.push(`${s.status || 'update'}: ${s.personName || '—'} at ${new Date(s.datetime || s.createdAt).toLocaleString()}`);
    });
    $('notificationsList').innerHTML = list.length ? `<ul>${list.map(x=>`<li>${x}</li>`).join('')}</ul>` : '<div class="empty">No notifications</div>';
  } catch (err) {
    console.error('loadNotifications', err);
    $('notificationsList').innerHTML = '<div class="empty">Failed to load notifications</div>';
  }
}

/* ---------- Pending requests ---------- */
async function loadPendingRequests(uid) {
  const container = $('pendingList');
  const emptyEl = $('pendingEmpty');
  container.innerHTML = 'Loading pending requests...';
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('studentId','==',uid), where('status','==','pending'), orderBy('datetime','asc'));
    const snap = await getDocs(q);
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updatePendingUICounts(sessions.length);

    if (sessions.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    const rows = sessions.map(s => {
      const datetime = s.datetime ? new Date(s.datetime).toLocaleString() : '—';
      return `<tr data-id="${s.id}" data-notes="${escapeHtml(s.notes||'')}" data-mode="${escapeHtml(s.mode||'online')}" data-date="${s.datetime||''}">
        <td>${escapeHtml(s.personName || '—')}</td>
        <td>${escapeHtml(datetime)}</td>
        <td>${escapeHtml(s.role || '—')}</td>
        <td>${escapeHtml(s.mode || '—')}</td>
        <td>
          <button class="cancel-pending btn secondary">Cancel</button>
          <button class="update-pending btn">Update</button>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `<table><thead><tr><th>Person</th><th>Date & Time</th><th>Role</th><th>Mode</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;

    // attach handlers
    container.querySelectorAll('.cancel-pending').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        if (!confirm('Cancel this pending request?')) return;
        try {
          // 🚨 Production Change: Use secure server function for mutation
          await callServerFunction('updateSessionStatus', { sessionId: id, status: 'cancelled' });
          await loadPendingRequests(uid);
          await loadSessionSummaries(uid);
          await updateNotifBadge(uid);
        } catch (err) { console.error(err); alert('Failed to cancel: ' + err.message); }
      });
    });

    container.querySelectorAll('.update-pending').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        const id = tr.dataset.id;
        // Prompt for rescheduling and update details
        const newISO = prompt('Enter new date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00', tr.dataset.date.substring(0, 16));
        if (!newISO) return;
        if (isNaN(new Date(newISO))) { alert('Invalid date'); return; }
        const newMode = prompt('Enter new mode (online / in-person)', tr.dataset.mode);
        if (!newMode) return;
        const newNotes = prompt('Update notes (optional)', tr.dataset.notes) || '';
        try {
          // 🚨 Production Change: Use secure server function for mutation
          await callServerFunction('updateSessionDetails', { sessionId: id, datetime: new Date(newISO).toISOString(), mode: newMode, notes: newNotes });
          alert('Request updated.');
          await loadPendingRequests(uid);
          await loadSessionSummaries(uid);
        } catch (err) { console.error(err); alert('Failed to update: ' + err.message); }
      });
    });

  } catch (err) {
    console.error('loadPendingRequests', err);
    container.innerHTML = `<div class="empty">Failed to load pending requests</div>`;
  }
}

/* helper to update pending count UI on dashboard and sidebar badge */
function updatePendingUICounts(count) {
  const badge = $('pendingBadge');
  const pendingCountText = $('pendingCount');
  if (badge) {
    if (count > 0) { badge.style.display = 'inline-block'; badge.textContent = count; }
    else { badge.style.display = 'none'; }
  }
  if (pendingCountText) pendingCountText.textContent = count;
}

/* ---------- Session summaries & list ---------- */
async function loadSessionSummaries(uid) {
  try {
    const sessionsCol = collection(db, 'sessions');
    const qTutor = query(sessionsCol, where('studentId','==', uid), where('role','==','tutor'), where('status','==','approved'), orderBy('datetime','asc'), limit(1));
    const qCoun = query(sessionsCol, where('studentId','==', uid), where('role','==','counsellor'), where('status','==','approved'), orderBy('datetime','asc'), limit(1));
    
    // Fetch nearest future session
    const filterFuture = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => new Date(s.datetime) >= new Date());

    const [stSnap, scSnap] = await Promise.all([getDocs(qTutor), getDocs(qCoun)]);
    const tutorSessions = filterFuture(stSnap);
    const counSessions = filterFuture(scSnap);
    
    if (tutorSessions.length === 0) $('tutorSessionSummary').textContent = 'No upcoming tutor sessions.'; else {
      const s = tutorSessions[0];
      $('tutorSessionSummary').textContent = `${s.personName} — ${new Date(s.datetime).toLocaleString()} (${s.mode||'—'})`;
    }
    if (counSessions.length === 0) $('counsellorSessionSummary').textContent = 'No upcoming counsellor sessions.'; else {
      const s = counSessions[0];
      $('counsellorSessionSummary').textContent = `${s.personName} — ${new Date(s.datetime).toLocaleString()} (${s.mode||'—'})`;
    }
  } catch (err) {
    console.error('loadSessionSummaries', err);
  }
}

async function loadSessionsList(uid, filterRole = null) {
  const container = $('sessionList');
  container.innerHTML = 'Loading sessions...';
  try {
    const sessionsCol = collection(db, 'sessions');
    let q;
    if (filterRole) q = query(sessionsCol, where('studentId','==',uid), where('status','==','approved'), where('role','==',filterRole), orderBy('datetime','asc'));
    else q = query(sessionsCol, where('studentId','==',uid), where('status','==','approved'), orderBy('datetime','asc'));
    const snap = await getDocs(q);
    const sessions = snap.docs.map(d=>({ id:d.id, ...d.data() }));

    // Filter out past sessions
    const upcomingSessions = sessions.filter(s => new Date(s.datetime) >= new Date());

    if (upcomingSessions.length === 0) {
      container.innerHTML = '<div class="empty">No upcoming sessions found.</div>';
      return;
    }
    const rows = upcomingSessions.map(s => {
      const datetime = new Date(s.datetime).toLocaleString();
      // Visual cue for mode
      const modeClass = s.mode === 'online' ? 'session-online' : 'session-inperson';
      return `<tr data-id="${s.id}" data-date="${s.datetime||''}" data-mode="${escapeHtml(s.mode||'online')}">
        <td>${escapeHtml(s.personName||'—')}</td><td>${escapeHtml(datetime)}</td><td class="${modeClass}">${escapeHtml(s.mode||'—')}</td>
        <td>
          <button class="cancel-btn btn secondary">Cancel</button>
          <button class="update-btn btn">Update</button>
        </td></tr>`;
    }).join('');
    container.innerHTML = `<table><thead><tr><th>Person</th><th>Date & Time</th><th>Mode</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
    
    // Cancel action
    container.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        if (!confirm('Cancel this session?')) return;
        try {
           // 🚨 Production Change: Use secure server function for mutation
          await callServerFunction('updateSessionStatus', { sessionId: id, status: 'cancelled' });
          alert('Session cancelled.');
          await loadSessionsList(uid, filterRole);
          await loadSessionSummaries(uid);
        } catch (err) { console.error(err); alert('Failed to cancel: '+err.message); }
      });
    });

    // Update action (reschedule/mode)
    container.querySelectorAll('.update-btn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        const id = tr.dataset.id;
        const newISO = prompt('Enter new date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00', tr.dataset.date.substring(0, 16));
        if (!newISO) return;
        if (isNaN(new Date(newISO))) { alert('Invalid date'); return; }
        const newMode = prompt('Enter new mode (online / in-person)', tr.dataset.mode);
        if (!newMode) return;
        try {
          // 🚨 Production Change: Use secure server function for mutation
          await callServerFunction('updateSessionDetails', { sessionId: id, datetime: new Date(newISO).toISOString(), mode: newMode });
          alert('Session updated.');
          await loadSessionsList(uid, filterRole);
          await loadSessionSummaries(uid);
        } catch (err) { console.error(err); alert('Failed to update: '+err.message); }
      });
    });
  } catch (err) {
    console.error('loadSessionsList', err);
    container.innerHTML = `<div class="empty">Failed to load sessions</div>`;
  }
}

/* ---------- Load ratings list (student's own ratings) ---------- */
async function loadRatingsList(uid, roleFilter = '', searchText = '') {
  const container = $('ratingsList');
  const emptyEl = $('ratingsEmpty');
  
  // 1. Prepare container for loading state
  container.classList.add('empty'); // Ensure empty style is applied for loading
  emptyEl.classList.add('hidden'); 
  container.innerHTML = 'Loading ratings...';
  
  try {
    const ratingsCol = collection(db, 'ratings');
    
    // 2. Fetch ALL of the student's ratings first (efficient Firestore query)
    const q = query(ratingsCol, where('studentId','==',uid), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 3. 🎯 CRITICAL FIX: Client-Side Filter for Role and Search Text 🎯
    if (roleFilter) {
      docs = docs.filter(r => r.role === roleFilter);
    }
    if (searchText) {
      const lowerSearch = searchText.toLowerCase().trim();
      docs = docs.filter(r => (r.personName||'').toLowerCase().includes(lowerSearch) || (r.comment||'').toLowerCase().includes(lowerSearch));
    }
    
    // 4. Handle Empty State and CSS Class
    if (docs.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    } else {
      emptyEl.classList.add('hidden');
      container.classList.remove('empty'); // Fixes the dashed border/padding issue
    }

    // 5. Render Results
    const rows = docs.map(r => {
      return `
        <div class="profile-card" style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between">
            <div><strong>${escapeHtml(r.personName)}</strong> <span class="muted">(${escapeHtml(r.role)})</span></div>
            <div>${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
          </div>
          <div class="muted" style="font-size:13px">${new Date(r.createdAt).toLocaleString()}</div>
          <div>${escapeHtml(r.comment || '')}</div>
        </div>
      `;
    }).join('');
    container.innerHTML = `<div class="profiles-grid">${rows}</div>`;
    
  } catch (err) {
    console.error('loadRatingsList', err);
    container.innerHTML = `<div class="empty">Failed to load ratings</div>`;
  }
}



/* ---------- Search & Booking UI ---------- */
async function openSearchAndBook(type = '', q = '') {
  setActiveMenu(type === 'tutor' ? 'menuBookTutor' : (type === 'counsellor' ? 'menuBookCounsellor' : 'menuBookTutor'));
  showSection('searchSection');
  $('searchTitle').textContent = type ? (type === 'tutor' ? 'Search Tutors' : 'Search Counsellors') : 'Search';
  $('filterRole').value = type || '';
  $('searchInput').value = q || '';
  await performSearch();
  $('searchBtn').onclick = performSearch;

  async function performSearch() {
    const text = $('searchInput').value.trim().toLowerCase();
    const roleFilter = $('filterRole').value;
    const usersCol = collection(db, 'users');
    let qRef;
    if (roleFilter) qRef = query(usersCol, where('role', '==', roleFilter));
    else qRef = query(usersCol, where('role','in',['tutor','counsellor']));
    
    // 🚨 Security Note: This query returns all tutors/counselors. Security rules 
    // must prevent students from seeing sensitive fields like their UUID.
    const snap = await getDocs(qRef);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const filtered = docs.filter(u => {
      if (!u) return false;
      if (text === '') return (type ? u.role === type : (u.role === 'tutor' || u.role === 'counsellor'));
      const hay = ((u.name||'') + ' ' + (u.modules||'') + ' ' + (u.department||'') + ' ' + (u.location||'')).toLowerCase();
      return hay.includes(text) && (type ? u.role === type : true);
    });
    renderSearchResults(filtered, type || null);
  }
}

/* renderSearchResults */
function renderSearchResults(list, role) {
  const out = $('searchResults'); out.innerHTML = '';
  const emptyEl = $('searchEmpty');
  if (!list || list.length === 0) {
     emptyEl.classList.remove('hidden'); return;
  } else     emptyEl.classList.add('hidden');
  list.forEach(u => {
    const photo = u.profilePic || 'assets/logos/uj.png';
    const availableNow = computeAvailability(u);
    const availClass = availableNow ? 'avail-green' : 'avail-red';
    const availText = availableNow ? 'Available now' : 'Unavailable';
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <img src="${escapeHtml(photo)}" class="profile-photo" alt="photo"/>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><strong>${escapeHtml(u.name||'—')}</strong><div class="muted">${escapeHtml(u.department||'')}</div></div>
            <div><span class="avail-dot ${availClass}"></span><small class="muted">${availText}</small></div>
          </div>
          <div style="margin-top:8px">${escapeHtml(u.bio||'No bio')}</div>
          <div style="margin-top:8px" class="muted">Modules: ${escapeHtml(u.modules||'—')}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn" data-act="book">Book ${u.role === 'tutor' ? 'Tutor' : 'Counsellor'}</button>
        <button class="btn secondary" data-act="chat">Chat</button>
        <button class="btn secondary" data-act="rate">Rate</button>
      </div>
    `;
    out.appendChild(card);
    card.querySelector('[data-act="book"]').onclick = () => openBookingModal(u.role, u);
    card.querySelector('[data-act="chat"]').onclick = () => { 
        setActiveMenu('menuChat'); 
        showSection('chatSection'); 
        loadChatContacts(CURRENT_USER_ID, u); // Pass user to auto-select chat
    };
    card.querySelector('[data-act="rate"]').onclick = () => openRatingModal(u);

  });
}

/* small helper to determine availability */
function computeAvailability(u) {
  try {
    if (!u) return false;
    if (typeof u.available === 'boolean') return u.available;
    if (Array.isArray(u.availability) && u.availability.length) {
      const now = new Date();
      // Adjust day to match the format that availability should use (e.g., 'Monday')
      const day = now.toLocaleString('en-US', { weekday: 'long' }); 
      const hhmm = now.toTimeString().slice(0,5); 
      for (const s of u.availability) {
        if (String(s.day) === day) {
          if (!s.from || !s.to) continue;
          if (s.from <= hhmm && hhmm <= s.to) return true;
        }
      }
    }
    return false;
  } catch (e) { return false; }
}

/* ---------- Booking modal (Modified for Multi-Slot Preference) ---------- */
async function openBookingModal(role, person) {
  let selectedSlots = []; // To store the bucket of 3-5 choices

  const modal = document.createElement('div'); modal.className = 'modal-back';
  modal.innerHTML = `
    <div class="modal" style="width: 500px;">
      <h3>Book ${role === 'tutor' ? 'Tutor' : 'Counsellor'} — ${escapeHtml(person.name||'')}</h3>
      <div>
        <label>Topic / What do you need help with?</label>
        <textarea id="bk_note" rows="2" style="width:100%;margin-bottom:8px"></textarea>
        
        <label><b>Add Preferred Time Slots (Pick 3-5)</b></label>
        <div style="display:flex; gap:5px; margin-bottom:10px;">
          <input id="bk_dt_picker" type="datetime-local" style="flex:1; margin-bottom:0;"/>
          <button class="btn" id="add_slot_btn" style="padding:5px 15px;">Add</button>
        </div>
        
        <div id="slot_list_bucket" style="margin-bottom:15px; max-height:120px; overflow-y:auto; border:1px solid #ddd; padding:10px; border-radius:8px; background:#f9f9f9;">
          <div class="muted" style="text-align:center">No slots added yet.</div>
        </div>

        <div class="row">
          <div style="flex:1">
            <label>Mode</label>
            <select id="bk_mode" style="width:100%">
              <option value="online">Online</option>
              <option value="in-person">In-person</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" id="bk_confirm">Submit Request</button>
          <button class="btn secondary" id="bk_cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Helper to refresh the visual list of slots
  const renderBucket = () => {
    const bucketEl = $('slot_list_bucket');
    if (selectedSlots.length === 0) {
      bucketEl.innerHTML = '<div class="muted" style="text-align:center">No slots added yet.</div>';
      return;
    }
    bucketEl.innerHTML = selectedSlots.map((iso, idx) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:6px 10px; margin-bottom:5px; border-radius:5px; border:1px solid #eee; font-size:13px;">
        <span>📅 ${new Date(iso).toLocaleString()}</span>
        <button style="background:none; border:none; color:red; cursor:pointer; font-weight:bold;" data-idx="${idx}">✕</button>
      </div>
    `).join('');

    // Attach delete listeners to the 'X' buttons
    bucketEl.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        selectedSlots.splice(btn.dataset.idx, 1);
        renderBucket();
      };
    });
  };

  // Add slot button logic
  $('add_slot_btn').onclick = () => {
    const val = $('bk_dt_picker').value;
    if (!val) return alert('Please select a date and time first.');
    const iso = new Date(val).toISOString();
    
    if (selectedSlots.length >= 5) return alert('Maximum 5 slots allowed.');
    if (selectedSlots.includes(iso)) return alert('This slot is already in your bucket.');
    
    selectedSlots.push(iso);
    renderBucket();
    $('bk_dt_picker').value = ''; // Clear picker for next one
  };

  $('bk_cancel').onclick = () => modal.remove();

  $('bk_confirm').onclick = async () => {
    const note = $('bk_note').value.trim();
    const mode = $('bk_mode').value;

    if (selectedSlots.length < 1) return alert('Please add at least one preferred time slot.');

    try {
        // Send the ARRAY 'preferredSlots' instead of a single 'desiredISO'
        await callServerFunction('requestSession', {
            role, 
            person, 
            preferredSlots: selectedSlots, 
            mode, 
            note
        });

        alert('Request submitted! The ' + role + ' will pick one of your available times.');
        modal.remove();
        await loadPendingRequests(CURRENT_USER_ID); 
        await updateNotifBadge(CURRENT_USER_ID);

    } catch (err) {
        console.error('Booking error:', err);
        alert('Booking failed: ' + err.message);
    }
  };
}


/* ---------- Ratings modal ---------- */
async function openRatingModal(person) {
  const modal = document.createElement('div'); modal.className = 'modal-back';
  modal.innerHTML = `
    <div class="modal">
      <h3>Rate ${person.role === 'tutor' ? 'Tutor' : 'Counsellor'} — ${escapeHtml(person.name||'')}</h3>
      <div>
        <label>Star Rating (1-5)</label>
        <select id="rate_stars" style="width:100%;margin-bottom:8px">
          <option value="5">5 Stars (Excellent)</option>
          <option value="4">4 Stars (Good)</option>
          <option value="3" selected>3 Stars (Average)</option>
          <option value="2">2 Stars (Poor)</option>
          <option value="1">1 Star (Very Poor)</option>
        </select>
        <label>Comment/Feedback</label>
        <textarea id="rate_comment" rows="3" style="width:100%;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" id="rate_confirm">Submit Rating</button>
          <button class="btn secondary" id="rate_cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  $('rate_cancel').onclick = () => modal.remove();

  $('rate_confirm').onclick = async () => {
    const stars = $('rate_stars').value;
    const comment = $('rate_comment').value.trim();

    if (!comment && Number(stars) < 3) {
      if (!confirm('You gave a low rating without comment. Submit anyway?')) return;
    }

    try {
      // 🚨 Production Change: Call secure server function for mutation
      await callServerFunction('submitRating', {
        personId: person.id,
        personName: person.name,
        role: person.role,
        stars: stars,
        comment: comment
      });

      alert('Rating submitted successfully.');
      modal.remove();
      await loadUserRatingsCount(CURRENT_USER_ID);
    } catch (err) {
      console.error('Rating submission error:', err);
      alert('Failed to submit rating: ' + err.message);
    }
  };
}

/* ---------- Support function ---------- */
async function sendSupport(uid) {
    const title = $('supportTitle').value.trim();
    const message = $('supportMessage').value.trim();
    const priority = $('supportPriority').value;
    if (!title || !message) {
        alert('Please fill out both the title and message fields.');
        return;
    }
    try {
        // 🚨 Production Change: Call secure server function for mutation
        await callServerFunction('submitSupportTicket', { title, message, priority });
        alert('Support ticket submitted successfully. An administrator will review your request.');
        $('supportTitle').value = '';
        $('supportMessage').value = '';
    } catch (err) {
        console.error('Support ticket submission error:', err);
        alert('Failed to submit support ticket: ' + err.message);
    }
}

/* ---------- Google Calendar Helper (remains same) ---------- */
function generateGoogleCalendarLink({ title, details, location, start, end }) {
    const formatTime = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const startTime = formatTime(start);
    const endTime = formatTime(end);

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        details: details,
        location: location,
        dates: `${startTime}/${endTime}`
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
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

/* ---------- Chat Functionality FIX ---------- */

/** Generates a consistent chatId for two users. */
function chatIdFor(a,b) { return [a,b].sort().join('__'); }

/** Loads contacts (Tutors/Counsellors) and initiates chat listener if a contact is auto-selected. */
async function loadChatContacts(uid, autoSelectPerson = null) {
  const contactsEl = $('chatContacts');
  contactsEl.innerHTML = 'Loading contacts...';
  
  try {
    // 1. Find all Tutors and Counsellors
    const usersCol = collection(db, 'users');
    const qRef = query(usersCol, where('role','in',['tutor','counsellor']));
    const snap = await getDocs(qRef);
    const people = snap.docs.map(d => ({ id: d.id, ...d.data(), role: d.data().role || 'person' }));

    if (people.length === 0) {
      contactsEl.innerHTML = '<div class="empty" style="padding:10px">No staff available for chat.</div>';
      return;
    }

    contactsEl.innerHTML = people.map(p => `
      <div class="chat-contact" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name||'—')}" data-role="${escapeHtml(p.role)}">
        <img src="${escapeHtml(p.profilePic||'assets/logos/uj.png')}" alt="photo" class="profile-photo"/>
        <div style="flex:1"><strong>${escapeHtml(p.name||'—')}</strong><div class="muted">${escapeHtml(p.role)}</div></div>
        <span class="badge" id="unread-${escapeHtml(p.id)}"></span>
      </div>
    `).join('');

    // Attach click handlers
    contactsEl.querySelectorAll('.chat-contact').forEach(contactEl => {
      contactEl.addEventListener('click', () => {
        const id = contactEl.dataset.id;
        const name = contactEl.dataset.name;
        // Select contact and open chat window
        selectChatContact(id, name);
      });
      // Optionally, add a real-time listener for *unread counts* here.
    });
    
    // Auto-select if a person was passed (e.g., from search/booking button)
    if (autoSelectPerson && autoSelectPerson.id) {
        selectChatContact(autoSelectPerson.id, autoSelectPerson.name);
    }
    
  } catch (err) {
    console.error('loadChatContacts', err);
    contactsEl.innerHTML = '<div class="empty" style="padding:10px">Failed to load contacts.</div>';
  }
}

// --- Replacement for the original function selectChatContact(personId, personName) ---
/** Handles contact selection and sets up the chat window. */
function selectChatContact(personId, personName) {
    // 1. Get the main contacts container first
    const contactsContainer = $('chatContacts'); 

    // 2. 🚨 CRITICAL FIX: Only proceed if the container exists 🚨
    if (contactsContainer) {
        // Update active contact visual (clear all active states first)
        
        // 3. Find all contacts within the container and remove the 'active' class
        contactsContainer.querySelectorAll('.chat-contact').forEach(el => el.classList.remove('active'));
        
        // 4. Find the specific contact element using the container
        const selectedEl = contactsContainer.querySelector(`.chat-contact[data-id="${personId}"]`);
        
        // 5. Ensure selectedEl is not null before using classList (This is line 971 or close to it)
        if (selectedEl) {
             selectedEl.classList.add('active'); 
        } else {
             console.warn(`Chat contact element not found for ID: ${personId}`);
        }
    } else {
        console.error("The '#chatContacts' container was not found. Check your HTML structure.");
    }

    // Update global state
    currentChatContact = { id: personId, name: personName };
    $('chatHeaderName').textContent = personName;
    show('chatWindow');
    $('chatEmpty').classList.add('hidden');
  
   $('messageInput').disabled = false;
   $('sendMessageBtn').disabled = false;
   $('fileUploadBtn').disabled = false;
    
    // Start chat listener
    startChatListener(CURRENT_USER_ID, personId);
}
// --------------------------------------------------------------------------------------


/** Starts the real-time listener for messages in the nested collection. */
function startChatListener(myId, theirId) {
    const chatId = chatIdFor(myId, theirId);
    
    // 1. Cleanup existing listener if it exists
    if (unsubscribeChat) unsubscribeChat();
    
    const messagesEl = $('chatMessages');
    messagesEl.innerHTML = '<div class="empty">Loading messages...</div>';
    
    // 2. 🚨 CRITICAL FIX: Reference the nested messages collection 🚨
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc')); // Order chronologically

    // 3. Setup new listener
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        // Render messages
        const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        messagesEl.innerHTML = msgs.map(m => {
            // Use 'senderId' for consistency, falling back to 'from' if needed
            const sender = m.senderId || m.from; 
            const isMe = sender === myId;
            const style = isMe ? 'background:#ff7a00;color:#fff;align-self:flex-end;' : 'background:#e0e0e0;color:#333;align-self:flex-start;';
            
            return `
            <div style="display:flex;flex-direction:column;width:100%">
              <div style="max-width:70%;padding:10px;border-radius:15px;margin:2px;${style}">
                ${escapeHtml(m.text)}
              </div>
              <small class="muted" style="font-size:10px;margin-top:2px;${isMe ? 'text-align:right;margin-right:15px;' : 'text-align:left;margin-left:15px;'}">${new Date(m.timestamp).toLocaleTimeString()}</small>
            </div>
          `;
        }).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight; // Auto-scroll to bottom
        
    }, (error) => {
        console.error('Chat Listener Error:', error);
        messagesEl.innerHTML = `<div class="empty" style="color:red">Failed to load chat: ${error.message}</div>`;
    });
}

/** Sends a message to the currently selected contact. */
async function sendMessage(myId) {
  if (!currentChatContact) return alert('Please select a contact to chat with.');
  const theirId = currentChatContact.id;
  const chatId = chatIdFor(myId, theirId);
  const inputEl = $('messageInput');
  const txt = inputEl.value.trim();
  if (!txt) return;

  try {
    // 🚨 CRITICAL FIX: Reference the nested messages collection for writing 🚨
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    await addDoc(messagesRef, {
      senderId: myId, // CRITICAL: Use 'senderId' consistently
      text: txt, 
      timestamp: new Date().toISOString()
    });
    
    // Update the parent chat document with a timestamp/last message
    await setDoc(doc(db, 'chats', chatId), { lastMessageAt: new Date().toISOString() }, { merge: true });

    inputEl.value = '';
    // Input is cleared, listener handles display and scroll
  } catch (err) {
    console.error('send chat', err);
    alert('Failed to send message: ' + err.message);
  }
}
 






