// ---------- admin-portal.part3.js ----------
/* ---------- SESSIONS MANAGEMENT ---------- */
async function loadAllSessions() {
  try {
    const container = $('allSessions');
    container.innerHTML = 'Loading sessions...';
    const sessionsCol = collection(db, 'sessions');
    const snap = await getDocs(query(sessionsCol, orderBy('datetime', 'asc'), limit(1000)));
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sessions.length === 0) { container.innerHTML = '<div class="empty">No sessions found.</div>'; return; }

    const rows = sessions.map(s => {
      const dt = s.datetime ? new Date(s.datetime).toLocaleString() : '-';
      const status = s.status || 'pending';
      return `<div class="dash-card" style="margin-bottom:10px" data-id="${s.id}">
        <div style="display:flex;justify-content:space-between">
          <div><strong>${escapeHtml(s.personName || s.tutorName || '—')}</strong> with <strong>${escapeHtml(s.studentName || s.studentId || '—')}</strong></div>
          <div>${escapeHtml(status)} • ${escapeHtml(s.role || '')}</div>
        </div>
        <div style="margin-top:6px">${escapeHtml(dt)} • ${escapeHtml(s.mode || '')} ${s.location ? '• ' + escapeHtml(s.location) : ''}</div>
        <div style="margin-top:8px">${escapeHtml(s.notes || '')}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn approve-session">Approve</button>
          <button class="btn secondary cancel-session">Cancel</button>
          <button class="btn" data-action="force-reschedule">Force Reschedule</button>
          <button class="btn secondary" data-action="reassign">Reassign</button>
        </div>
      </div>`;
    }).join('');
    container.innerHTML = rows;

    // attach handlers
    container.querySelectorAll('.approve-session').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        if (!confirm('Approve this session?')) return;
        try { await updateDoc(doc(db,'sessions', id), { status: 'approved' }); alert('Approved'); await loadAllSessions(); } catch (err) { console.error(err); alert(err.message); }
      });
    });
    container.querySelectorAll('.cancel-session').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        if (!confirm('Cancel this session?')) return;
        try { await updateDoc(doc(db,'sessions', id), { status: 'cancelled' }); alert('Cancelled'); await loadAllSessions(); } catch (err) { console.error(err); alert(err.message); }
      });
    });
    container.querySelectorAll('[data-action="force-reschedule"]').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        const newISO = prompt('Enter new datetime (YYYY-MM-DDTHH:MM)', '');
        if (!newISO) return;
        try { await updateDoc(doc(db,'sessions',id), { datetime: new Date(newISO).toISOString(), status: 'approved' }); alert('Rescheduled'); await loadAllSessions(); } catch (err) { console.error(err); alert('Failed: '+err.message); }
      });
    });
    container.querySelectorAll('[data-action="reassign"]').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        const tutorEmail = prompt('Enter new tutor email to assign', '');
        if (!tutorEmail) return;
        // find tutor by email
        const usersCol = collection(db,'users');
        const q = query(usersCol, where('email','==', tutorEmail), where('role','in',['tutor','counsellor']));
        const snap = await getDocs(q);
        if (snap.empty) { alert('Tutor not found'); return; }
        const tDoc = snap.docs[0];
        try {
          await updateDoc(doc(db,'sessions',id), { personId: tDoc.id, personName: tDoc.data().name, tutorId: tDoc.id });
          alert('Reassigned');
          await loadAllSessions();
        } catch (err) { console.error(err); alert(err.message); }
      });
    });

  } catch (err) {
    console.error('loadAllSessions', err);
    $('allSessions').innerHTML = '<div class="empty">Failed to load sessions.</div>';
  }
}

