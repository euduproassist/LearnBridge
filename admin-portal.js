// admin-portal.js
// Firebase-backed Admin Portal Logic for LearnBridge University System

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, orderBy, limit, onSnapshot,
  getCountFromServer, writeBatch, startAt, endAt, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* -------------------------------------------
 * 1. Small DOM Helpers
 * ------------------------------------------- */
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) el.classList.remove('hidden'); };
const hide = id => { const el = $(id); if (el) el.classList.add('hidden'); };

/**
 * Sets the active state for a sidebar menu item.
 * @param {string} id - The ID of the menu <li> element.
 */
const setActiveMenu = (id) => {
  document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
};

/**
 * Creates a DOM element with attributes and optional inner HTML.
 * @param {string} tag - The tag name (e.g., 'div', 'button').
 * @param {Object} [attrs={}] - Attributes to assign to the element.
 * @param {string} [html=''] - Inner HTML content.
 * @returns {HTMLElement} The created element.
 */
const elCreate = (tag, attrs = {}, html = '') => { 
  const e = document.createElement(tag); 
  Object.assign(e, attrs); 
  if (html) e.innerHTML = html; 
  return e; 
};

/**
 * Sanitizes string for safe HTML insertion.
 * @param {string} s - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(s) { 
  if (s === undefined || s === null) return ''; 
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&quot;',"'":'&#39;'}[c])); 
}

/* -------------------------------------------
 * 2. Global State & Initialization
 * ------------------------------------------- */
const STATE = {
  uid: null,
  profile: null,
  isLoaded: false,
};

// List of all section IDs for easy toggling
const ALL_SECTION_IDS = [
  'dashboardSection', 'manageUsersSection', 'sessionManagementSection', 
  'bookingRequestsSection', 'issuesReportsSection', 'ratingsAnalyticsSection', 
  'universitySettingsSection', 'notificationsControlSection', 'reportsAuditSection', 
  'adminProfileSection'
];

/**
 * Handles all navigation and visibility logic.
 * @param {string} idToShow - The ID of the section to show (e.g., 'dashboardSection').
 */
function showSection(idToShow) {
  ALL_SECTION_IDS.forEach(s => {
    const el = $(s);
    if (!el) return;
    el.classList.toggle('hidden', s !== idToShow);
  });
  
  // Re-hide empty states until data fetch confirms emptiness
  ['userEmpty', 'sessionEmpty', 'requestsEmpty', 'issuesEmpty', 'auditLogEmpty'].forEach(hide);

  // Trigger specific load function after showing section
  switch(idToShow) {
    case 'dashboardSection':
      loadDashboardMetrics();
      break;
    case 'manageUsersSection':
      loadAllUsers();
      break;
    case 'sessionManagementSection':
      loadAllSessions();
      break;
    case 'bookingRequestsSection':
      loadAllPendingRequests();
      break;
    case 'issuesReportsSection':
      loadAllIssues();
      break;
    case 'ratingsAnalyticsSection':
      loadOverallAnalytics();
      break;
    case 'universitySettingsSection':
      loadUniversitySettings();
      loadSystemPolicies(); // <-- Added policy load from previous fix
      break;
    case 'notificationsControlSection': // <-- NEW: Now loads notification history
      loadNotificationHistory();
      break;
    case 'reportsAuditSection': // <-- NEW: Now loads audit logs
      loadAuditLogs();
      break;
    case 'adminProfileSection':
      loadAdminProfile(STATE.uid);
      break;
  }
}


/* -------------------------------------------
 * 3. Authentication & Entry
 * ------------------------------------------- */

// Listener to check authentication state on page load
onAuthStateChanged(auth, async user => {
  if (!user) {
    // If not signed in, redirect to the login page (assuming 'index.html' is login)
    window.location.href = 'index.html'; 
    return;
  }

  STATE.uid = user.uid;
  if (!STATE.isLoaded) {
    await initAdminPortal(user.uid);
    STATE.isLoaded = true;
  }
});

/**
 * Initializes the portal by fetching profile, wiring menus, and loading initial data.
 * @param {string} uid - The Firebase User ID.
 */
async function initAdminPortal(uid) {
  console.log('Admin Portal Initializing for UID:', uid);
  
  // --- 3.1. Menu Wiring ---
  // Using generic click handlers defined in the HTML script block, but we re-wire the logout button.
  $('menuLogout').onclick = async () => { 
    if (!confirm('Are you sure you want to sign out?')) return; 
    try {
      await signOut(auth); 
      window.location.href = 'index.html'; // Redirect to login
    } catch (err) {
      console.error('Logout failed:', err);
      alert('Logout failed. Please try again.');
    }
  };

  // --- 3.2. Quick Action Wiring ---
  $('quickApproveTutors').onclick = () => showSection('manageUsersSection');
  $('quickViewIssues').onclick = () => showSection('issuesReportsSection');
  $('quickManageModules').onclick = () => showSection('universitySettingsSection');
  $('quickSendAnnouncement').onclick = () => showSection('notificationsControlSection');
  $('quickOpenSettings').onclick = () => showSection('universitySettingsSection');
  $('quickAnalyticsPanel').onclick = () => showSection('ratingsAnalyticsSection');
  
  // --- 3.3. Initial Data Load & Display ---
  await loadAdminProfile(uid);
  await loadDashboardMetrics();
  
  // Default to Dashboard
  setActiveMenu('menuDashboard');
  showSection('dashboardSection');
  
  setupAllEventListeners(); // <--- FIX: This is the critical line that connects all buttons and filters!
}


/* -------------------------------------------
 * 4. Admin Profile Management
 * ------------------------------------------- */

/**
 * Loads the current Admin's profile and populates the profile section fields.
 * @param {string} uid - The Firebase User ID.
 */
async function loadAdminProfile(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const profile = snap.exists() ? snap.data() : null;
    
    // Crucial security check: If the user exists but is not an admin, log them out
    if (profile && profile.role !== 'admin') {
      alert("Access Denied: Your account role is not 'admin'.");
      await signOut(auth);
      return;
    }
    
    STATE.profile = profile || {};
    
    // Update main header info (Simplified DOM update)
    const displayName = profile?.name || 'Admin User';
    const headerElement = document.querySelector('.user-info');
    if (headerElement) {
        // Find the element displaying the name/role and update it
        // Assuming there is an element with class 'admin-display-name' in your header HTML.
        // If not, use the robust selector below:
        const span = headerElement.querySelector('span');
        if (span) {
             span.textContent = `Admin: ${displayName} • `;
        }
    }

    // Populate profile section
    if (profile) {
      $('adminName').value = profile.name || '';
      $('adminRole').value = profile.title || 'System Administrator';
      // Use the email from Firebase Auth, which is more reliable and up-to-date
      $('adminEmail').value = profile.email || (auth.currentUser && auth.currentUser.email) || '';
    }
  } catch (err) {
    console.error('loadAdminProfile failed', err);
  }
}

/**
 * Saves the Admin's profile changes (Name, Title, Email).
 */
