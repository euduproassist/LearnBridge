// tutor-portal.js (REPLACE your old file with this full content)
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
  $('menuDashboard').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); loadDashboard(uid); };
  $('menuSessions').onclick = () => { setActiveMenu('menuSessions'); showSection('sessionsSection'); loadSessionsList(uid); };
  $('menuIncoming').onclick = () => { setActiveMenu('menuIncoming'); showSection('incomingSection'); loadIncomingRequests(uid); };
  $('menuAvailability').onclick = () => { setActiveMenu('menuAvailability'); showSection('availabilitySection'); loadAvailability(uid); };
  $('menuChat').onclick = () => { setActiveMenu('menuChat'); showSection('chatSection'); loadConversations(uid); };
  $('menuProfile').onclick = () => { setActiveMenu('menuProfile'); showSection('profileSection'); loadProfile(uid); };
  $('menuNotifications').onclick = () => { setActiveMenu('menuNotifications'); showSection('notificationsSection'); loadNotifications(uid); };
  $('menuRatings').onclick = () => { setActiveMenu('menuRatings'); showSection('ratingsSection'); loadRatingsList(uid); };
  $('menuReport').onclick = () => { setActiveMenu('menuReport'); showSection('reportSection'); };

  // quick actions
  $('updateAvailabilityQuick').onclick = () => { setActiveMenu('menuAvailability'); showSection('availabilitySection'); loadAvailability(uid); };
  $('viewIncomingQuick').onclick = () => { setActiveMenu('menuIncoming'); showSection('incomingSection'); loadIncomingRequests(uid); };
  $('quickChatBtn').onclick = () => { setActiveMenu('menuChat'); showSection('chatSection'); loadConversations(uid); };
  $('quickReportBtn').onclick = () => { setActiveMenu('menuReport'); showSection('reportSection'); };

  // availability presets and actions
  $('presetAllWeek').onclick = () => applyPreset(uid, 'allweek');
  $('presetEvenings').onclick = () => applyPreset(uid, 'evenings');
  $('presetWeekend').onclick = () => applyPreset(uid, 'weekend');
  $('saveAvailabilityBtn').onclick = async () => await saveAvailability(uid);
  $('toggleAvailableNowBtn').onclick = async () => await toggleAvailableNow(uid);
  $('offlineModeBtn').onclick = async () => await setOfflineMode(uid);

  // profile actions
  $('saveProfileBtn').onclick = async () => { await saveProfile(uid); };
  $('resetPasswordBtn').onclick = () => { alert('Reset password handled via authentication flow (OTP). Use Forgot Password on login screen.'); };

  // report
  $('sendReportBtn').onclick = async () => { await sendReport(uid); };
  $('clearReportBtn').onclick = () => { $('reportTitle').value = ''; $('reportDesc').value = ''; };

  // ratings filter
  $('ratingsFilterBtn').onclick = () => loadRatingsList(uid, $('ratingsFilter').value.trim());

  // chat search
  $('chatSearch')?.addEventListener('input', (e) => filterConvos(e.target.value));

  // initial loads
  await loadProfile(uid);
  await loadDashboard(uid);
  await updateNotifBadge(uid);
  await loadIncomingRequests(uid);
  await loadAvailability(uid);
  await loadUserRatings(uid);

  // show dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');
}

/* ---------- Section toggling ---------- */
function showSection(idToShow) {
  const sections = ['dashboardSection','sessionsSection','incomingSection','availabilitySection','chatSection','profileSection','notificationsSection','ratingsSection','reportSection'];
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
      $('profileBioInput').value = profile.bio || '';
      $('profileModulesInput').value = profile.modules || '';
      $('profileDepartmentInput').value = profile.department || '';
      $('profileQualificationsInput').value = profile.qualifications || '';
      $('profilePictureInput').value = profile.profilePic || '';
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
    const userRef = doc(db, 'users', uid);
    const payload = {
      name: $('profileNameInput').value.trim(),
      bio: $('profileBioInput').value.trim(),
      modules: $('profileModulesInput').value.trim(),
      department: $('profileDepartmentInput').value.trim(),
      qualifications: $('profileQualificationsInput').value.trim(),
      profilePic: $('profilePictureInput').value.trim(),
      location: $('profileLocationInput').value.trim(),
      rate: $('profileRateInput').value.trim()
    };
    await setDoc(userRef, payload, { merge: true });
    alert('Profile saved successfully.');
    await loadProfile(uid);
  } catch (err) {
    console.error(err);
    alert('Failed to save profile: ' + err.message);
  }
}