/* ---------- BOOKING REQUESTS (Approval Center) ---------- */
async function loadBookingRequests() {
  try {
    const container = $('bookingList');
    container.innerHTML = 'Loading booking requests...';
    const snap = await getDocs(query(collection(db,'sessions'), where('status','==','pending'), orderBy('createdAt','asc')));
    const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (reqs.length === 0) { container.innerHTML = '<div class="empty">No pending booking requests.</div>'; return; }
    const rows = reqs.map(r => {
      const dt = r.datetime ? new Date(r.datetime).toLocaleString() : '-';
      return `<div class="dash-card" data-id="${r.id}">
        <div style="display:flex;justify-content:space-between"><div><strong>${escapeHtml(r.studentName||r.studentId||'—')}</strong> requested <strong>${escapeHtml(r.personName||'—')}</strong></div><div>${escapeHtml(dt)}</div></div>
        <div style="margin-top:6px">${escapeHtml(r.notes||'')}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn approve-req">Approve</button>
          <button class="btn secondary reject-req">Reject</button>
          <button class="btn" data-action="suggest">Suggest Time</button>
          <button class="btn secondary" data-action="recommend">Recommend Tutor</button>
        </div>
      </div>`;
    }).join('');
    container.innerHTML = rows;

    container.querySelectorAll('.approve-req').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        if (!confirm('Approve request?')) return;
        try { await updateDoc(doc(db,'sessions', id), { status: 'approved' }); alert('Approved'); await loadBookingRequests(); } catch (err) { console.error(err); alert(err.message); }
      });
    });
    container.querySelectorAll('.reject-req').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        const reason = prompt('Reason for rejection (optional)', '') || '';
        try { await updateDoc(doc(db,'sessions', id), { status: 'rejected', adminNote: reason }); alert('Rejected'); await loadBookingRequests(); } catch (err) { console.error(err); alert(err.message); }
      });
    });
    container.querySelectorAll('[data-action="suggest"]').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        const newISO = prompt('Enter suggested datetime (YYYY-MM-DDTHH:MM)', '');
        if (!newISO) return;
        try { await updateDoc(doc(db,'sessions', id), { datetime: new Date(newISO).toISOString(), adminNote: 'Suggested new time by admin' }); alert('Suggested time saved.'); await loadBookingRequests(); } catch (err) { console.error(err); alert(err.message); }
      });
    });
    container.querySelectorAll('[data-action="recommend"]').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        const tutorEmail = prompt('Enter recommended tutor email', '');
        if (!tutorEmail) return;
        const usersCol = collection(db,'users');
        const q = query(usersCol, where('email','==', tutorEmail), where('role','in',['tutor','counsellor']));
        const snap = await getDocs(q);
        if (snap.empty) { alert('Tutor not found'); return; }
        const tDoc = snap.docs[0];
        try { await updateDoc(doc(db,'sessions', id), { recommendedTutorId: tDoc.id, adminNote: 'Recommended tutor by admin' }); alert('Recommended recorded'); await loadBookingRequests(); } catch (err) { console.error(err); alert(err.message); }
      });
    });

  } catch (err) {
    console.error('loadBookingRequests', err);
    $('bookingList').innerHTML = '<div class="empty">Failed to load booking requests</div>';
  }
}