async function saveAdminProfile() {
  const uid = STATE.uid;
  if (!uid) return alert('Error: Admin user not identified.');

  try {
    const payload = {
      name: $('adminName').value.trim(),
      title: $('adminRole').value.trim(),
      // The email field is read-only in the UI, but we include it in payload for completeness
      email: $('adminEmail').value.trim(), 
      // role should never be updated here, only title/name
      updatedAt: new Date().toISOString()
    };
    // Note: Email changes require Firebase Auth logic (updateEmail), handled separately.
    await updateDoc(doc(db, 'users', uid), payload);
    alert('Profile saved successfully.');
    await loadAdminProfile(uid); // Refresh display
  } catch (err) {
    console.error('saveAdminProfile failed', err);
    alert('Failed to save profile: ' + err.message);
  }
}
// Removed the redundant manual event listener at the end of the section.


/* -------------------------------------------
 * 5. Dashboard Loading and Metrics
 * ------------------------------------------- */


/**
 * Fetches and aggregates all core system metrics for the dashboard cards.
 */
async function loadDashboardMetrics() {
  try {
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)); // JavaScript Date Object for query comparison
    const endOfToday = new Date(new Date().setHours(23, 59, 59, 999)); // End of day

    // --- 5.1. User Counts ---
    const userRef = collection(db, 'users');
    const qStudents = query(userRef, where('role', '==', 'student'));
    const qStaff = query(userRef, where('role', 'in', ['tutor', 'counsellor']));
    
    // FIX: Using the JavaScript Date object directly for comparison
    const qNewToday = query(userRef, where('createdAt', '>=', startOfToday)); 
    const qPendingTutors = query(userRef, where('role', '==', 'tutor'), where('status', '==', 'pending'));
    
    const [snapStudents, snapStaff, snapNewToday, snapPendingTutors] = await Promise.all([
      getCountFromServer(qStudents),
      getCountFromServer(qStaff),
      getCountFromServer(qNewToday),
      getCountFromServer(qPendingTutors)
    ]);
    
    // Update dashboard cards
    $('totalStudents').textContent = snapStudents.data().count;
    $('totalStaff').textContent = snapStaff.data().count;
    $('newSignupsToday').textContent = snapNewToday.data().count;
    $('pendingApprovals').textContent = snapPendingTutors.data().count;
    // Update quick action button badge
    document.querySelector('#quickApproveTutors span').textContent = snapPendingTutors.data().count;

    // --- 5.2. Session Counts ---
    const sessionsRef = collection(db, 'sessions');
    const qPendingBookings = query(sessionsRef, where('status', '==', 'pending'));
    
    // FIX: Using Date objects for 'datetime' comparisons
    // IMPORTANT: This query requires a composite index on (datetime, status)
    const qSessionsToday = query(sessionsRef, 
      where('datetime', '>=', startOfToday), 
      where('datetime', '<', endOfToday), 
      where('status', 'in', ['approved', 'in-progress'])
    );
    const qLiveSessions = query(sessionsRef, where('status', '==', 'in-progress'));
    
    const [snapPendingBookings, snapSessionsToday, snapLiveSessions] = await Promise.all([
        getCountFromServer(qPendingBookings),
        getCountFromServer(qSessionsToday),
        getCountFromServer(qLiveSessions)
    ]);

    // Update dashboard cards
    $('pendingBookings').textContent = snapPendingBookings.data().count;
    $('sessionsToday').textContent = snapSessionsToday.data().count;
    $('liveSessions').textContent = snapLiveSessions.data().count;

    // --- 5.3. Issues & Reports ---
    const issuesRef = collection(db, 'issues');
    // FIX: Using Date object for 'createdAt' comparison
    const qIssuesToday = query(issuesRef, 
      where('createdAt', '>=', startOfToday),
      where('status', '==', 'open')
    );
    const snapIssuesToday = await getCountFromServer(qIssuesToday);
    
    // Update dashboard cards
    $('issuesToday').textContent = snapIssuesToday.data().count;
    // Update quick action button badge (using null check for safety)
    const quickIssuesBadge = document.querySelector('#quickViewIssues span');
    if (quickIssuesBadge) {
        quickIssuesBadge.textContent = snapIssuesToday.data().count;
    }

    // --- 5.4. Ratings ---
    const ratingsRef = collection(db, 'ratings');
    const snapRatings = await getDocs(query(ratingsRef));
    
    let totalRating = 0;
    let count = 0;
    snapRatings.forEach(d => {
      const data = d.data();
      if (data.stars && typeof data.stars === 'number') {
        totalRating += data.stars;
        count++;
      }
    });

    $('avgRating').textContent = count > 0 ? (totalRating / count).toFixed(2) : 'N/A';
    
  } catch (err) {
    console.error('loadDashboardMetrics failed', err);
    // Fallback: If Firebase fails, ensure all metrics show '-'
    ['totalStudents', 'totalStaff', 'newSignupsToday', 'pendingApprovals', 'pendingBookings', 'sessionsToday', 'liveSessions', 'issuesToday', 'avgRating'].forEach(id => {
      const el = $(id);
      if (el) el.textContent = '—';
    });
  }
}




/* -------------------------------------------
 * 6. User Management (Start of loadAllUsers)
 * ------------------------------------------- */
/**
 * Loads all users based on filters and renders the user table.
 */
async function loadAllUsers() {
  const container = $('userTableBody');
  const emptyEl = $('userEmpty');
  if (!container) return;
  container.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading user data...</td></tr>';
  hide('userEmpty');
  
  try {
    const userRef = collection(db, 'users');

    // --- Apply Filters ---
    const role = $('userFilterRole').value;
    const status = $('userFilterStatus').value;
    const search = $('userSearchInput').value.trim().toLowerCase();

    const queryConstraints = [];
    if (role) queryConstraints.push(where('role', '==', role));
    if (status) queryConstraints.push(where('status', '==', status));
    
    // Always enforce sorting, defaulting to name for table display.
    // NOTE: Requires a composite index for role/status combined with name.
    const sortOrder = orderBy('name', 'asc'); 

    // Build the final query
    let q = query(userRef, ...queryConstraints, sortOrder); 
    
    const snap = await getDocs(q);
    
    let users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // --- Client-Side Search (Temporary for name/email) ---
    if (search) {
        users = users.filter(u => 
            (u.name && u.name.toLowerCase().includes(search)) ||
            (u.email && u.email.toLowerCase().includes(search)) ||
            (u.ujId && u.ujId.toLowerCase().includes(search))
        );
    }

    if (users.length === 0) {
      container.innerHTML = '';
      show('userEmpty');
      return;
    }
    
    // Render the table
    renderUserTable(users, container);
    
  } catch (err) {
    console.error('loadAllUsers failed', err);
    container.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red;">Failed to load users.</td></tr>';
    show('userEmpty');
    if (emptyEl) emptyEl.textContent = 'Error loading user data.';
  }
}



/**
 * Renders the user list into the table body.
 * @param {Array<Object>} users - Array of user objects.
 * @param {HTMLElement} container - The tbody element.
 */
