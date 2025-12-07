// ---------- admin-portal.part2.js ----------
/* ---------- DASHBOARD METRICS & simple analytics ---------- */
async function loadDashboardMetrics() {
  try {
    // Counts
    const usersCol = collection(db, 'users');
    const studentsQ = query(usersCol, where('role','==','student'));
    const tutorsQ = query(usersCol, where('role','in',['tutor','counsellor']));
    const [stSnap, tSnap] = await Promise.all([getDocs(studentsQ), getDocs(tutorsQ)]);
    const totalStudents = stSnap.size;
    const totalTutors = tSnap.size;

    // sign-ups today / week (by createdAt on users)
    let newToday = 0, newWeek = 0;
    const allUsersSnap = await getDocs(query(usersCol, orderBy('createdAt', 'desc'), limit(1000)));
    const now = new Date();
    allUsersSnap.forEach(d => {
      const u = d.data();
      if (!u.createdAt) return;
      const created = new Date(u.createdAt);
      const diff = now - created;
      if (diff <= 1000*60*60*24) newToday++;
      if (diff <= 1000*60*60*24*7) newWeek++;
    });

    // pending tutor approvals
    const pendingTutorsSnap = await getDocs(query(usersCol, where('role','==','tutor'), where('status','==','pending')));
    const pendingTutors = pendingTutorsSnap.size;

    // pending booking requests
    const sessionsCol = collection(db, 'sessions');
    const pendingRequestsSnap = await getDocs(query(sessionsCol, where('status','==','pending')));
    const pendingRequests = pendingRequestsSnap.size;

    // sessions today & in-progress (approx)
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
    const qToday = query(sessionsCol, where('datetime','>=', todayStart.toISOString()), where('datetime','<=', todayEnd.toISOString()));
    // note: Firestore may not support range queries on string ISO easily if stored as strings; if datetime stored as ISO strings this still works lexicographically. If stored as timestamps adapt accordingly.
    const todaySnap = await getDocs(qToday);
    const sessionsToday = todaySnap.size;
    // in-progress: status 'in-progress'
    const inProgressSnap = await getDocs(query(sessionsCol, where('status','==','in-progress')));
    const sessionsInProgress = inProgressSnap.size;

    // issues today
    const issuesCol = collection(db, 'issues');
    const issuesTodaySnap = await getDocs(query(issuesCol, where('createdAt','>=', todayStart.toISOString()), where('createdAt','<=', todayEnd.toISOString())));
    const issuesToday = issuesTodaySnap.size;

    // average tutor rating
    const ratingsCol = collection(db, 'ratings');
    const ratingsSnap = await getDocs(ratingsCol);
    let avgRating = 0;
    if (ratingsSnap.size > 0) {
      let s = 0; ratingsSnap.forEach(d => s += Number(d.data().stars || 0));
      avgRating = (s / ratingsSnap.size).toFixed(2);
    }

    // Fill dashboard cards — find card nodes by approximate text content and update them
    document.querySelectorAll('.dash-card').forEach(card => {
      const txt = card.textContent || '';
      if (/Total Student/i.test(txt)) card.textContent = `Total Student Accounts — ${totalStudents}`;
      else if (/Tutor\/Counselor/i.test(txt)) card.textContent = `Total Tutor/Counsellor Accounts — ${totalTutors}`;
      else if (/New Sign/i.test(txt)) card.textContent = `New Sign-Ups — Today: ${newToday} / This Week: ${newWeek}`;
      else if (/Pending Tutor Approvals/i.test(txt)) card.textContent = `Pending Tutor Approvals — ${pendingTutors}`;
      else if (/Booking Requests/i.test(txt)) card.textContent = `Pending Booking Requests — ${pendingRequests}`;
      else if (/Sessions Today/i.test(txt)) card.textContent = `Sessions Today — ${sessionsToday}`;
      else if (/Sessions In Progress/i.test(txt)) card.textContent = `Sessions In Progress — ${sessionsInProgress}`;
      else if (/Issues Reported Today/i.test(txt)) card.textContent = `Issues Reported Today — ${issuesToday}`;
      else if (/Average Tutor Rating/i.test(txt)) card.textContent = `Average Tutor Rating — ${avgRating}`;
    });

    // Minimal visual analytics placeholders: write counts into chart boxes
    $('').textContent = ''; // safe noop if future
    // TODO: plug charting library here for real charts — left as placeholders so core functionality is working

  } catch (err) {
    console.error('loadDashboardMetrics', err);
  }
}