/* ---------- ISSUES & TICKETS ---------- */
async function loadIssues() {
  try {
    const container = $('issuesList');
    container.innerHTML = 'Loading issues...';
    const snap = await getDocs(query(collection(db,'issues'), orderBy('createdAt','desc'), limit(500)));
    const issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (issues.length === 0) { container.innerHTML = '<div class="empty">No issues reported.</div>'; return; }
    const rows = issues.map(it => {
      return `<div class="dash-card" data-id="${it.id}">
        <div style="display:flex;justify-content:space-between"><div><strong>${escapeHtml(it.issueType || 'Issue')}</strong> • ${escapeHtml(it.priority || 'Normal')}</div><div>${escapeHtml(it.reporterName || it.reporterId || '')}</div></div>
        <div style="margin-top:6px">${escapeHtml(it.description || '')}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn assign-issue">Assign</button>
          <button class="btn secondary progress-issue">Mark In Progress</button>
          <button class="btn" data-action="resolve">Resolve</button>
          <button class="btn secondary" data-action="notes">Add Note</button>
        </div>
      </div>`;
    }).join('');
    container.innerHTML = rows;

    container.querySelectorAll('.assign-issue').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        const staff = prompt('Assign to staff (email)', '') || '';
        if (!staff) return;
        await updateDoc(doc(db,'issues', id), { assignedTo: staff, status: 'assigned' });
        alert('Assigned');
        await loadIssues();
      });
    });
    container.querySelectorAll('.progress-issue').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        await updateDoc(doc(db,'issues', id), { status: 'in-progress' });
        alert('Marked in progress'); await loadIssues();
      });
    });
    container.querySelectorAll('[data-action="resolve"]').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        await updateDoc(doc(db,'issues', id), { status: 'resolved', resolvedAt: new Date().toISOString() });
        alert('Resolved'); await loadIssues();
      });
    });
    container.querySelectorAll('[data-action="notes"]').forEach(btn => {
      btn.addEventListener('click', async ev => {
        const id = ev.target.closest('[data-id]').dataset.id;
        const note = prompt('Enter internal note', '');
        if (!note) return;
        const issueRef = doc(db,'issues', id);
        const snap = await getDoc(issueRef);
        const cur = snap.exists() ? snap.data() : {};
        const notes = cur.internalNotes || [];
        notes.push({ note, by: 'admin', at: new Date().toISOString() });
        await updateDoc(issueRef, { internalNotes: notes });
        alert('Note added'); await loadIssues();
      });
    });

  } catch (err) {
    console.error('loadIssues', err);
    $('issuesList').innerHTML = '<div class="empty">Failed to load issues.</div>';
  }
}

/* ---------- RATINGS & PERFORMANCE ---------- */
async function loadRatingsAnalytics() {
  try {
    const container = $('ratingsAnalytics');
    container.innerHTML = 'Loading ratings...';
    const snap = await getDocs(query(collection(db,'ratings'), orderBy('createdAt','desc'), limit(1000)));
    const ratings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (ratings.length === 0) { container.innerHTML = '<div class="empty">No ratings yet</div>'; return; }

    // compute summary
    const byTutor = {};
    ratings.forEach(r => {
      const pid = r.personId || 'unknown';
      byTutor[pid] = byTutor[pid] || { name: r.personName || pid, count: 0, total: 0, feedback: [] };
      byTutor[pid].count++;
      byTutor[pid].total += Number(r.stars || 0);
      byTutor[pid].feedback.push(r);
    });
    const summary = Object.keys(byTutor).map(k => ({ id: k, name: byTutor[k].name, avg: (byTutor[k].total / byTutor[k].count).toFixed(2), count: byTutor[k].count, feedback: byTutor[k].feedback }));
    summary.sort((a,b)=> b.avg - a.avg);

    // render top 10 and lowest 10
    const top = summary.slice(0,10);
    const low = summary.slice(-10).reverse();
    const html = `<h3>Top Rated Tutors</h3>${top.map(t=>`<div style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(t.name)}</strong> — ${t.avg} (${t.count} ratings)</div>`).join('')}
      <h3 style="margin-top:12px">Lowest Rated Tutors</h3>${low.map(t=>`<div style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(t.name)}</strong> — ${t.avg} (${t.count} ratings)</div>`).join('')}
      <div style="margin-top:12px"><button id="exportRatingsCSV" class="btn">Export Ratings CSV</button></div>`;
    container.innerHTML = html;

    $('#exportRatingsCSV').onclick = () => {
      const rows = [['Tutor','AvgRating','Count']];
      summary.forEach(s => rows.push([s.name, s.avg, s.count]));
      exportToCSV('ratings-summary.csv', rows);
    };

  } catch (err) {
    console.error('loadRatingsAnalytics', err);
    $('ratingsAnalytics').innerHTML = '<div class="empty">Failed to load ratings</div>';
  }
}