/* ---------- Dashboard ---------- */
async function loadDashboard(uid) {
  try {
    // total sessions this week & upcoming & pending & rating
    const sessionsCol = collection(db, 'sessions');
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); // sunday start
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    // sessions where tutorId == uid
    const qWeek = query(sessionsCol, where('tutorId','==',uid));
    const snap = await getDocs(qWeek);
    const allSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const thisWeek = allSessions.filter(s => s.datetime && new Date(s.datetime) >= weekStart && new Date(s.datetime) < weekEnd);
    const upcoming = allSessions.filter(s => s.datetime && new Date(s.datetime) >= now && (s.status === 'approved' || s.status === 'pending'));
    const pending = allSessions.filter(s => s.status === 'pending');

    $('statThisWeek').textContent = thisWeek.length;
    $('statUpcoming').textContent = upcoming.length;
    $('statPending').textContent = pending.length;

    // average rating
    const ratingsCol = collection(db, 'ratings');
    const qr = query(ratingsCol, where('personId','==',uid));
    const rsnap = await getDocs(qr);
    const ratings = rsnap.docs.map(d => d.data());
    const avg = ratings.length ? (ratings.reduce((a,b)=>a + (Number(b.stars)||0),0)/ratings.length).toFixed(2) : '—';
    $('statRating').textContent = avg;

    // today's schedule
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
    const todaySessions = allSessions.filter(s => s.datetime && new Date(s.datetime) >= today && new Date(s.datetime) < tomorrow && s.status === 'approved');
    if (todaySessions.length === 0) {
      $('todayList').textContent = 'No sessions today.';
    } else {
      $('todayList').innerHTML = `<ul>${todaySessions.map(s => `<li>${escapeHtml(s.personName)} — ${new Date(s.datetime).toLocaleString()} (${escapeHtml(s.mode||'—')})</li>`).join('')}</ul>`;
    }

    // recent notifications render small list
    const notifItems = upcoming.slice(0,5).map(s => `${s.status}: ${s.personName} at ${new Date(s.datetime).toLocaleString()}`);
    $('dashNotifs').innerHTML = notifItems.length ? `<ul>${notifItems.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<div class="muted">No notifications</div>';

    // update badges
    const incomingCount = pending.length;
    const badge = $('incomingBadge'); if (badge) { if (incomingCount>0){ badge.style.display='inline-block'; badge.textContent = incomingCount; } else badge.style.display='none'; }
    await updateNotifBadge(uid);

  } catch (err) {
    console.error('loadDashboard', err);
  }
}

/* ---------- Notifications ---------- */
async function updateNotifBadge(uid) {
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('tutorId','==', uid), where('status','==','pending'));
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
    const sessionsCol = collection(db, 'sessions');
    const snap = await getDocs(query(sessionsCol, where('tutorId','==',uid), orderBy('createdAt','desc'), limit(20)));
    const list = [];
    snap.forEach(d => {
      const s = d.data();
      list.push(`${s.status || 'update'}: ${s.personName || '—'} at ${new Date(s.datetime || s.createdAt).toLocaleString()}`);
    });
    $('notificationsList').innerHTML = list.length ? `<ul>${list.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<div class="empty">No notifications</div>';
  } catch (err) {
    console.error('loadNotifications', err);
    $('notificationsList').innerHTML = '<div class="empty">Failed to load notifications</div>';
  }
}

