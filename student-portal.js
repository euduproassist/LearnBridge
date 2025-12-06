// student-portal.js (REPLACE your old file with this full content)
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* ---------- small DOM helpers ---------- */
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if(el) el.classList.remove('hidden'); };
const hide = id => { const el = $(id); if(el) el.classList.add('hidden'); };
const setActiveMenu = (id) => {
  document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
  const el = $(id); if(el) el.classList.add('active');
};

/* ---------- Auth init ---------- */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
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


  // search handlers
  $('quickSearchBtn').onclick = () => { openSearchAndBook('', $('quickSearch').value.trim()); };
  $('searchBtn').onclick = () => { const v = $('searchInput').value.trim(); const role = $('filterRole').value; openSearchAndBook(role, v); };
  $('searchBackBtn').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); };

  // profile save
  $('saveProfileBtn').onclick = async () => { await saveProfile(uid); };

  // support
  $('sendSupportBtn').onclick = async () => { await sendSupport(uid); };

  // initial loads
  await loadProfile(uid);
  await loadSessionSummaries(uid);
  await updateNotifBadge(uid);
  await loadPendingRequests(uid); 

  // show dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');

}

/* ---------- Section toggling ---------- */
function showSection(idToShow) {
  const sections = ['dashboardSection','searchSection','sessionsSection','profileSection','supportSection','notificationsSection'];
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
      // fallback to auth email
      $('profileEmail').textContent = auth.currentUser ? auth.currentUser.email : '';
    }
  } catch (err) {
    console.error('loadProfile', err);
  }
}
async function saveProfile(uid) {
  try {
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
    console.error(err);
    alert('Failed to save profile: ' + err.message);
  }
}