/* ---------- UNIVERSITY SETTINGS (Departments & Modules) ---------- */
async function loadUniversitySettings() {
  try {
    const container = $('uniSettings');
    container.innerHTML = 'Loading settings...';
    // departments collection
    const snap = await getDocs(query(collection(db,'departments'), orderBy('name','asc')));
    const depts = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    let html = `<div style="margin-bottom:12px"><button id="addDept" class="btn">Add Department</button></div>`;
    if (depts.length === 0) html += `<div class="empty">No departments yet</div>`;
    else {
      html += '<table><thead><tr><th>Department</th><th>Actions</th></tr></thead><tbody>';
      depts.forEach(d => {
        html += `<tr data-id="${d.id}"><td>${escapeHtml(d.name)}</td><td><button class="btn editDept">Edit</button> <button class="btn secondary delDept">Delete</button></td></tr>`;
      });
      html += '</tbody></table>';
    }
    container.innerHTML = html;
    $('#addDept').onclick = async () => {
      const name = prompt('Department name', '');
      if (!name) return;
      await addDoc(collection(db,'departments'), { name, createdAt: new Date().toISOString() });
      await loadUniversitySettings();
    };
    document.querySelectorAll('.editDept').forEach(btn=> btn.onclick = async ev => {
      const id = ev.target.closest('tr').dataset.id;
      const dDoc = await getDoc(doc(db,'departments', id));
      const cur = dDoc.exists() ? dDoc.data() : {};
      const name = prompt('New name', cur.name || '');
      if (!name) return;
      await updateDoc(doc(db,'departments', id), { name });
      await loadUniversitySettings();
    });
    document.querySelectorAll('.delDept').forEach(btn=> btn.onclick = async ev => {
      const id = ev.target.closest('tr').dataset.id;
      if (!confirm('Delete this department?')) return;
      await deleteDoc(doc(db,'departments', id));
      await loadUniversitySettings();
    });

  } catch (err) {
    console.error('loadUniversitySettings', err);
    $('uniSettings').innerHTML = '<div class="empty">Failed to load university settings</div>';
  }
}

/* ---------- NOTIFICATIONS CONTROL PANEL ---------- */
async function loadNotificationsPanel() {
  try {
    const container = $('notifPanel');
    container.innerHTML = `
      <div>
        <label>Title</label><input id="notifTitle" style="width:100%;margin-bottom:6px"/>
        <label>Message</label><textarea id="notifMessage" rows="3" style="width:100%"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="sendNotifAll" class="btn">Send to All</button>
          <button id="sendNotifTutors" class="btn">Send to Tutors</button>
          <button id="sendNotifStudents" class="btn">Send to Students</button>
        </div>
      </div>
    `;
    $('#sendNotifAll').onclick = async () => {
      const t = $('#notifTitle').value.trim(); const m = $('#notifMessage').value.trim();
      if (!t || !m) return alert('Enter title and message');
      await pushNotification({ title: t, message: m, target: 'all' });
      alert('Notification queued (written to DB).');
    };
    $('#sendNotifTutors').onclick = async () => {
      const t = $('#notifTitle').value.trim(); const m = $('#notifMessage').value.trim();
      if (!t || !m) return alert('Enter title and message');
      await pushNotification({ title: t, message: m, target: 'tutors' });
      alert('Notification queued to tutors');
    };
    $('#sendNotifStudents').onclick = async () => {
      const t = $('#notifTitle').value.trim(); const m = $('#notifMessage').value.trim();
      if (!t || !m) return alert('Enter title and message');
      await pushNotification({ title: t, message: m, target: 'students' });
      alert('Notification queued to students');
    };
  } catch (err) {
    console.error('loadNotificationsPanel', err);
    $('notifPanel').innerHTML = '<div class="empty">Failed to load notifications panel</div>';
  }
}