/* ---------- MANAGE USERS ---------- */
/**
 * loadUsersTable(roleFilter, opts)
 * roleFilter = 'student'|'tutor'|'counsellor'|'' (all)
 * opts = { onlyPendingTutors: boolean }
 */
async function loadUsersTable(roleFilter = '', opts = {}) {
  try {
    const tbody = $('userTable');
    tbody.innerHTML = '<tr><td colspan="7">Loading users...</td></tr>';
    const usersCol = collection(db, 'users');
    let q;
    if (roleFilter) q = query(usersCol, where('role','==',roleFilter), orderBy('name','asc'));
    else q = query(usersCol, orderBy('name','asc'));
    const snap = await getDocs(q);
    let users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (opts.onlyPendingTutors) users = users.filter(u => u.role === 'tutor' && u.status === 'pending');

    if (users.length === 0) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty">No users found</div></td></tr>'; return; }

    // Create rows
    const rows = users.map(u => {
      const status = u.status || 'active';
      const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '-';
      const sessions = u.totalSessions || 0;
      const rating = u.avgRating ? Number(u.avgRating).toFixed(2) : (u.role === 'tutor' ? '—' : '-');
      return `<tr data-id="${u.id}">
        <td>${escapeHtml(u.name || '')}</td>
        <td>${escapeHtml(u.role || '')}</td>
        <td>${escapeHtml(u.email || '')}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(lastLogin)}</td>
        <td>${escapeHtml(sessions)}</td>
        <td>${escapeHtml(rating)}</td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows;

    // attach click handlers (row-level actions open a small action modal)
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', async () => {
        const id = tr.dataset.id;
        const ud = users.find(x => x.id === id);
        openUserActionsModal(ud);
      });
    });

    // Add bulk action UI: (simple prompt-based)
    addUsersBulkControls(users);
  } catch (err) {
    console.error('loadUsersTable', err);
    $('userTable').innerHTML = '<tr><td colspan="7"><div class="empty">Failed to load users</div></td></tr>';
  }
}

/* bulk actions area (simple): place a floating toolbar for bulk operations */
function addUsersBulkControls(users) {
  // remove existing
  const existing = document.getElementById('bulkUsersToolbar');
  if (existing) existing.remove();
  if (!users || users.length === 0) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'bulkUsersToolbar';
  toolbar.style.position = 'fixed';
  toolbar.style.bottom = '20px';
  toolbar.style.left = '300px';
  toolbar.style.background = 'white';
  toolbar.style.padding = '10px';
  toolbar.style.borderRadius = '8px';
  toolbar.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
  toolbar.innerHTML = `
    <button id="bulkApproveTutors" class="btn">Approve Pending Tutors</button>
    <button id="bulkSuspendUsers" class="btn secondary">Suspend Selected</button>
    <button id="bulkExportCSV" class="btn">Export CSV</button>
  `;
  document.body.appendChild(toolbar);

  document.getElementById('bulkApproveTutors').onclick = async () => {
    if (!confirm('Approve all pending tutors?')) return;
    const usersCol = collection(db, 'users');
    const pending = users.filter(u => u.role === 'tutor' && u.status === 'pending');
    for (const u of pending) {
      await updateDoc(doc(db, 'users', u.id), { status: 'active', approvedAt: new Date().toISOString() });
    }
    alert(`Approved ${pending.length} tutors.`);
    await loadUsersTable();
  };

  document.getElementById('bulkSuspendUsers').onclick = async () => {
    const email = prompt('Enter comma-separated user emails to suspend (quick method)') || '';
    if (!email) return;
    const emails = email.split(',').map(s=>s.trim()).filter(Boolean);
    const usersCol = collection(db,'users');
    for (const em of emails) {
      const q = query(usersCol, where('email','==', em));
      const snap = await getDocs(q);
      snap.forEach(async d => {
        await updateDoc(doc(db,'users', d.id), { status: 'suspended' });
      });
    }
    alert('Requested suspend executed (if users found).');
    await loadUsersTable();
  };

  document.getElementById('bulkExportCSV').onclick = () => {
    const rows = [['Name','Role','Email','Status','Last Login','Sessions','Rating']];
    users.forEach(u => rows.push([u.name||'', u.role||'', u.email||'', u.status||'', u.lastLogin||'', u.totalSessions||0, u.avgRating||'']));
    exportToCSV('users-export.csv', rows);
  };
}

/* User actions modal (quick prompt based) */
function openUserActionsModal(u) {
  const modal = document.createElement('div'); modal.className = 'modal-back';
  modal.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(u.name || 'User')}</h3>
      <div style="margin-bottom:8px"><strong>Role:</strong> ${escapeHtml(u.role||'')}</div>
      <div style="margin-bottom:8px"><strong>Email:</strong> ${escapeHtml(u.email||'')}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button id="actApprove" class="btn">Approve</button>
        <button id="actSuspend" class="btn secondary">Suspend</button>
        <button id="actResetPwd" class="btn">Reset Password (email)</button>
        <button id="actEdit" class="btn">Edit Info</button>
        <button id="actViewProfile" class="btn secondary">View Profile</button>
        <button id="actDelete" class="btn secondary">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#actApprove').onclick = async () => {
    try {
      await updateDoc(doc(db,'users', u.id), { status: 'active', approvedAt: new Date().toISOString() });
      alert('User approved.');
      modal.remove();
      await loadUsersTable();
    } catch (err) { console.error(err); alert('Failed to approve: '+err.message); }
  };
  modal.querySelector('#actSuspend').onclick = async () => {
    if (!confirm('Suspend this user?')) return;
    try {
      await updateDoc(doc(db,'users', u.id), { status: 'suspended' });
      alert('User suspended.');
      modal.remove();
      await loadUsersTable();
    } catch (err) { console.error(err); alert('Failed to suspend: '+err.message); }
  };
  modal.querySelector('#actResetPwd').onclick = async () => {
    try {
      await sendPasswordResetEmail(auth, u.email);
      alert('Password reset email sent to ' + u.email);
    } catch (err) { console.error(err); alert('Failed to send reset: '+err.message); }
  };
  modal.querySelector('#actEdit').onclick = async () => {
    modal.remove();
    openUserEditModal(u);
  };
  modal.querySelector('#actViewProfile').onclick = () => {
    alert(JSON.stringify(u, null, 2));
  };
  modal.querySelector('#actDelete').onclick = async () => {
    if (!confirm('Delete this user and all related data? This is irreversible.')) return;
    try {
      await deleteDoc(doc(db,'users', u.id));
      alert('User deleted (doc removed). You may need to remove auth account via Firebase console.');
      modal.remove();
      await loadUsersTable();
    } catch (err) { console.error(err); alert('Failed to delete: '+err.message); }
  };
}

/* User edit modal (basic fields) */
function openUserEditModal(u) {
  const modal = document.createElement('div'); modal.className = 'modal-back';
  modal.innerHTML = `
    <div class="modal">
      <h3>Edit ${escapeHtml(u.name || '')}</h3>
      <div>
        <label>Name</label><input id="editName" value="${escapeHtml(u.name||'')}" style="width:100%;margin-bottom:8px"/>
        <label>Role</label><input id="editRole" value="${escapeHtml(u.role||'')}" style="width:100%;margin-bottom:8px"/>
        <label>Department / Modules</label><input id="editDept" value="${escapeHtml(u.department||'')}" style="width:100%;margin-bottom:8px"/>
        <label>Status</label><select id="editStatus" style="width:100%;margin-bottom:8px"><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button id="saveUser" class="btn">Save</button>
          <button id="cancelUser" class="btn secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  $('#editStatus').value = u.status || 'active';

  $('#cancelUser').onclick = () => modal.remove();
  $('#saveUser').onclick = async () => {
    const payload = {
      name: $('#editName').value.trim(),
      role: $('#editRole').value.trim(),
      department: $('#editDept').value.trim(),
      status: $('#editStatus').value
    };
    try {
      await setDoc(doc(db,'users', u.id), payload, { merge: true });
      alert('User saved.');
      modal.remove();
      await loadUsersTable();
    } catch (err) { console.error(err); alert('Failed to save: '+err.message); }
  };
}