/* ---------- Notifications ---------- */
async function updateNotifBadge(uid) {
  try {
    // quick count of pending/approved sessions notifications (example)
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
    // render simple notification list from sessions documents changes
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
    // update dashboard + badge
    updatePendingUICounts(sessions.length);

    if (sessions.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    const rows = sessions.map(s => {
      const datetime = s.datetime ? new Date(s.datetime).toLocaleString() : '—';
      return `<tr data-id="${s.id}">
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
          await updateDoc(doc(db,'sessions',id), { status: 'cancelled' });
          alert('Request cancelled.');
          await loadPendingRequests(uid);
          await loadSessionSummaries(uid);
          await updateNotifBadge(uid);
        } catch (err) { console.error(err); alert('Failed to cancel: ' + err.message); }
      });
    });

    container.querySelectorAll('.update-pending').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        // Ask for new date/time and optionally notes/mode
        const newISO = prompt('Enter new date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00');
        if (!newISO) return;
        if (isNaN(new Date(newISO))) { alert('Invalid date'); return; }
        const newMode = prompt('Enter new mode (online / in-person)', 'online');
        if (!newMode) return;
        const newNotes = prompt('Update notes (optional)', '') || '';
        try {
          await updateDoc(doc(db,'sessions',id), { datetime: new Date(newISO).toISOString(), mode: newMode, notes: newNotes });
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
    const qTutor = query(sessionsCol, where('studentId','==', uid), where('role','==','tutor'), where('status','==','approved'));
    const qCoun = query(sessionsCol, where('studentId','==', uid), where('role','==','counsellor'), where('status','==','approved'));
    const [st, sc] = await Promise.all([getDocs(qTutor), getDocs(qCoun)]);
    const tutorSessions = st.docs.map(d=>({ id:d.id, ...d.data() }));
    const counSessions = sc.docs.map(d=>({ id:d.id, ...d.data() }));
    if (tutorSessions.length === 0) $('tutorSessionSummary').textContent = 'No upcoming tutor sessions.'; else {
      tutorSessions.sort((a,b)=> new Date(a.datetime)-new Date(b.datetime));
      const s = tutorSessions[0];
      $('tutorSessionSummary').textContent = `${s.personName} — ${new Date(s.datetime).toLocaleString()} (${s.mode||'—'})`;
    }
    if (counSessions.length === 0) $('counsellorSessionSummary').textContent = 'No upcoming counsellor sessions.'; else {
      counSessions.sort((a,b)=> new Date(a.datetime)-new Date(b.datetime));
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
    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty">No upcoming sessions found.</div>';
      return;
    }
    const rows = sessions.map(s => {
      const datetime = new Date(s.datetime).toLocaleString();
      const modeClass = s.mode === 'online' ? 'session-online' : 'session-inperson';
      return `<tr data-id="${s.id}"><td>${escapeHtml(s.personName||'—')}</td><td>${escapeHtml(datetime)}</td><td class="${modeClass}">${escapeHtml(s.mode||'—')}</td>
        <td>
          <button class="cancel-btn btn secondary">Cancel</button>
          <button class="update-btn btn">Update</button>
        </td></tr>`;
    }).join('');
    container.innerHTML = `<table><thead><tr><th>Person</th><th>Date & Time</th><th>Mode</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
    container.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        if (!confirm('Cancel this session?')) return;
        try {
          await updateDoc(doc(db,'sessions',id), { status: 'cancelled' });
          alert('Session cancelled.');
          await loadSessionsList(uid, filterRole);
          await loadSessionSummaries(uid);
        } catch (err) { console.error(err); alert('Failed to cancel: '+err.message); }
      });
    });
    container.querySelectorAll('.update-btn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.target.closest('tr').dataset.id;
        const newISO = prompt('Enter new date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00');
        if (!newISO) return;
        if (isNaN(new Date(newISO))) { alert('Invalid date'); return; }
        const newMode = prompt('Enter new mode (online / in-person)', 'online');
        if (!newMode) return;
        try {
          await updateDoc(doc(db,'sessions',id), { datetime: new Date(newISO).toISOString(), mode: newMode });
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

/* ---------- Search & Booking UI ---------- */

/**
 * openSearchAndBook(type, q)
 * type: 'tutor'|'counsellor'|''(all)
 * q: optional quick query string
 */
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
    // If a role filter is specified we query by role, else fetch all with role tutor/counsellor
    let qRef;
    if (roleFilter) qRef = query(usersCol, where('role', '==', roleFilter));
    else qRef = query(usersCol, where('role','in',['tutor','counsellor']));
    const snap = await getDocs(qRef);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // client-side filter by text fields (name, modules, department, location)
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
  if (!list || list.length === 0) {
    $('searchEmpty').classList.remove('hidden'); return;
  } else $('searchEmpty').classList.add('hidden');
  list.forEach(u => {
    const photo = u.profilePic || 'assets/logos/uj.png';
    // availability: we check u.availability boolean or schedule object; fallback to unavailable
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
        <button class="btn secondary" data-act="view">View profile</button>
      </div>
    `;
    out.appendChild(card);
    card.querySelector('[data-act="book"]').onclick = () => openBookingModal(u.role, u);
    card.querySelector('[data-act="view"]').onclick = () => alert(`Profile:\n\n${u.name}\n\n${u.bio||'No bio'}\n\nModules: ${u.modules||'—'}`);
  });
}

/* small helper to determine availability - very simple: look for u.available boolean or weekly schedule */
function computeAvailability(u) {
  try {
    if (!u) return false;
    if (typeof u.available === 'boolean') return u.available;
    // if u.availability array exists with days/time, do a minimal check for now
    if (Array.isArray(u.availability) && u.availability.length) {
      // check current day/time whether matches one slot
      const now = new Date();
      const day = now.toLocaleString('en-US', { weekday: 'long' }); // e.g. Monday
      const hhmm = now.toTimeString().slice(0,5); // "14:30"
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
  // person is user object with id, name, profilePic, etc.
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
          <div id="bk_suggestion" style="margin-left:auto;color:#666;align-self:center"></div>
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
    // smart suggestion: check conflicts for this person
    const conflict = await checkConflictForPerson(person.id, desiredISO);
    if (conflict) {
      const suggested = await findNextAvailable(person.id, desiredISO);
      if (suggested) {
        const ok = confirm(`Requested slot conflicts. Suggest next available: ${new Date(suggested).toLocaleString()}. Use suggested?`);
        if (!ok) return;
        // use suggested
        await createSessionDoc(role, person, desiredISO, suggested, mode, note);
        alert('Booked (suggested time). You can add to calendar.');
        modal.remove();
        return;
      } else {
        if (!confirm('Requested slot conflicts and no suggestion available within next 24 hours. Book anyway?')) return;
      }
    }
    // no conflict or user forced booking
    await createSessionDoc(role, person, desiredISO, null, mode, note);
    alert('Booking created (status: pending). You will be notified.');
    modal.remove();
  };
}

/* checkConflictForPerson(personId, desiredISO) */
async function checkConflictForPerson(personId, desiredISO) {
  try {
    const sessionsCol = collection(db, 'sessions');
    // find sessions for that person that overlap +/- 59 minutes of desired time (simple)
    const desired = new Date(desiredISO);
    const startWindow = new Date(desired.getTime() - 60*60*1000);
    const endWindow = new Date(desired.getTime() + 60*60*1000);
    // fetch sessions where personId equals tutorId or counsellorId (we store depending on role)
    const q1 = query(sessionsCol, where('personId','==',personId));
    const snap = await getDocs(q1);
    for (const d of snap.docs) {
      const s = d.data();
      if (!s.datetime) continue;
      const sdt = new Date(s.datetime);
      if (sdt >= startWindow && sdt <= endWindow && (s.status === 'approved' || s.status === 'pending')) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('checkConflictForPerson', err);
    return false;
  }
}

/* findNextAvailable(personId, desiredISO) => returns ISO string or null
   naive approach: add 60 minutes until free, up to 24 tries (24 hours)
*/
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

/* createSessionDoc - writes session into Firestore
   If suggestedISO provided, use that as datetime, else use desiredISO
*/
async function createSessionDoc(role, person, desiredISO, suggestedISO, mode, note) {
  try {
    const studentId = auth.currentUser.uid;
    const sessionsCol = collection(db, 'sessions');
    const sessionObj = {
      role: role,
      // unify: store personId always in personId
      personId: person.id || person.uid || person.userId || '',
      tutorId: role === 'tutor' ? (person.id || person.uid) : '',
      counsellorId: role === 'counsellor' ? (person.id || person.uid) : '',
      studentId: studentId,
      personName: person.name || '',
      datetime: (suggestedISO || desiredISO),
      mode: mode || 'online',
      status: 'pending',
      notes: note || '',
      createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(sessionsCol, sessionObj);

    // provide "Add to Google Calendar" link
    const start = new Date(sessionObj.datetime);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1 hour
    const gcal = generateGoogleCalendarLink({
      title: `Session with ${sessionObj.personName}`,
      details: sessionObj.notes || '',
      location: sessionObj.mode === 'in-person' ? (person.location || '') : 'Online',
      start,
      end
    });
    if (confirm('Booking queued. Would you like to add it to your Google Calendar now?')) {
      window.open(gcal, '_blank');
    }

    // update UI
    await loadSessionSummaries(studentId);
    await updateNotifBadge(studentId);
    return docRef.id;
  } catch (err) {
    console.error('createSessionDoc', err);
    alert('Failed to create session: ' + err.message);
    throw err;
  }
}

/* Google calendar link */
function generateGoogleCalendarLink({ title, details, location, start, end }) {
  const fmt = (d) => {
    // YYYYMMDDTHHMMSSZ (we use toISOString and drop milliseconds)
    return d.toISOString().replace(/-|:|\.\d+/g, '');
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

/* ---------- Support ---------- */
async function sendSupport(uid) {
  const msg = $('supportMessage').value.trim();
  if (!msg) return alert('Enter a message');
  try {
    await addDoc(collection(db, 'supportTickets'), {
      studentId: uid,
      message: msg,
      createdAt: new Date().toISOString(),
      status: 'open'
    });
    alert('Support ticket submitted.');
    $('supportMessage').value = '';
  } catch (err) {
    console.error('sendSupport', err);
    alert('Failed to send support: ' + err.message);
  }
}

/* ---------- Utilities ---------- */
function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