/* ---------- CONTENT MANAGEMENT ---------- */
async function loadContentPanel() {
  try {
    const container = $('contentPanel');
    const snap = await getDocs(query(collection(db,'content'), orderBy('createdAt','desc')));
    const items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    let html = `<div style="margin-bottom:12px"><button id="addContent" class="btn">Add Content Block</button></div>`;
    if (items.length === 0) html += '<div class="empty">No content</div>';
    else {
      html += items.map(it => `<div class="dash-card" data-id="${it.id}"><div><strong>${escapeHtml(it.title||'Untitled')}</strong></div><div style="margin-top:6px">${escapeHtml(it.body || '').slice(0,200)}</div><div style="margin-top:8px"><button class="btn editContent">Edit</button> <button class="btn secondary delContent">Delete</button></div></div>`).join('');
    }
    container.innerHTML = html;
    $('#addContent').onclick = async () => {
      const title = prompt('Title', 'Announcement');
      const body = prompt('Body', '');
      if (!title || !body) return;
      await addDoc(collection(db,'content'), { title, body, createdAt: new Date().toISOString() });
      await loadContentPanel();
    };
    document.querySelectorAll('.editContent').forEach(btn=> btn.onclick = async ev => {
      const id = ev.target.closest('[data-id]').dataset.id;
      const docRef = doc(db,'content', id);
      const snap = await getDoc(docRef);
      const cur = snap.exists() ? snap.data() : {};
      const title = prompt('Title', cur.title || '');
      const body = prompt('Body', cur.body || '');
      if (!title || !body) return;
      await updateDoc(docRef, { title, body });
      await loadContentPanel();
    });
    document.querySelectorAll('.delContent').forEach(btn=> btn.onclick = async ev => {
      const id = ev.target.closest('[data-id]').dataset.id;
      if (!confirm('Delete content?')) return;
      await deleteDoc(doc(db,'content', id));
      await loadContentPanel();
    });

  } catch (err) {
    console.error('loadContentPanel', err);
    $('contentPanel').innerHTML = '<div class="empty">Failed to load content</div>';
  }
}

/* ---------- REPORTS & AUDIT LOGS (basic) ---------- */
async function loadReportsPanel() {
  try {
    const container = $('reportsPanel');
    container.innerHTML = `
      <div style="display:flex;gap:8px">
        <button id="expAttendance" class="btn">Export Attendance CSV</button>
        <button id="expBookings" class="btn">Export Bookings CSV</button>
        <button id="expAudit" class="btn">Export Audit Log</button>
      </div>
      <div id="reportsResult" style="margin-top:12px"></div>
    `;
    $('#expBookings').onclick = async () => {
      const snap = await getDocs(query(collection(db,'sessions'), orderBy('createdAt','desc'), limit(2000)));
      const rows = [['SessionId','Student','Tutor','Datetime','Mode','Status','Notes']];
      snap.docs.forEach(d => {
        const s = d.data();
        rows.push([d.id, s.studentName||s.studentId||'', s.personName||'', s.datetime||'', s.mode||'', s.status||'', s.notes||'']);
      });
      exportToCSV('bookings-export.csv', rows);
    };
    $('#expAudit').onclick = async () => {
      const snap = await getDocs(query(collection(db,'audit'), orderBy('ts','desc'), limit(2000)));
      const rows = [['ts','actor','action','detail']];
      snap.docs.forEach(d => {
        const a = d.data();
        rows.push([a.ts||'', a.actor||'', a.action||'', JSON.stringify(a.detail||'')]);
      });
      exportToCSV('audit-export.csv', rows);
    };
    $('#expAttendance').onclick = async () => {
      // simplistic: count approved sessions per student
      const snap = await getDocs(query(collection(db,'sessions'), where('status','==','approved'), limit(5000)));
      const map = {};
      snap.docs.forEach(d => {
        const s = d.data();
        const sid = s.studentId || 'unknown';
        map[sid] = map[sid] || { student: s.studentName || sid, count: 0 };
        map[sid].count++;
      });
      const rows = [['Student','Count']];
      Object.values(map).forEach(r => rows.push([r.student, r.count]));
      exportToCSV('attendance-report.csv', rows);
    };

  } catch (err) {
    console.error('loadReportsPanel', err);
    $('reportsPanel').innerHTML = '<div class="empty">Failed to load reports panel</div>';
  }
}

