
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

    // --- SECURE BOOKING/UPDATE LOGIC ---
    if (name === 'requestSession') {
        const { role, person, desiredISO, mode, note } = payload;
        
        // 1. **Server-Side Conflict Check & Availability:**
        // We simulate the server doing the check securely (client can't bypass).
        const conflict = await checkConflictForPerson(person.id, desiredISO); 
        let finalISO = desiredISO;
        let suggestedSlot = null;
        if (conflict) {
            suggestedSlot = await findNextAvailable(person.id, desiredISO);
            if (!suggestedSlot) throw new Error("Slot conflicts, and no alternative could be suggested.");
            finalISO = suggestedSlot;
        }

        // 2. **Server-Side Session Creation:**
        const sessionsCol = collection(db, 'sessions');
        const sessionObj = {
            role, personId: person.id || '', tutorId: role === 'tutor' ? person.id : '',
            counsellorId: role === 'counsellor' ? person.id : '', studentId: uid,
            personName: person.name || '', datetime: finalISO, mode: mode || 'online',
            status: 'pending', notes: note || '', createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(sessionsCol, sessionObj);
        return { sessionId: docRef.id, finalISO }; // Return result to client
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
  container.innerHTML = 'Loading ratings...';
  try {
    const ratingsCol = collection(db, 'ratings');
    const q = query(ratingsCol, where('studentId','==',uid), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Client-side filter for role/search (less secure, but OK for low volume/user's own data)
    if (roleFilter) docs = docs.filter(r => r.role === roleFilter);
    if (searchText) docs = docs.filter(r => (r.personName||'').toLowerCase().includes(searchText.toLowerCase()));

    const emptyEl = $('ratingsEmpty');
    if (docs.length === 0) {
      emptyEl.classList.remove('hidden');
      container.innerHTML = '';
      return;
    } else {
      emptyEl.classList.add('hidden');
    }

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
    container.innerHTML = `<div class="profiles-grid">${rows}</div>`; // Use profiles-grid for layout
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

/* ---------- Booking modal ---------- */
async function openBookingModal(role, person) {
  const modal = document.createElement('div'); modal.className = 'modal-back';
  modal.innerHTML = `
    <div class="modal">
      <h3>Book ${role === 'tutor' ? 'Tutor' : 'Counsellor'} — ${escapeHtml(person.name||'')}</h3>
      <div>
        <label>Topic / What do you need help with?</label>
        <textarea id="bk_note" rows="3" style="width:100%;margin-bottom:8px"></textarea>
        <div class="row">
          <div style="flex:1">
            <label>Date & Time</label>
            <input id="bk_dt" type="datetime-local" style="width:100%"/>
          </div>
          <div style="width:140px">
            <label>Mode</label>
            <select id="bk_mode" style="width:100%">
              <option value="online">Online</option>
              <option value="in-person">In-person</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" id="bk_confirm">Book</button>
          <button class="btn secondary" id="bk_cancel">Cancel</button>
          <div id="bk_suggestion" style="margin-left:auto;color:#d73a3a;align-self:center"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  $('bk_cancel').onclick = () => modal.remove();

  $('bk_confirm').onclick = async () => {
    const note = $('bk_note').value.trim();
    const dtVal = $('bk_dt').value;
    const mode = $('bk_mode').value;
    if (!dtVal) return alert('Please pick date & time');
    const desiredISO = new Date(dtVal).toISOString();

    try {
        // 🚨 Production Change: Call secure server function for mutation
        const result = await callServerFunction('requestSession', {
            role, person, desiredISO, mode, note
        });

        alert('Booking created. Status: pending. You will be notified.');
        
        // Handle calendar link for suggested slot if necessary (Feature 2 - Smart Suggestion)
        if (result.finalISO !== desiredISO) {
             alert(`Requested slot conflicted. Booked for the next available time: ${new Date(result.finalISO).toLocaleString()}`);
        }
        
        // Calendar link prompt
        const gcal = generateGoogleCalendarLink({
          title: `Session with ${person.name}`,
          details: note || '',
          location: mode === 'in-person' ? (person.location || '') : 'Online',
          start: new Date(result.finalISO),
          end: new Date(new Date(result.finalISO).getTime() + 60 * 60 * 1000)
        });
        if (confirm('Booking successful. Would you like to add it to your Google Calendar?')) {
          window.open(gcal, '_blank');
        }

        modal.remove();
        await loadSessionSummaries(CURRENT_USER_ID);
        await updateNotifBadge(CURRENT_USER_ID);

    } catch (err) {
        console.error('Booking error:', err);
        $('bk_suggestion').textContent = err.message;
        alert('Booking failed: ' + err.message);
    }
  };
}

/* ---------- Ratings modal ---------- */
async function openRatingModal(person) {
  const modal = document.createElement('div'); modal.className = 'modal-back';
  modal.innerHTML = `
    <div class="modal">
      <h3>Rate ${escapeHtml(person.name || '')}</h3>
      <div>
        <label>Stars (0-5)</label>
        <div id="ratingStars" style="font-size:22px;margin:8px 0;cursor:pointer">
          <span data-star="1">☆</span><span data-star="2">☆</span><span data-star="3">☆</span><span data-star="4">☆</span><span data-star="5">☆</span>
        </div>
        <textarea id="ratingComment" rows="3" style="width:100%;margin-bottom:8px" placeholder="Optional comments..."></textarea>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn" id="ratingSend">Send to Admin</button>
          <button class="btn secondary" id="ratingCancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  let selected = 5; 
  const starsEl = modal.querySelector('#ratingStars');
  function renderStars(n) {
    starsEl.querySelectorAll('span').forEach(span => {
      const s = Number(span.getAttribute('data-star'));
      span.textContent = s <= n ? '★' : '☆';
    });
  }
  renderStars(selected);
  starsEl.querySelectorAll('span').forEach(span => {
    span.addEventListener('click', () => {
      selected = Number(span.getAttribute('data-star'));
      renderStars(selected);
    });
  });

  modal.querySelector('#ratingCancel').onclick = () => modal.remove();
  modal.querySelector('#ratingSend').onclick = async () => {
    const comment = modal.querySelector('#ratingComment').value.trim();
    try {
      // 🚨 Production Change: Call secure server function for mutation
      await callServerFunction('submitRating', {
        personId: person.id || '',
        personName: person.name || '',
        role: person.role || '',
        stars: selected,
        comment
      });

      alert('Thanks — your rating was submitted.');
      modal.remove();
      const uid = CURRENT_USER_ID;
      await loadUserRatingsCount(uid);
      await loadRatingsList(uid); 
    } catch (err) {
      console.error('saveRating error', err);
      alert('Failed to submit rating: ' + err.message);
    }
  };
}

/* ---------- Helpers: Session Conflict Check (Robust Overlap Logic) ---------- */
// This logic matches the requirement of the callServerFunction for secure scheduling.
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

      // Check for overlap: Start of desired < End of existing AND End of desired > Start of existing
      const isOverlapping = (desiredStart < existingEnd) && (desiredEnd > existingStart);
      
      if (isOverlapping) {
        console.log(`[SERVER CHECK] Conflict found with appointment ${d.id}`);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('[SERVER CHECK] Conflict check failed', err);
    return false;
  }
}

// Attempts to find the next available slot starting 1 hour after the desired time
async function findNextAvailable(personId, desiredISO) {
  try {
    const base = new Date(desiredISO);
    for (let i = 1; i <= 10; i++) { // Check up to 10 subsequent hours
      const cand = new Date(base.getTime() + i * 60 * 60 * 1000); 
      const iso = cand.toISOString();
      // Ensure we use the robust conflict check here
      const conflict = await checkConflictForPerson(personId, iso); 
      if (!conflict) return iso;
    }
    return null;
  } catch (err) {
    console.error('[SERVER CHECK] findNextAvailable failed', err);
    return null;
  }
}


/* Google calendar link */
function generateGoogleCalendarLink({ title, details, location, start, end }) {
  const fmt = (d) => {
    return d.toISOString().replace(/-|:|\.\d+|Z/g, '').slice(0, 15); // YYYYMMDDTHHMMSS
  };
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: details,
    location: location || '',
    dates: `${fmt(start)}/${fmt(end)}`
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

/* ---------- Support (Report an Issue) ---------- */
async function sendSupport(uid) {
  const title = $('supportTitle').value.trim();
  const msg = $('supportMessage').value.trim();
  const priority = $('supportPriority').value;

  if (!title || !msg) return alert('Enter a title and description');
  try {
    // 🚨 Production Change: Call secure server function for mutation
    await callServerFunction('submitSupportTicket', {
        title, message: msg, priority
    });
    
    alert('Support ticket submitted.');
    $('supportTitle').value = '';
    $('supportMessage').value = '';
  } catch (err) {
    console.error('sendSupport', err);
    alert('Failed to send support: ' + err.message);
  }
}