function renderUserTable(users, container) {
  container.innerHTML = '';
  
  users.forEach(u => {
    const isStaffPending = (u.role === 'tutor' || u.role === 'counsellor') && u.status === 'pending';
    const statusTagClass = {
      'active': 'approved', 
      'pending': 'pending', 
      'suspended': 'suspended'
    }[u.status] || 'secondary';

    const tr = elCreate('tr');
    tr.innerHTML = `
      <td><input type="checkbox" data-uid="${u.id}" data-role="${u.role}" ${isStaffPending ? '' : 'disabled'}></td>
      <td><strong>${escapeHtml(u.name || 'N/A')}</strong></td>
      <td>${escapeHtml(u.role || 'student')}</td>
      <td>${escapeHtml(u.email || '—')}</td>
      <td><span class="tag ${statusTagClass}">${escapeHtml(u.status || 'active')}</span></td>
      <td>${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}</td>
      <td>${u.totalSessions || 0}</td>
      <td>${u.avgRating || 'N/A'}</td>
      <td>
        <button class="btn secondary btn-sm view-user" data-uid="${u.id}">View/Edit</button>
        ${isStaffPending ? `<button class="btn btn-sm approve-user" data-uid="${u.id}">Approve</button>` : ''}
      </td>
    `;
    container.appendChild(tr);
  });
  
  // Attach event listeners for row actions
  container.querySelectorAll('.view-user').forEach(btn => btn.onclick = (e) => handleViewEditUser(e.target.dataset.uid));
  container.querySelectorAll('.approve-user').forEach(btn => btn.onclick = (e) => handleApproveUser(e.target.dataset.uid));

  // Attach event listeners for bulk actions
  setupBulkActionHandlers(container);
}




/* -------------------------------------------
 * 7. User Management: Bulk Actions
 * ------------------------------------------- */

function setupBulkActionHandlers(container) {
    const selectAll = $('selectAllUsers');
    const bulkApproveBtn = $('bulkApproveBtn');
    const bulkSuspendBtn = $('bulkSuspendBtn');
    
    const updateBulkButtons = () => {
        const selected = container.querySelectorAll('input[type="checkbox"]:checked');
        const selectedTutors = container.querySelectorAll('input[type="checkbox"][data-role="tutor"]:checked');
        const selectedCounsellors = container.querySelectorAll('input[type="checkbox"][data-role="counsellor"]:checked');
        const totalSelected = selected.length;
        
        // Count only selected Tutors/Counsellors for approval, and only if status is pending
        let pendingToApproveCount = 0;
        selected.forEach(cb => {
            if ((cb.dataset.role === 'tutor' || cb.dataset.role === 'counsellor') && cb.closest('tr').querySelector('.tag.pending')) {
                pendingToApproveCount++;
            }
        });
        
        bulkApproveBtn.textContent = `Bulk Approve Tutors (${pendingToApproveCount} selected)`;
        bulkSuspendBtn.textContent = `Bulk Suspend Users (${totalSelected} selected)`;
        
        bulkApproveBtn.disabled = pendingToApproveCount === 0;
        bulkSuspendBtn.disabled = totalSelected === 0;
    };
    
    // Initial check on render
    updateBulkButtons();

    // Checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.onchange = updateBulkButtons;
    });

    // Select All Toggle
    if (selectAll) {
        selectAll.onchange = () => {
            container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                if (!cb.disabled) {
                    cb.checked = selectAll.checked;
                }
            });
            updateBulkButtons();
        };
    }
    
    // Bulk Approve Listener
    bulkApproveBtn.onclick = async () => {
        const selected = container.querySelectorAll('input[type="checkbox"]:checked');
        const uidsToApprove = [];
        
        selected.forEach(cb => {
            // Re-check logic on click
            if ((cb.dataset.role === 'tutor' || cb.dataset.role === 'counsellor') && cb.closest('tr').querySelector('.tag.pending')) {
                uidsToApprove.push(cb.dataset.uid);
            }
        });

        if (uidsToApprove.length === 0) return alert('No pending staff members selected for approval.');
        if (!confirm(`Confirm approval for ${uidsToApprove.length} staff members?`)) return;

        try {
            const batch = writeBatch(db);
            uidsToApprove.forEach(uid => {
                const userRef = doc(db, 'users', uid);
                batch.update(userRef, { status: 'active', approvedBy: STATE.uid, approvedAt: new Date().toISOString() });
            });
            await batch.commit();
            alert(`${uidsToApprove.length} staff members approved.`);
            loadAllUsers(); // Refresh the list
            loadDashboardMetrics(); // Update dashboard counts
        } catch (err) {
            console.error('Bulk approval failed', err);
            alert('Failed to execute bulk approval: ' + err.message);
        }
    };

    // Bulk Suspend Listener
    bulkSuspendBtn.onclick = async () => {
        const selected = container.querySelectorAll('input[type="checkbox"]:checked');
        const uidsToSuspend = [];
        
        selected.forEach(cb => {
            uidsToSuspend.push(cb.dataset.uid);
        });

        if (uidsToSuspend.length === 0) return alert('No users selected for suspension.');
        if (!confirm(`WARNING: Confirm suspension for ${uidsToSuspend.length} users? This will disable their access.`)) return;

        try {
            const batch = writeBatch(db);
            uidsToSuspend.forEach(uid => {
                const userRef = doc(db, 'users', uid);
                batch.update(userRef, { status: 'suspended', suspendedBy: STATE.uid, suspendedAt: new Date().toISOString() });
            });
            await batch.commit();
            alert(`${uidsToSuspend.length} users suspended.`);
            loadAllUsers(); // Refresh the list
        } catch (err) {
            console.error('Bulk suspension failed', err);
            alert('Failed to execute bulk suspension: ' + err.message);
        }
    };
}

/* -------------------------------------------
 * 8. User Management: Single User Actions
 * ------------------------------------------- */

/**
 * Handles the approval of a single staff member.
 * @param {string} uid - The user ID to approve.
 */
async function handleApproveUser(uid) {
  if (!confirm('Confirm approval for this staff member?')) return;
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { status: 'active', approvedBy: STATE.uid, approvedAt: new Date().toISOString() });
    alert('Staff member approved successfully.');
    loadAllUsers();
    loadDashboardMetrics();
  } catch (err) {
    console.error('Approval failed', err);
    alert('Failed to approve user: ' + err.message);
  }
}

/**
 * Opens a modal to view and edit a single user's details.
 * @param {string} uid - The user ID to view/edit.
 */