/* ---------- ADMIN PROFILE ---------- */
async function loadAdminProfile(adminUid) {
  try {
    const container = $('adminProfile');
    const snap = await getDoc(doc(db,'users', adminUid));
    const profile = snap.exists() ? snap.data() : {};
    container.innerHTML = `
      <div style="max-width:700px">
        <label>Name</label><input id="adminName" value="${escapeHtml(profile.name||'')}" style="width:100%;margin-bottom:6px"/>
        <label>Title</label><input id="adminTitle" value="${escapeHtml(profile.title||'')}" style="width:100%;margin-bottom:6px"/>
        <label>Email</label><div style="margin-bottom:6px">${escapeHtml(profile.email||'')}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="saveAdminProfile" class="btn">Save</button>
          <button id="logoutAll" class="btn secondary">Log out all devices</button>
        </div>
      </div>
    `;
    $('#saveAdminProfile').onclick = async () => {
      await setDoc(doc(db,'users', adminUid), { name: $('#adminName').value.trim(), title: $('#adminTitle').value.trim() }, { merge: true });
      alert('Profile saved.');
      await loadAdminProfile(adminUid);
    };
    $('#logoutAll').onclick = async () => {
      // frontend-only: delete all admin sessions in audit or mark token revoked (requires backend). We provide a UI hint.
      if (!confirm('This will not forcibly sign out other devices from the client without backend. To fully log out everywhere you must revoke tokens in Firebase console. Proceed?')) return;
      await addDoc(collection(db,'audit'), { ts: new Date().toISOString(), actor: adminUid, action: 'logoutAllRequested' });
      alert('Request logged to audit — check Firebase console to revoke sessions.');
    };
  } catch (err) {
    console.error('loadAdminProfile', err);
    $('adminProfile').innerHTML = '<div class="empty">Failed to load admin profile</div>';
  }
}

/* ---------- Utility: conflict check and suggestion (reused from student portal) ---------- */
async function checkConflictForPerson(personId, desiredISO) {
  try {
    const sessionsCol = collection(db, 'sessions');
    const q1 = query(sessionsCol, where('personId','==',personId));
    const snap = await getDocs(q1);
    const desired = new Date(desiredISO);
    const startWindow = new Date(desired.getTime() - 60*60*1000);
    const endWindow = new Date(desired.getTime() + 60*60*1000);
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

/* ---------- Final: helper to reload dashboard (call when things change) ---------- */
async function refreshAll() {
  await loadDashboardMetrics();
  // if specific sections visible, refresh them
  const visible = document.querySelector('section:not(.hidden)');
  if (visible) {
    const id = visible.id;
    if (id === 'usersSection') await loadUsersTable();
    if (id === 'sessionsSection') await loadAllSessions();
    if (id === 'bookingsSection') await loadBookingRequests();
    if (id === 'issuesSection') await loadIssues();
    if (id === 'ratingsSection') await loadRatingsAnalytics();
    if (id === 'universitySection') await loadUniversitySettings();
  }
}

/* ---------- Exports for debugging (optional) ---------- */
window.adminPortal = {
  loadDashboardMetrics,
  loadUsersTable,
  loadAllSessions,
  loadBookingRequests,
  loadIssues,
  loadRatingsAnalytics,
  loadUniversitySettings,
  loadNotificationsPanel,
  loadContentPanel,
  loadReportsPanel,
  loadAdminProfile,
  refreshAll
};