/* ---------- Upcoming sessions (tutor view) ---------- */
async function loadSessionsList(uid) {
  const container = $('sessionList');
  container.innerHTML = 'Loading sessions...';
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('tutorId','==',uid), orderBy('datetime','asc'));
    const snap = await getDocs(q);
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty">No upcoming sessions found.</div>';
      return;
    }
    // auto highlighting urgent
    const now = new Date();
    const rows = sessions.map(s => {
      const dt = s.datetime ? new Date(s.datetime) : null;
      const diffMs = dt ? (new Date(dt) - now) : 0;
      const soon = diffMs <= 30*60*1000 && diffMs >= 0; // in 30 minutes
      const today = dt && (new Date(dt).toDateString() === now.toDateString());
      const statusBadge = soon ? '<span class="badge">In 30 min</span>' : (today ? '<span class="badge">Today</span>' : `<span class="muted">${escapeHtml(s.status||'—')}</span>`);
      const urgentClass = soon ? 'urgent' : '';
      return `<tr data-id="${s.id}" class="${urgentClass}">
        <td>${escapeHtml(s.personName || '—')}</td>
        <td>${dt ? escapeHtml(dt.toLocaleString()) : '—'}</td>
        <td>${escapeHtml(s.mode||'—')}</td>
        <td>${escapeHtml(s.notes||'—')}</td>
        <td>${statusBadge}</td>
        <td>
          ${s.mode==='online' && dt && Math.abs(new Date(dt)-now) < 5*60*1000 ? `<button class="start-btn btn">Start Session</button>` : ''}
          <button class="complete-btn btn">Mark Completed</button>
          <button class="reschedule-btn btn secondary">Request Reschedule</button>
          <button class="cancel-btn btn secondary">Cancel</button>
          <button class="chat-btn btn secondary">Chat</button>
        </td>
      </tr>`;
    }).join('');
    container.innerHTML = `<table><thead><tr><th>Student</th><th>Date & Time</th><th>Mode</th><th>Request</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;

    // attach handlers
    container.querySelectorAll('.start-btn').forEach(btn => btn.addEventListener('click', (ev) => {
      const id = ev.target.closest('tr').dataset.id;
      // open a simple "start" confirmation or meeting link stored in session doc
      startSession(id);
    }));
    container.querySelectorAll('.complete-btn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const id = ev.target.closest('tr').dataset.id;
      if (!confirm('Mark this session as completed?')) return;
      try { await updateDoc(doc(db,'sessions',id), { status: 'completed', completedAt: new Date().toISOString() }); alert('Marked completed.'); await loadSessionsList(uid); await loadDashboard(uid); } catch (err) { console.error(err); alert('Failed: '+err.message); }
    }));
    container.querySelectorAll('.reschedule-btn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const id = ev.target.closest('tr').dataset.id;
      const newISO = prompt('Suggest new date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-10T14:00');
      if (!newISO) return;
      if (isNaN(new Date(newISO))) { alert('Invalid date'); return; }
      try {
        await updateDoc(doc(db,'sessions',id), { rescheduleSuggestion: new Date(newISO).toISOString(), status: 'reschedule_requested' });
        alert('Reschedule suggested. Student will be notified.');
        await loadSessionsList(uid);
      } catch (err) { console.error(err); alert('Failed: '+err.message); }
    })));
    container.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const id = ev.target.closest('tr').dataset.id;
      if (!confirm('Cancel this session?')) return;
      try { await updateDoc(doc(db,'sessions',id), { status: 'cancelled' }); alert('Session cancelled.'); await loadSessionsList(uid); await loadDashboard(uid); } catch (err) { console.error(err); alert('Failed: '+err.message); }
    }));
    container.querySelectorAll('.chat-btn').forEach(btn => btn.addEventListener('click', (ev) => {
      const id = ev.target.closest('tr').dataset.id;
      const rowData = sessions.find(s=>s.id===id);
      openChatModalWith(rowData.personId, rowData.personName);
    }));

  } catch (err) {
    console.error('loadSessionsList', err);
    container.innerHTML = `<div class="empty">Failed to load sessions</div>`;
  }
}

/* ---------- Incoming requests (students booked tutor) ---------- */
async function loadIncomingRequests(uid) {
  const container = $('incomingList'); const emptyEl = $('incomingEmpty');
  container.innerHTML = 'Loading incoming requests...';
  try {
    const sessionsCol = collection(db, 'sessions');
    const q = query(sessionsCol, where('tutorId','==',uid), where('status','==','pending'), orderBy('createdAt','asc'));
    const snap = await getDocs(q);
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (requests.length === 0) {
      container.innerHTML = ''; emptyEl.classList.remove('hidden'); return;
    }
    emptyEl.classList.add('hidden');
    const cards = requests.map(r => {
      const photo = r.personPhoto || 'assets/logos/uj.png';
      return `<div class="profile-card" data-id="${r.id}" style="display:flex;gap:12px;align-items:flex-start">
        <img src="${escapeHtml(photo)}" class="profile-photo" alt="photo"/>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><strong>${escapeHtml(r.personName||'—')}</strong><div class="muted">${escapeHtml(r.modules||'—')}</div></div>
            <div class="muted">${new Date(r.datetime).toLocaleString()}</div>
          </div>
          <div style="margin-top:8px">${escapeHtml(r.notes||'—')}</div>
          <div style="margin-top:8px" class="muted">Mode: ${escapeHtml(r.mode||'—')}</div>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="approve-btn btn">Approve</button>
            <button class="reject-btn btn secondary">Reject</button>
            <button class="suggest-btn btn secondary">Suggest New Time</button>
            <button class="chat-btn btn secondary">Chat</button>
          </div>
        </div>
      </div>`;
    }).join('');
    container.innerHTML = cards;

    container.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const id = ev.target.closest('.profile-card').dataset.id;
      if (!confirm('Approve this request?')) return;
      try { await updateDoc(doc(db,'sessions',id), { status: 'approved', approvedAt: new Date().toISOString() }); alert('Request approved.'); await loadIncomingRequests(uid); await loadDashboard(uid); } catch (err) { console.error(err); alert('Failed: '+err.message); }
    }));
    container.querySelectorAll('.reject-btn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const id = ev.target.closest('.profile-card').dataset.id;
      const reason = prompt('Reason for rejection (optional):', '')||'';
      if (!confirm('Reject this request?')) return;
      try { await updateDoc(doc(db,'sessions',id), { status: 'rejected', rejectedReason: reason, rejectedAt: new Date().toISOString() }); alert('Request rejected.'); await loadIncomingRequests(uid); await loadDashboard(uid); } catch (err) { console.error(err); alert('Failed: '+err.message); }
    }));
    container.querySelectorAll('.suggest-btn').forEach(btn => btn.addEventListener('click', async (ev) => {
      const id = ev.target.closest('.profile-card').dataset.id;
      const newISO = prompt('Suggest a new date & time (YYYY-MM-DDTHH:MM) e.g. 2025-12-11T16:00');
      if (!newISO) return;
      if (isNaN(new Date(newISO))) { alert('Invalid date'); return; }
      try {
        await updateDoc(doc(db,'sessions',id), { rescheduleSuggestion: new Date(newISO).toISOString(), status: 'reschedule_requested' });
        alert('Suggested new time. Student will be notified to accept/reject.');
        await loadIncomingRequests(uid);
      } catch (err) { console.error(err); alert('Failed: '+err.message); }
    }));
    container.querySelectorAll('.chat-btn').forEach(btn => btn.addEventListener('click', (ev) => {
      const id = ev.target.closest('.profile-card').dataset.id;
      const row = requests.find(r=>r.id===id);
      openChatModalWith(row.personId, row.personName);
    }));

    // update counters
    const pendingCount = requests.length;
    const incBadge = $('incomingBadge'); if (incBadge) { if (pendingCount>0) { incBadge.style.display='inline-block'; incBadge.textContent = pendingCount; } else incBadge.style.display='none'; }
  } catch (err) {
    console.error('loadIncomingRequests', err);
    container.innerHTML = `<div class="empty">Failed to load incoming requests</div>`;
  }
}

/* ---------- Availability management ---------- */
async function loadAvailability(uid) {
  const container = $('availabilityTable');
  container.innerHTML = 'Loading availability...';
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const profile = snap.exists() ? snap.data() : {};
    const availability = profile.availability || {}; // { Monday: [{from:'09:00',to:'11:00'}, ...], ... }
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    let html = `<table><thead><tr><th>Day</th><th>Time Slots</th><th>Actions</th></tr></thead><tbody>`;
    days.forEach(day => {
      const slots = availability[day] || [];
      html += `<tr data-day="${day}"><td>${day}</td><td class="slots">${slots.map((s,i)=>`<div class="slot" data-idx="${i}">${s.from} - ${s.to}</div>`).join('') || '<div class="muted">No slots</div>'}</td><td>
        <button class="add-slot btn secondary" data-day="${day}">Add Slot</button>
        <button class="edit-slot btn secondary" data-day="${day}">Edit Slots</button>
      </td></tr>`;
    });
    html += `</tbody></table><div style="margin-top:8px" class="muted">Tip: Click Add Slot to create a new time range.</div>`;
    container.innerHTML = html;

    // attach add/edit handlers
    container.querySelectorAll('.add-slot').forEach(btn => btn.addEventListener('click', async (ev) => {
      const day = ev.target.dataset.day;
      const from = prompt(`Enter start time (HH:MM) for ${day}`, '09:00'); if (!from) return;
      const to = prompt(`Enter end time (HH:MM) for ${day}`, '10:00'); if (!to) return;
      await upsertAvailabilitySlot(uid, day, { from, to });
      await loadAvailability(uid);
    }));
    container.querySelectorAll('.edit-slot').forEach(btn => btn.addEventListener('click', async (ev) => {
      const day = ev.target.dataset.day;
      const userRef = doc(db,'users',uid); const sSnap = await getDoc(userRef); const profile = sSnap.exists()?sSnap.data():{};
      const slots = (profile.availability && profile.availability[day]) ? profile.availability[day] : [];
      const action = prompt(`Slots for ${day}:\n${slots.map((s,i)=>`${i+1}. ${s.from}-${s.to}`).join('\n')}\n\nType "remove N" to delete, or "clear" to remove all. Type "done" to cancel.`, '');
      if (!action) return;
      if (action.startsWith('remove')) {
        const parts = action.split(' ');
        const idx = Number(parts[1]) - 1;
        if (!isNaN(idx) && slots[idx]) {
          slots.splice(idx,1);
          await setDoc(userRef, { availability: { ...(profile.availability||{}), [day]: slots } }, { merge: true });
          alert('Slot removed.');
          await loadAvailability(uid);
        } else alert('Invalid index');
      } else if (action === 'clear') {
        await setDoc(userRef, { availability: { ...(profile.availability||{}), [day]: [] } }, { merge: true });
        alert('Slots cleared.');
        await loadAvailability(uid);
      }
    }));

  } catch (err) {
    console.error('loadAvailability', err);
    container.innerHTML = `<div class="empty">Failed to load availability</div>`;
  }
}
async function upsertAvailabilitySlot(uid, day, slot) {
  try {
    const userRef = doc(db, 'users', uid);
    const s = await getDoc(userRef);
    const p = s.exists()? s.data() : {};
    const availability = p.availability || {};
    const arr = availability[day] || [];
    arr.push(slot);
    availability[day] = arr;
    await setDoc(userRef, { availability }, { merge: true });
  } catch (err) { console.error('upsertAvailabilitySlot', err); throw err; }
}
async function saveAvailability(uid) {
  // in this simple UI we already write per change; inform the tutor
  alert('Availability saved (changes applied instantly in editor).');
  await loadAvailability(uid);
}
async function applyPreset(uid, which) {
  const presets = {
    allweek: { Sunday:[{from:'08:00',to:'18:00'}], Monday:[{from:'08:00',to:'18:00'}], Tuesday:[{from:'08:00',to:'18:00'}], Wednesday:[{from:'08:00',to:'18:00'}], Thursday:[{from:'08:00',to:'18:00'}], Friday:[{from:'08:00',to:'18:00'}], Saturday:[{from:'08:00',to:'18:00'}] },
    evenings: { Monday:[{from:'17:00',to:'21:00'}], Tuesday:[{from:'17:00',to:'21:00'}], Wednesday:[{from:'17:00',to:'21:00'}], Thursday:[{from:'17:00',to:'21:00'}], Friday:[{from:'17:00',to:'21:00'}] },
    weekend: { Saturday:[{from:'09:00',to:'18:00'}], Sunday:[{from:'09:00',to:'18:00'}] }
  };
  try {
    await setDoc(doc(db,'users',uid), { availability: presets[which] || {} }, { merge: true });
    alert('Preset applied.');
    await loadAvailability(uid);
  } catch (err) { console.error('applyPreset', err); alert('Failed to apply preset'); }
}
async function toggleAvailableNow(uid) {
  try {
    const userRef = doc(db,'users',uid);
    const s = await getDoc(userRef);
    const p = s.exists()?s.data():{};
    const curr = p.availableNow ? !!p.availableNow : false;
    await setDoc(userRef, { availableNow: !curr }, { merge: true });
    alert(`Available Now set to ${!curr}`);
    await loadAvailability(uid);
  } catch (err) { console.error(err); alert('Failed to toggle'); }
}
async function setOfflineMode(uid) {
  try {
    await setDoc(doc(db,'users',uid), { availableNow: false, offlineMode: true }, { merge: true });
    alert('Offline mode enabled.');
    await loadAvailability(uid);
  } catch (err) { console.error(err); alert('Failed to set offline'); }
}

/* ---------- Chat (basic) ---------- */
let convoCache = []; let activeConvo = null;
async function loadConversations(uid) {
  const convoList = $('convoList'); convoList.innerHTML = 'Loading...';
  try {
    // find recent sessions to display student list (or conversations collection)
    const sessionsCol = collection(db, 'sessions');
    const snap = await getDocs(query(sessionsCol, where('tutorId','==',uid), orderBy('createdAt','desc'), limit(50)));
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // unique students
    const convos = [];
    const seen = new Set();
    sessions.forEach(s => {
      if (s.personId && !seen.has(s.personId)) { seen.add(s.personId); convos.push({ personId: s.personId, personName: s.personName, last: s.datetime }); }
    });
    convoCache = convos;
    if (convos.length === 0) { convoList.innerHTML = '<div class="muted">No recent conversations yet.</div>'; return; }
    convoList.innerHTML = convos.map(c => `<div class="profile-card" data-id="${c.personId}" style="cursor:pointer"><strong>${escapeHtml(c.personName)}</strong><div class="muted">${c.last? new Date(c.last).toLocaleString():''}</div></div>`).join('');
    convoList.querySelectorAll('.profile-card').forEach(el => el.addEventListener('click', (ev)=> {
      const pid = ev.currentTarget.dataset.id;
      const convo = convoCache.find(x=>x.personId===pid);
      openChatModalWith(pid, convo.personName);
    }));
  } catch (err) {
    console.error('loadConversations', err);
    convoList.innerHTML = '<div class="empty">Failed to load conversations</div>';
  }
}
function filterConvos(text) {
  text = (text||'').toLowerCase();
  const el = $('convoList');
  if (!el) return;
  el.querySelectorAll('.profile-card').forEach(card => {
    const name = card.querySelector('strong').textContent.toLowerCase();
    card.style.display = name.includes(text) ? '' : 'none';
  });
}
async function openChatModalWith(personId, personName) {
  // open chat modal (full chat implemented basic: store messages under collection 'messages' with convoId tutorId_personId)
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

  // load last 100 messages
  try {
    const msgsCol = collection(db, 'messages');
    const q = query(msgsCol, where('convoId','==',convoId), orderBy('createdAt','asc'));
    const snap = await getDocs(q);
    const msgs = snap.docs.map(d=>d.data());
    chatArea.innerHTML = msgs.map(m => `<div><strong>${escapeHtml(m.fromName||m.from)}</strong>: ${escapeHtml(m.text)}</div>`).join('');
    chatArea.scrollTop = chatArea.scrollHeight;
  } catch (err) {
    console.error('openChat load', err);
    chatArea.innerHTML = '<div class="muted">Failed to load messages</div>';
  }

  modal.querySelector('#chatClose').onclick = () => modal.remove();
  modal.querySelector('#chatSend').onclick = async () => {
    const text = modal.querySelector('#chatMsg').value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db,'messages'), {
        convoId,
        from: auth.currentUser.uid,
        fromName: $('profileNameInput').value || auth.currentUser.email || 'Tutor',
        to: personId,
        text,
        createdAt: new Date().toISOString()
      });
      // append locally
      chatArea.innerHTML += `<div><strong>You</strong>: ${escapeHtml(text)}</div>`;
      modal.querySelector('#chatMsg').value = '';
      chatArea.scrollTop = chatArea.scrollHeight;
    } catch (err) { console.error('chat send', err); alert('Failed to send'); }
  };
}

/* ---------- Ratings (view + respond) ---------- */
async function loadUserRatings(uid) {
  // basic count load used on init
  try {
    const ratingsCol = collection(db,'ratings');
    const q = query(ratingsCol, where('personId','==',uid));
    const snap = await getDocs(q);
    const rows = snap.docs.map(d=>d.data());
    $('statRating').textContent = rows.length ? (rows.reduce((a,b)=>a + (Number(b.stars)||0),0)/rows.length).toFixed(2) : '—';
  } catch (err) { console.error(err); }
}
async function loadRatingsList(uid, filter='') {
  const container = $('ratingsList'); const emptyEl = $('ratingsEmpty');
  container.innerHTML = 'Loading ratings...';
  try {
    const ratingsCol = collection(db, 'ratings');
    const q = query(ratingsCol, where('personId','==',uid), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (filter) {
      const f = filter.toLowerCase();
      if (f.includes('1-star')) docs = docs.filter(r=>r.stars===1);
      else if (f.includes('5-star')) docs = docs.filter(r=>r.stars===5);
      else if (f.includes('this month')) {
        const now = new Date(); const m = now.getMonth(); const y = now.getFullYear();
        docs = docs.filter(r=> { const dt = new Date(r.createdAt); return dt.getMonth()===m && dt.getFullYear()===y; });
      } else docs = docs.filter(r => (r.comment||'').toLowerCase().includes(f) || (r.personName||'').toLowerCase().includes(f));
    }
    if (docs.length === 0) { emptyEl.classList.remove('hidden'); container.innerHTML = ''; return; } else emptyEl.classList.add('hidden');
    container.innerHTML = docs.map(r => `
      <div class="profile-card" style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between">
          <div><strong>${escapeHtml(r.personName)}</strong> <span class="muted">(${escapeHtml(r.role)})</span></div>
          <div>${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
        </div>
        <div class="muted" style="font-size:13px">${new Date(r.createdAt).toLocaleString()}</div>
        <div>${escapeHtml(r.comment || '')}</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="btn reply-rating" data-id="${r.id}">Reply</button>
        </div>
        <div id="reply_${r.id}" class="muted" style="margin-top:6px">${escapeHtml(r.reply||'')}</div>
      </div>
    `).join('');
    container.querySelectorAll('.reply-rating').forEach(btn => btn.addEventListener('click', async (ev) => {
      const id = ev.target.dataset.id;
      const reply = prompt('Write a reply to this feedback (visible to student):', '');
      if (reply === null) return;
      try {
        await updateDoc(doc(db,'ratings',id), { reply, repliedAt: new Date().toISOString() });
        alert('Reply saved.');
        await loadRatingsList(uid);
      } catch (err) { console.error(err); alert('Failed to reply'); }
    }));
  } catch (err) {
    console.error('loadRatingsList', err);
    container.innerHTML = '<div class="empty">Failed to load ratings</div>';
  }
}

/* ---------- Report an issue ---------- */
async function sendReport(uid) {
  const title = $('reportTitle').value.trim();
  const category = $('reportCategory').value;
  const priority = $('reportPriority').value;
  const desc = $('reportDesc').value.trim();
  if (!title || !desc) return alert('Enter title and description');
  try {
    await addDoc(collection(db,'reports'), {
      title, category, priority, description: desc, tutorId: uid, createdAt: new Date().toISOString(), status: 'open'
    });
    alert('Report sent to Admin.');
    $('reportTitle').value=''; $('reportDesc').value='';
  } catch (err) {
    console.error('sendReport', err);
    alert('Failed to send report');
  }
}

/* ---------- Utilities & small helpers ---------- */
function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Start simple session (open meeting link) ---------- */
async function startSession(sessionId) {
  try {
    const sRef = doc(db,'sessions',sessionId);
    const sSnap = await getDoc(sRef);
    if (!sSnap.exists()) return alert('Session not found');
    const s = sSnap.data();
    // if meeting link exists open, else just notify
    if (s.meetingLink) window.open(s.meetingLink,'_blank');
    else alert('No meeting link available. Use chat to coordinate or add link to session.');
  } catch (err) {
    console.error('startSession', err);
  }
}

/* ---------- Helpers used by student code that map to tutor roles (compat) ---------- */

/* create session doc is handled by student side; tutor side mainly updates sessions based on requests. */
/* But we provide helper to programmatically create a session if tutor creates one for student (quick invite) */
async function createSessionForStudent({ studentId, studentName, dtISO, mode='online', notes='' }) {
  try {
    const tutorId = auth.currentUser.uid;
    const sessionsCol = collection(db,'sessions');
    const sessionObj = {
      role: 'tutor',
      personId: studentId,
      tutorId: tutorId,
      counsellorId: '',
      studentId: studentId,
      personName: studentName,
      datetime: dtISO,
      mode,
      status: 'approved',
      notes,
      createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(sessionsCol, sessionObj);
    alert('Session created and approved.');
    return docRef.id;
  } catch (err) {
    console.error('createSessionForStudent', err);
    throw err;
  }
}