async function handleViewEditUser(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return alert('User not found.');
    const user = { id: snap.id, ...snap.data() };
    
    // Create Modal
    const modal = elCreate('div', { className: 'modal-back' });
    modal.innerHTML = `
      <div class="modal" style="max-width:600px">
        <h3>Edit User: ${escapeHtml(user.name || user.email)}</h3>
        <p class="muted">Role: ${escapeHtml(user.role || 'N/A')}</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:15px">
          <label>Name: <input id="modalName" value="${escapeHtml(user.name || '')}"></label>
          <label>Email: <input id="modalEmail" value="${escapeHtml(user.email || '')}" disabled></label>
          <label>Role: 
            <select id="modalRole">
              <option value="student" ${user.role === 'student' ? 'selected' : ''}>Student</option>
              <option value="tutor" ${user.role === 'tutor' ? 'selected' : ''}>Tutor</option>
              <option value="counsellor" ${user.role === 'counsellor' ? 'selected' : ''}>Counsellor</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </label>
          <label>Status: 
            <select id="modalStatus">
              <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="pending" ${user.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
            </select>
          </label>
          <label>UJ ID: <input id="modalUjId" value="${escapeHtml(user.ujId || '')}"></label>
          <div id="staffDetails" style="border-top:1px solid #eee;padding-top:10px;margin-top:10px;">
            <label>Department: <input id="modalDept" value="${escapeHtml(user.department || '')}"></label>
            <label>Qualifications: <textarea id="modalQuals">${escapeHtml(user.qualifications || '')}</textarea></label>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end">
          <button class="btn secondary" id="modalCancel">Cancel</button>
          <button class="btn danger" id="modalSuspend" data-uid="${uid}">Suspend</button>
          <button class="btn" id="modalSave" data-uid="${uid}">Save Changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Toggle staff details visibility based on role
    const staffDetailsEl = modal.querySelector('#staffDetails');
    const toggleStaffDetails = () => {
        const role = modal.querySelector('#modalRole').value;
        staffDetailsEl.style.display = (role === 'tutor' || role === 'counsellor' || role === 'admin') ? 'block' : 'none';
    };
    toggleStaffDetails();
    modal.querySelector('#modalRole').onchange = toggleStaffDetails;


    // Handlers
    modal.querySelector('#modalCancel').onclick = () => modal.remove();
    modal.querySelector('#modalSuspend').onclick = async () => {
      if (!confirm(`Are you sure you want to suspend ${user.name}?`)) return;
      await updateDoc(doc(db, 'users', uid), { status: 'suspended', suspendedBy: STATE.uid, suspendedAt: new Date().toISOString() });
      modal.remove();
      alert(`${user.name} suspended.`);
      loadAllUsers();
    };
    modal.querySelector('#modalSave').onclick = async () => {
      try {
        const newRole = modal.querySelector('#modalRole').value;
        const payload = {
          name: modal.querySelector('#modalName').value.trim(),
          role: newRole,
          status: modal.querySelector('#modalStatus').value,
          ujId: modal.querySelector('#modalUjId').value.trim(),
          updatedBy: STATE.uid,
          updatedAt: new Date().toISOString()
        };
        if (newRole === 'tutor' || newRole === 'counsellor' || newRole === 'admin') {
          payload.department = modal.querySelector('#modalDept').value.trim();
          payload.qualifications = modal.querySelector('#modalQuals').value.trim();
        }
        
        await updateDoc(doc(db, 'users', uid), payload);
        modal.remove();
        alert('User profile updated.');
        loadAllUsers();
        loadDashboardMetrics();
      } catch (err) {
        console.error('User update failed', err);
        alert('Failed to save user changes: ' + err.message);
      }
    };
  } catch (err) {
    console.error('handleViewEditUser failed', err);
    alert('Failed to load user data: ' + err.message);
  }
}

/* -------------------------------------------
 * 9. Session Management (All Sessions)
 * ------------------------------------------- */
/**
 * Loads all sessions based on filters and renders them in a list/table format.
 */
async function loadAllSessions() {
  const container = $('sessionList');
  const emptyEl = $('sessionEmpty');
  if (!container || !emptyEl) return;
  container.innerHTML = 'Loading all sessions...';
  hide('sessionEmpty');
  
  try {
    const sessionsRef = collection(db, 'sessions');
    
    // --- Apply Filters ---
    const statusFilter = $('sessionFilterStatus').value;
    const dateFilter = $('sessionFilterDate').value; // New: Get date filter value
    const search = $('sessionSearchInput').value.trim().toLowerCase(); // New: Get search input value

    const queryConstraints = [];
    if (statusFilter) queryConstraints.push(where('status', '==', statusFilter));
    
    // Date Filtering Logic
    const now = new Date();
    
    if (dateFilter === 'upcoming') {
        // Find sessions starting after the current moment
        // Requires a composite index on (status, datetime) if statusFilter is used.
        queryConstraints.push(where('datetime', '>=', now));
    } else if (dateFilter === 'past') {
        // Find sessions that have already occurred
        queryConstraints.push(where('datetime', '<', now));
    }
    
    // Default sorting by datetime. Use 'desc' for past, 'asc' for upcoming/default.
    const sortDirection = dateFilter === 'past' ? 'desc' : 'asc';

    // Rebuild the query with combined constraints
    let q = query(sessionsRef, ...queryConstraints, orderBy('datetime', sortDirection), limit(100));

    const snap = await getDocs(q);
    let sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // --- Client-Side Search (Temporary for name/module) ---
    if (search) {
        sessions = sessions.filter(s => 
            (s.studentName && s.studentName.toLowerCase().includes(search)) ||
            (s.personName && s.personName.toLowerCase().includes(search)) ||
            (s.module && s.module.toLowerCase().includes(search))
        );
    }
    
    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty">No sessions found based on filters.</div>';
      return;
    }

    container.innerHTML = '<table><thead><tr><th>Date/Time</th><th>Client</th><th>Staff</th><th>Service</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
    
    sessions.forEach(s => {
      const dt = s.datetime ? new Date(s.datetime) : null;
      const statusClass = s.status === 'approved' ? 'approved' : s.status === 'completed' ? 'secondary' : 'pending';
      
      const tr = elCreate('tr');
      tr.innerHTML = `
        <td>${dt ? dt.toLocaleString() : 'N/A'}</td>
        <td>${escapeHtml(s.studentName || 'Client')}</td>
        <td>${escapeHtml(s.personName || 'Staff')}</td>
        <td>${escapeHtml(s.module || s.course || 'General')}</td>
        <td><span class="tag ${statusClass}">${escapeHtml(s.status)}</span></td>
        <td>
          <button class="btn secondary btn-sm view-session" data-id="${s.id}">View</button>
          <button class="btn danger btn-sm delete-session" data-id="${s.id}">Delete</button>
        </td>
      `;
      container.querySelector('tbody').appendChild(tr);
    });
    container.innerHTML += '</tbody></table>';

    // Handlers
    container.querySelectorAll('.view-session').forEach(btn => btn.onclick = (e) => handleViewSession(e.target.dataset.id));
    container.querySelectorAll('.delete-session').forEach(btn => btn.onclick = (e) => handleDeleteSession(e.target.dataset.id));
  
  } catch (err) {
    console.error('loadAllSessions failed', err);
    container.innerHTML = '<div class="empty">Failed to load session data.</div>';
  }
}


/**
 * Handles viewing session details (e.g., opens a modal).
 * @param {string} sessionId - The session ID.
 */
async function handleViewSession(sessionId) {
  try {
    const snap = await getDoc(doc(db, 'sessions', sessionId));
    if (!snap.exists()) return alert('Session not found.');
    const s = snap.data();
    
    alert(`Session Details:\n\nClient: ${s.studentName}\nStaff: ${s.personName}\nService: ${s.module}\nDate: ${new Date(s.datetime).toLocaleString()}\nStatus: ${s.status}\nNotes: ${s.notes || 'N/A'}`);
  } catch (err) {
    console.error('View session failed', err);
    alert('Failed to fetch session details.');
  }
}

/**
 * Handles deleting a session.
 * @param {string} sessionId - The session ID.
 */
async function handleDeleteSession(sessionId) {
  if (!confirm('WARNING: Permanently delete this session? This action is irreversible.')) return;
  try {
    await deleteDoc(doc(db, 'sessions', sessionId));
    alert('Session deleted.');
    loadAllSessions();
    loadDashboardMetrics();
  } catch (err) {
    console.error('Delete session failed', err);
    alert('Failed to delete session: ' + err.message);
  }
}


/* -------------------------------------------
 * 10. Booking Requests (All Pending)
 * ------------------------------------------- */

/**
 * Loads all pending booking requests for all staff.
 */
async function loadAllPendingRequests() {
  const container = $('pendingRequestsList'); 
  if (!container) return;
  container.innerHTML = 'Loading all pending requests...';

  try {
    const sessionsRef = collection(db, 'sessions');
    // Query for status 'pending' or 'suggested' across all staff
    const q = query(sessionsRef, where('status', 'in', ['pending', 'suggested']), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (requests.length === 0) {
      container.innerHTML = '<div class="empty">No active pending booking requests.</div>';
      return;
    }

    container.innerHTML = requests.map(req => {
        const dtDisplay = req.datetime ? new Date(req.datetime).toLocaleString() : '—';
        const statusBadge = req.status === 'suggested' ? `<span class="badge" style="background:orange">Staff Suggested Time</span>` : `<span class="badge">Awaiting Staff Approval</span>`;
        const staffName = req.personName || 'N/A';
        const clientName = req.studentName || 'Client';

        return `
            <div class="profile-card" style="margin-bottom:12px;border-left:3px solid var(--pending-color);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>${escapeHtml(clientName)}</strong> requesting ${escapeHtml(req.module || 'Service')} with <strong>${escapeHtml(staffName)}</strong>
                        <div class="muted" style="font-size:12px;">Requested: ${new Date(req.createdAt).toLocaleString()}</div>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                <div style="margin-top:8px;">Appointment Time: <strong>${escapeHtml(dtDisplay)}</strong> (${escapeHtml(req.mode||'—')})</div>
                ${req.suggestedTime ? `<div style="color:orange">Suggested Time: <strong>${new Date(req.suggestedTime).toLocaleString()}</strong></div>` : ''}
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <button class="btn btn-sm admin-approve-req" data-id="${req.id}">Admin Approve</button>
                    <button class="btn secondary btn-sm admin-reject-req" data-id="${req.id}">Admin Reject</button>
                    <button class="btn secondary btn-sm admin-view-details" data-id="${req.id}">Details</button>
                </div>
            </div>
        `;
    }).join('');

    // Handlers
    container.querySelectorAll('.admin-approve-req').forEach(btn => btn.onclick = (e) => handleAdminApproveRequest(e.target.dataset.id));
    container.querySelectorAll('.admin-reject-req').forEach(btn => btn.onclick = (e) => handleAdminRejectRequest(e.target.dataset.id));
    container.querySelectorAll('.admin-view-details').forEach(btn => btn.onclick = (e) => handleViewSession(e.target.dataset.id));

  } catch (err) {
    console.error('loadAllPendingRequests failed', err);
    container.innerHTML = '<div class="empty">Failed to load booking requests.</div>';
  }
}

/**
 * Admin forces the approval of a booking request.
 * @param {string} reqId - The session ID to approve.
 */
async function handleAdminApproveRequest(reqId) {
  if (!confirm('Admin Override: Forcefully approve this request?')) return;
  try {
    await updateDoc(doc(db, 'sessions', reqId), { 
      status: 'approved', 
      approvedByAdmin: STATE.uid,
      approvedAt: new Date().toISOString(),
      suggestedTime: null // Clear any pending suggestions
    });
    alert('Request approved by Admin.');
    loadAllPendingRequests();
    loadDashboardMetrics();
  } catch (err) {
    console.error('Admin approval failed', err);
    alert('Failed to approve request: ' + err.message);
  }
}

/**
 * Admin forces the rejection of a booking request.
 * @param {string} reqId - The session ID to reject.
 */
async function handleAdminRejectRequest(reqId) {
  if (!confirm('Admin Override: Forcefully reject this request?')) return;
  try {
    await updateDoc(doc(db, 'sessions', reqId), { 
      status: 'rejected', 
      rejectedByAdmin: STATE.uid,
      rejectedAt: new Date().toISOString()
    });
    alert('Request rejected by Admin.');
    loadAllPendingRequests();
    loadDashboardMetrics();
  } catch (err) {
    console.error('Admin rejection failed', err);
    alert('Failed to reject request: ' + err.message);
  }
}


/* -------------------------------------------
 * 11. Issues and Reports
 * ------------------------------------------- */

/**
 * Loads all open and closed issues/reports.
 */
async function loadAllIssues() {
  const container = $('issuesReportsList'); // Assuming you have a specific list container within the section
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;">Loading issues and reports...</div>';
  hide('issuesEmpty');

  try {
    const issuesRef = collection(db, 'supportTickets');
    let q = query(issuesRef, orderBy('createdAt', 'desc'), limit(50));
    
    // Apply Filter (e.g., status, priority)
    const statusFilter = $('issueFilterStatus').value || 'open';
    
    // Ensure the query is rebuilt correctly if a filter is applied
    const queryConstraints = [];
    if (statusFilter !== 'all') {
        queryConstraints.push(where('status', '==', statusFilter));
    }
    
    // Rebuild the query
    q = query(issuesRef, ...queryConstraints, orderBy('createdAt', 'desc'), limit(50));

    const snap = await getDocs(q);
    const issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (issues.length === 0) {
      container.innerHTML = '<div class="empty">No issues found matching the filter.</div>';
      return;
    }

    // Render the list using profile-card structure
    container.innerHTML = issues.map(issue => {
        const priorityClass = issue.priority === 'High' ? 'danger' : issue.priority === 'Medium' ? 'warning' : 'secondary';
        const reporterRole = issue.role || 'N/A';
        const statusTag = issue.status === 'open' ? `<span class="tag pending">Open</span>` : `<span class="tag approved">Closed</span>`;
        
        return `
            <div class="profile-card" style="margin-bottom:12px;border-left:3px solid var(--${priorityClass}-color);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>${escapeHtml(issue.title || 'No Title')}</strong>
                        <div class="muted" style="font-size:12px;">Category: ${escapeHtml(issue.category || 'General')} • Reported by: ${escapeHtml(reporterRole)}</div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <span class="tag ${priorityClass}">${escapeHtml(issue.priority || 'Low')} Priority</span>
                        ${statusTag}
                    </div>
                </div>
                <p style="margin-top:8px;padding-left:10px;border-left:2px solid #eee;">${escapeHtml(previewDesc)}</p>
                <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
                    <button class="btn secondary btn-sm view-issue" data-id="${issue.id}">View Details</button>
                    ${issue.status === 'open' ? `<button class="btn btn-sm close-issue" data-id="${issue.id}">Mark Closed</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Handlers
    container.querySelectorAll('.view-issue').forEach(btn => btn.onclick = (e) => handleViewIssue(e.target.dataset.id));
    container.querySelectorAll('.close-issue').forEach(btn => btn.onclick = (e) => handleCloseIssue(e.target.dataset.id));

  } catch (err) {
    console.error('loadAllIssues failed', err);
    container.innerHTML = '<div class="empty">Failed to load issues.</div>';
  }
}


/**
 * Handles viewing issue details (opens a modal).
 * @param {string} issueId - The issue ID.
 */
async function handleViewIssue(issueId) {
  try {
    const snap = await getDoc(doc(db, 'issues', issueId));
    if (!snap.exists()) return alert('Issue not found.');
    const issue = snap.data();
    
    alert(`Issue Details:\n\nTitle: ${issue.title}\nDescription: ${issue.description}\nPriority: ${issue.priority}\nStatus: ${issue.status}\nReported: ${new Date(issue.createdAt).toLocaleString()}\nReporter Role: ${issue.role}`);
  } catch (err) {
    console.error('View issue failed', err);
    alert('Failed to fetch issue details.');
  }
}

/**
 * Marks an issue as closed.
 * @param {string} issueId - The issue ID.
 */
async function handleCloseIssue(issueId) {
  if (!confirm('Mark this issue as closed?')) return;
  try {
    await updateDoc(doc(db, 'issues', issueId), { 
      status: 'closed', 
      closedBy: STATE.uid,
      closedAt: new Date().toISOString()
    });
    alert('Issue marked as closed.');
    loadAllIssues();
    loadDashboardMetrics();
  } catch (err) {
    console.error('Closing issue failed', err);
    alert('Failed to close issue: ' + err.message);
  }
}



/* -------------------------------------------
 * 12. Ratings and Analytics
 * ------------------------------------------- */
/**
 * Loads overall system analytics and displays charts/summaries.
 */
async function loadOverallAnalytics() {
  // FIX: Use a specific ID for robustness. Assuming the content area has id="analyticsContent"
  const container = $('analyticsContent'); 
  if (!container) return;
  container.innerHTML = 'Calculating system analytics...';

  try {
    // --- Data Aggregation ---
    const [ratingsSnap, sessionsSnap] = await Promise.all([
      getDocs(collection(db, 'ratings')),
      getDocs(collection(db, 'sessions'))
    ]);
    
    // 12.1. Rating Distribution
    let ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRatings = 0;
    ratingsSnap.forEach(d => {
      const stars = Number(d.data().stars);
      if (stars >= 1 && stars <= 5) {
        ratingCounts[stars]++;
        totalRatings++;
      }
    });
    
    // 12.2. Session Status Distribution
    let sessionStatusCounts = { approved: 0, completed: 0, pending: 0, rejected: 0, cancelled: 0, 'in-progress': 0 };
    let totalSessions = 0;
    sessionsSnap.forEach(d => {
      const status = d.data().status;
      if (sessionStatusCounts.hasOwnProperty(status)) {
        sessionStatusCounts[status]++;
      }
      totalSessions++;
    });

    // 12.3. Top 5 Tutors/Counsellors by Sessions 
    const staffSessionMap = {};
    sessionsSnap.forEach(d => {
        const personId = d.data().personId;
        // Only count sessions that are approved or completed
        if (personId && (d.data().status === 'approved' || d.data().status === 'completed' || d.data().status === 'in-progress')) {
            staffSessionMap[personId] = (staffSessionMap[personId] || 0) + 1;
        }
    });
    const topStaff = Object.entries(staffSessionMap)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 5);
    
    // --- Rendering ---
    container.innerHTML = `
      <h4>Overall System Performance</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:15px;">
        <div class="card">
          <h5>Session Status Distribution (Total: ${totalSessions})</h5>
          <ul class="clean-list">
            ${Object.entries(sessionStatusCounts).map(([status, count]) => `
              <li>${status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}: ${count} (${((count / totalSessions) * 100 || 0).toFixed(1)}%)</li>
            `).join('')}
          </ul>
        </div>
        <div class="card">
          <h5>Rating Distribution (Total: ${totalRatings})</h5>
          <ul class="clean-list">
            ${Object.entries(ratingCounts).map(([star, count]) => `
              <li>${star} Star: ${count} (${((count / totalRatings) * 100 || 0).toFixed(1)}%)</li>
            `).join('')}
          </ul>
        </div>
      </div>
      <div class="card" style="margin-top:20px;">
        <h5>Top 5 Busiest Staff Members (by session count)</h5>
        <div id="topStaffList">Loading staff names...</div>
      </div>
    `;

    // Fetch staff names for the top list
    const topStaffListEl = $('topStaffList');
    const staffPromises = topStaff.map(async ([id, count]) => {
      const staffSnap = await getDoc(doc(db, 'users', id));
      const staffData = staffSnap.exists() ? staffSnap.data() : {};
      const name = staffData.name || `Unknown Staff (${id})`;
      const role = staffData.role || 'N/A';
      return `<li>${escapeHtml(name)} (${escapeHtml(role)}): ${count} Sessions</li>`; // Added role for clarity
    });
    topStaffListEl.innerHTML = `<ul class="clean-list">${(await Promise.all(staffPromises)).join('')}</ul>`;

  } catch (err) {
    console.error('loadOverallAnalytics failed', err);
    container.innerHTML = '<div class="empty">Failed to load analytics data.</div>';
  }
}






/* -------------------------------------------
 * 13. University Settings (Modules/Departments)
 * ------------------------------------------- */

/**
 * Loads and renders the University Settings data (Departments, Modules).
 */
async function loadUniversitySettings() {
  const containerDept = $('departmentList');
  const containerModule = $('moduleList');
  if (!containerDept || !containerModule) return;
  containerDept.innerHTML = 'Loading departments...';
  containerModule.innerHTML = 'Loading modules...';

  try {
    // 13.1. Load Departments
    const deptSnap = await getDocs(query(collection(db, 'departments'), orderBy('name', 'asc')));
    const departments = deptSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    containerDept.innerHTML = departments.map(d => `
        <div class="setting-item">
            <span>${escapeHtml(d.name)}</span>
            <button class="btn secondary btn-sm edit-dept" data-id="${d.id}" data-name="${d.name}">Edit</button>
        </div>
    `).join('');
    containerDept.querySelectorAll('.edit-dept').forEach(btn => btn.onclick = (e) => handleEditDepartment(e.target.dataset.id, e.target.dataset.name));

    // 13.2. Load Modules (for simplicity, only show top 50)
    const moduleSnap = await getDocs(query(collection(db, 'modules'), orderBy('name', 'asc'), limit(50)));
    const modules = moduleSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    containerModule.innerHTML = modules.map(m => `
        <div class="setting-item">
            <span>${escapeHtml(m.name)} (${escapeHtml(m.code)}) - Dept: ${escapeHtml(m.department || 'N/A')}</span>
            <div style="display:flex;gap:5px;">
                <button class="btn secondary btn-sm edit-module" data-id="${m.id}" data-name="${m.name}" data-code="${m.code}">Edit</button>
                <button class="btn danger btn-sm delete-module" data-id="${m.id}">Delete</button>
            </div>
        </div>
    `).join('');
    containerModule.querySelectorAll('.edit-module').forEach(btn => btn.onclick = (e) => handleEditModule(e.target.dataset.id, e.target.dataset.name, e.target.dataset.code));
    // Delete module listener
    containerModule.querySelectorAll('.delete-module').forEach(btn => btn.onclick = (e) => handleDeleteModule(e.target.dataset.id));
    
    // NEW: Load System Policies after settings lists are done
    loadSystemPolicies();

  } catch (err) {
    console.error('loadUniversitySettings failed', err);
    containerDept.innerHTML = '<div class="empty">Failed to load departments.</div>';
    containerModule.innerHTML = '<div class="empty">Failed to load modules.</div>';
  }
}


/**
 * Handles adding a new department.
 */
async function handleAddDepartment() {
  const deptName = prompt('Enter new Department Name:');
  if (!deptName || deptName.trim() === '') return;
  try {
    await addDoc(collection(db, 'departments'), { name: deptName.trim(), createdAt: new Date().toISOString() });
    alert('Department added.');
    loadUniversitySettings();
  } catch (err) {
    console.error('Add department failed', err);
    alert('Failed to add department: ' + err.message);
  }
}

/**
 * Handles editing a department name (simple prompt modal).
 * @param {string} id - Department ID.
 * @param {string} currentName - Current name.
 */
async function handleEditDepartment(id, currentName) {
  const newName = prompt('Edit Department Name:', currentName);
  if (!newName || newName.trim() === currentName) return;
  try {
    await updateDoc(doc(db, 'departments', id), { name: newName.trim() });
    alert('Department name updated.');
    loadUniversitySettings();
  } catch (err) {
    console.error('Edit department failed', err);
    alert('Failed to update department: ' + err.message);
  }
}

/**
 * Handles adding a new module.
 */
async function handleAddModule() {
  const moduleName = prompt('Enter new Module Name:');
  const moduleCode = prompt('Enter new Module Code:');
  if (!moduleName || !moduleCode) return;
  try {
    await addDoc(collection(db, 'modules'), { 
      name: moduleName.trim(), 
      code: moduleCode.trim(), 
      createdAt: new Date().toISOString() 
    });
    alert('Module added.');
    loadUniversitySettings();
  } catch (err) {
    console.error('Add module failed', err);
    alert('Failed to add module: ' + err.message);
  }
}

/**
 * Handles editing a module (simple prompt modal).
 * @param {string} id - Module ID.
 * @param {string} currentName - Current name.
 * @param {string} currentCode - Current code.
 */
async function handleEditModule(id, currentName, currentCode) {
  const newName = prompt('Edit Module Name:', currentName);
  const newCode = prompt('Edit Module Code:', currentCode);
  if ((!newName && !newCode) || (newName === currentName && newCode === currentCode)) return;
  
  try {
    const payload = {};
    if (newName && newName !== currentName) payload.name = newName.trim();
    if (newCode && newCode !== currentCode) payload.code = newCode.trim();
    
    if (Object.keys(payload).length > 0) {
      await updateDoc(doc(db, 'modules', id), payload);
      alert('Module updated.');
      loadUniversitySettings();
    }
  } catch (err) {
    console.error('Edit module failed', err);
    alert('Failed to update module: ' + err.message);
  }
}
/**
 * Loads the global system policies (e.g., max booking time, admin emails)
 * and populates the settings form fields.
 */
async function loadSystemPolicies() {
  const policiesRef = doc(db, 'settings', 'policies');
  try {
    const snap = await getDoc(policiesRef);
    const policies = snap.exists() ? snap.data() : {};

    // Assuming form fields exist with these IDs in universitySettingsSection
    $('policyMaxBookingHours').value = policies.maxBookingHours || 2;
    $('policyMaxSessionsPerWeek').value = policies.maxSessionsPerWeek || 3;
    $('policyAdminContactEmail').value = policies.adminContactEmail || 'admin@university.ac.za';
    $('policyTutorAutoApprove').checked = !!policies.tutorAutoApprove;

  } catch (err) {
    console.error('loadSystemPolicies failed', err);
    alert('Failed to load system policies.');
  }
}

/**
 * Saves the updated system policies.
 */
async function saveSystemPolicies() {
  try {
    const policiesRef = doc(db, 'settings', 'policies');
    
    const payload = {
      maxBookingHours: Number($('policyMaxBookingHours').value),
      maxSessionsPerWeek: Number($('policyMaxSessionsPerWeek').value),
      adminContactEmail: $('policyAdminContactEmail').value.trim(),
      tutorAutoApprove: $('policyTutorAutoApprove').checked,
      updatedAt: new Date().toISOString(),
      updatedBy: STATE.uid
    };
    
    // Use setDoc with merge to create or update the policies document
    await setDoc(policiesRef, payload, { merge: true });
    alert('System Policies updated successfully.');
    loadSystemPolicies(); // Refresh
  } catch (err) {
    console.error('saveSystemPolicies failed', err);
    alert('Failed to save system policies: ' + err.message);
  }
}


/**
 * Handles deleting a Module.
 * NOTE: This is a critical action. Only include if necessary.
 * @param {string} id - Module ID.
 */
async function handleDeleteModule(id) {
    if (!confirm('WARNING: Delete this module? This cannot be undone and may break existing user data.')) return;
    try {
        await deleteDoc(doc(db, 'modules', id));
        alert('Module deleted successfully.');
        loadUniversitySettings();
    } catch (err) {
        console.error('Delete module failed', err);
        alert('Failed to delete module: ' + err.message);
    }
}
/* -------------------------------------------
 * 14. Notifications Control
 * ------------------------------------------- */

/**
 * Loads the history of sent notifications.
 */
async function loadNotificationHistory() {
  const container = $('notificationHistoryList');
  if (!container) return;
  container.innerHTML = 'Loading notification history...';

  try {
    const notificationsRef = collection(db, 'notifications');
    // Fetch the 50 most recent notifications sent
    const q = query(notificationsRef, orderBy('sentAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const history = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (history.length === 0) {
      container.innerHTML = '<div class="empty">No recent notification history found.</div>';
      return;
    }

    container.innerHTML = history.map(n => {
        const statusClass = n.status === 'sent' ? 'approved' : 'pending';
        const target = n.targetRole === 'all' ? 'All Users' : n.targetRole === 'students' ? 'Students Only' : n.targetRole === 'staff' ? 'Staff Only' : 'Specific Users';
        
        return `
            <div class="notification-item card-sm">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong>${escapeHtml(n.subject || 'No Subject')}</strong>
                    <span class="tag ${statusClass}">${escapeHtml(n.status || 'draft')}</span>
                </div>
                <div class="muted" style="font-size:12px;">Sent to: ${target} • Sent on: ${new Date(n.sentAt).toLocaleString()}</div>
                <p style="margin-top:8px;padding-left:10px;border-left:2px solid #eee;">${escapeHtml(n.body.substring(0, 80) + (n.body.length > 80 ? '...' : '') || 'No body.')}</p>
            </div>
        `;
    }).join('');

  } catch (err) {
    console.error('loadNotificationHistory failed', err);
    container.innerHTML = '<div class="empty">Failed to load notification history.</div>';
  }
}

/**
 * Sends a new system-wide announcement notification.
 */
async function sendSystemAnnouncement() {
  const subject = $('announcementSubject').value.trim();
  const body = $('announcementBody').value.trim();
  const targetRole = $('announcementTarget').value;
  
  if (!subject || !body) return alert('Subject and Body are required for the announcement.');
  if (!confirm(`Confirm sending this announcement to ${targetRole.toUpperCase()}?`)) return;

  try {
    await addDoc(collection(db, 'notifications'), { 
      subject,
      body,
      targetRole,
      sender: STATE.uid,
      sentAt: new Date().toISOString(),
      status: 'sent'
      // Note: A Firebase Cloud Function would typically handle the actual email/push dispatch here
    });
    alert(`Announcement sent to ${targetRole}.`);
    // Clear form and refresh history
    $('announcementSubject').value = '';
    $('announcementBody').value = '';
    loadNotificationHistory();

  } catch (err) {
    console.error('sendSystemAnnouncement failed', err);
    alert('Failed to send announcement: ' + err.message);
  }
}
/* -------------------------------------------
 * 15. Reports and Audit
 * ------------------------------------------- */

/**
 * Loads the history of critical administrative actions (Audit Logs).
 */
async function loadAuditLogs() {
  const container = $('auditLogTableBody');
  const emptyEl = $('auditLogEmpty');
  if (!container || !emptyEl) return;
  container.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading audit logs...</td></tr>';
  hide('auditLogEmpty');

  try {
    const auditRef = collection(db, 'audit_logs');
    // Fetch the 100 most recent logs, ordered by timestamp
    const q = query(auditRef, orderBy('timestamp', 'desc'), limit(100));
    const snap = await getDocs(q);
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (logs.length === 0) {
      container.innerHTML = '';
      show('auditLogEmpty');
      return;
    }

    container.innerHTML = logs.map(log => {
        const logClass = log.level === 'CRITICAL' ? 'danger' : log.level === 'WARNING' ? 'warning' : 'secondary';
        const adminName = log.adminName || 'Admin';
        
        return `
            <tr>
                <td><span class="tag ${logClass}">${escapeHtml(log.level)}</span></td>
                <td>${escapeHtml(log.action || 'N/A')}</td>
                <td>${escapeHtml(adminName)} (${escapeHtml(log.adminRole || 'Admin')})</td>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
            </tr>
        `;
    }).join('');

  } catch (err) {
    console.error('loadAuditLogs failed', err);
    container.innerHTML = '<tr><td colspan="4" style="text-align:center;color:red;">Failed to load audit logs.</td></tr>';
    show('auditLogEmpty');
  }
}

/**
 * Triggers the generation and download of a comprehensive report.
 * (Placeholder: In a real system, this would call a Cloud Function).
 */
function handleGenerateReport() {
    // Determine report type (e.g., from a select box in the UI)
    const reportType = $('reportTypeSelect').value; 
    
    if (!reportType) return alert('Please select a report type.');
    if (!confirm(`Start generation of the ${reportType} report? This may take time.`)) return;

    alert(`Generating report: ${reportType}. Please check your Admin email shortly.`);
    // Placeholder for actual API call to trigger report generation service
    console.log(`Report generation requested for: ${reportType}`);
}
/* -------------------------------------------
 * 16. Global Event Listeners (Final Wiring)
 * ------------------------------------------- */

/**
 * Wires up all primary menu, filter, and action buttons using their IDs.
 * This is called once during initAdminPortal().
 */
function setupAllEventListeners() {
    // --- Menu Navigation ---
    $('menuDashboard').onclick = () => { setActiveMenu('menuDashboard'); showSection('dashboardSection'); };
    $('menuManageUsers').onclick = () => { setActiveMenu('menuManageUsers'); showSection('manageUsersSection'); };
    $('menuSessionManagement').onclick = () => { setActiveMenu('menuSessionManagement'); showSection('sessionManagementSection'); };
    $('menuBookingRequests').onclick = () => { setActiveMenu('menuBookingRequests'); showSection('bookingRequestsSection'); };
    $('menuIssuesReports').onclick = () => { setActiveMenu('menuIssuesReports'); showSection('issuesReportsSection'); };
    $('menuRatingsAnalytics').onclick = () => { setActiveMenu('menuRatingsAnalytics'); showSection('ratingsAnalyticsSection'); };
    $('menuUniversitySettings').onclick = () => { setActiveMenu('menuUniversitySettings'); showSection('universitySettingsSection'); };
    $('menuNotificationsControl').onclick = () => { setActiveMenu('menuNotificationsControl'); showSection('notificationsControlSection'); };
    $('menuReportsAudit').onclick = () => { setActiveMenu('menuReportsAudit'); showSection('reportsAuditSection'); };
    $('menuAdminProfile').onclick = () => { setActiveMenu('menuAdminProfile'); showSection('adminProfileSection'); };
    
    // --- User Management Filters & Actions ---
    $('userFilterBtn').onclick = loadAllUsers;
    $('userSearchBtn').onclick = loadAllUsers;
    
    // --- Session Management Filters & Actions ---
    $('sessionFilterBtn').onclick = loadAllSessions;
    $('sessionSearchBtn').onclick = loadAllSessions;
    
    // --- Issues & Reports Filters ---
    $('issueFilterBtn').onclick = loadAllIssues;

    // --- Admin Profile Actions ---
    $('saveProfileBtn').onclick = saveAdminProfile;
    $('resetPasswordBtn').onclick = () => {
      if (auth.currentUser && confirm(`Send password reset link to ${auth.currentUser.email}?`)) {
        sendPasswordResetEmail(auth, auth.currentUser.email)
          .then(() => alert('Password reset link sent to your email.'))
          .catch(err => alert('Failed to send reset email: ' + err.message));
      }
    };
    
    // --- University Settings Actions ---
    $('addDepartmentBtn').onclick = handleAddDepartment;
    $('addModuleBtn').onclick = handleAddModule;
    $('savePoliciesBtn').onclick = saveSystemPolicies; // Ties the policy form button to the save function
    
    // --- Notifications Control Actions ---
    $('sendAnnouncementBtn').onclick = sendSystemAnnouncement;
    
    // --- Reports & Audit Actions ---
    $('generateReportBtn').onclick = handleGenerateReport;
}

// Ensure the functions are available in the console for debugging
window.loadAllUsers = loadAllUsers;
// Add other top-level functions to window object if required for external use


// --- END OF ADMIN PORTAL JAVASCRIPT ---
// This marks the approximate end of the 1000+ line Admin Portal file. 


