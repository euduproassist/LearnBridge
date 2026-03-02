import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, orderBy, deleteDoc, onSnapshot, updateDoc, writeBatch, limit, startAfter, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

// Check if user is logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const uid = user.uid;
        
        // Fetch User Data from Firestore
        try {
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                
                // 1. DYNAMIC GREETING: Sets the name from signup
                const firstName = userData.name ? userData.name.split(' ')[0] : 'Student';
                document.getElementById('display-name').textContent = `Hello, ${firstName}! `;
                
                // 2. DYNAMIC CAMPUS (Optional): Shows department or year if available
                if(userData.department) {
                    document.getElementById('display-campus').textContent = `(${userData.department})`;
                }
            }
        } catch (error) {
            console.error("Error fetching user name:", error);
        }
    } else {
        // Not logged in? Go back to login
        window.location.href = 'index.html';
    }
});

// Toggle between Grid and Tutor Explorer
document.getElementById('findTutorBtn').addEventListener('click', () => {
    document.getElementById('gridView').style.display = 'none';
    document.getElementById('tutorExplorerView').style.display = 'flex';
    loadTutors(); // Trigger the loading logic
});

document.getElementById('backToGridBtn').addEventListener('click', () => {
    document.getElementById('tutorExplorerView').style.display = 'none';
    document.getElementById('gridView').style.display = 'grid';
});


// --- Integrated Navigation Logic ---
const navItems = document.querySelectorAll('.nav-item');

navItems.forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault(); 
        const tabText = this.textContent.trim();
        
        // 1. UI Reset (Icons & Lines)
        navItems.forEach(nav => {
            nav.classList.remove('active');
            const icon = nav.querySelector('img');
            if (icon) icon.src = icon.src.replace('003057', '888888');
        });

        // 2. UI Activate
        this.classList.add('active');
        const activeIcon = this.querySelector('img');
        if (activeIcon) activeIcon.src = activeIcon.src.replace('888888', '003057');

        // 3. Trigger Modals based on text
        const badge = this.querySelector('.nav-badge');
        if (badge) badge.style.display = 'none'; // Clear notification when clicked

        if (tabText.includes('Support-tickets')) {
            document.getElementById('supportModal').style.display = 'flex';
            loadTicketHistory();
        } else if (tabText.includes('Ratings')) {
            document.getElementById('ratingsModal').style.display = 'flex';
            loadUserRatings();
        } else if (tabText.includes('Alerts')) {
            document.getElementById('alertsModal').style.display = 'flex';
            renderNotifications();
        } else if (tabText.includes('Inbox')) {
            document.getElementById('inboxModal').style.display = 'flex';
            openChatList();
        } else if (tabText.includes('My Bookings')) {
            document.getElementById('bookingsModal').style.display = 'flex';
            switchBookingTab('upcoming'); // Initial load
        } else if (tabText.includes('Profile')) {
            document.getElementById('profileModal').style.display = 'flex';
            loadProfileData();
        }
    });
});

// Close Modal
document.getElementById('closeSupportBtn').onclick = () => {
    document.getElementById('supportModal').style.display = 'none';
};

// Send Ticket to Firebase
document.getElementById('sendTicketBtn').onclick = async () => {
    const title = document.getElementById('sup_title').value.trim();
    const msg = document.getElementById('sup_message').value.trim();
    const prio = document.getElementById('sup_priority').value;
    const user = auth.currentUser;

    if (!title || !msg) return alert("Please fill in all fields");

    try {
        await addDoc(collection(db, 'supportTickets'), {
            studentId: user.uid,
            title: title,
            message: msg,
            priority: prio,
            status: 'open',
            createdAt: new Date().toISOString()
        });

        alert("Ticket sent to Admin!");
        document.getElementById('sup_title').value = '';
        document.getElementById('sup_message').value = '';
        loadTicketHistory();
    } catch (err) {
        console.error(err);
        alert("Failed to send ticket.");
    }
};

async function loadTicketHistory() {
    const historyDiv = document.getElementById('ticketHistory');
    const user = auth.currentUser;
    if (!user) return;

    try {
        const q = query(collection(db, 'supportTickets'), where('studentId', '==', user.uid), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            historyDiv.innerHTML = "No tickets yet.";
            return;
        }

        historyDiv.innerHTML = snap.docs.map(doc => {
            const t = doc.data();
            const color = t.status === 'open' ? '#003057' : '#003057';
            return `
                <div style="border-left:3px solid ${color}; padding:8px; margin-bottom:8px; background:#f9f9f9; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <b style="display:block;">${t.title}</b>
                        <small style="color:${color}">${t.status.toUpperCase()}</small>
                    </div>
                    <button onclick="deleteTicket('${doc.id}')" style="background:none; border:none; color:#003057; cursor:pointer; font-size:1.2rem; font-weight:bold; padding:0 5px;">&times;</button>
                </div>`;
        }).join('');
    } catch (e) {
        historyDiv.innerHTML = "Error loading history.";
    }
}

// --- Profile Logic ---

const avatars = [
    "https://img.icons8.com/fluency/48/student-male.png",
    "https://img.icons8.com/fluency/48/student-female.png",
    "https://img.icons8.com/fluency/48/user-male-circle.png",
    "https://img.icons8.com/fluency/48/university.png"
];
let selectedAvatarUrl = "";

async function loadProfileData() {
    const user = auth.currentUser;
    if (!user) return;

   // Reset fields to show fresh data is coming
    document.getElementById('prof_name').placeholder = "Loading...";

    // Build Avatar Picker
    const picker = document.getElementById('avatarPicker');
    picker.innerHTML = avatars.map(url => `
        <img src="${url}" onclick="selectAvatar('${url}')" style="width:40px; cursor:pointer; border-radius:50%; padding:2px; border: 2px solid transparent;" class="avatar-option">
    `).join('');

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
        const d = snap.data();
        document.getElementById('prof_name').value = d.name || "";
        document.getElementById('prof_year').value = d.year || "1";
        document.getElementById('prof_dept').value = d.department || "";
        document.getElementById('prof_course').value = d.course || "";
        if (d.profilePic) {
            document.getElementById('currentAvatar').src = d.profilePic;
            selectedAvatarUrl = d.profilePic;
        }
    }
}

// Global helper for the avatar picker (since it's injected HTML)
window.selectAvatar = (url) => {
    selectedAvatarUrl = url;
    document.getElementById('currentAvatar').src = url;
};

// Save Profile
document.getElementById('saveProfileBtn').onclick = async () => {
    const user = auth.currentUser;
    const payload = {
        name: document.getElementById('prof_name').value.trim(),
        year: document.getElementById('prof_year').value,
        department: document.getElementById('prof_dept').value.trim(),
        course: document.getElementById('prof_course').value.trim(),
        profilePic: selectedAvatarUrl
    };

    try {
        await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
        alert("Profile Updated!");
        location.reload(); // Refresh to update the "Hello" name on hub
    } catch (e) { alert("Error updating profile"); }
};

// Reset Password
document.getElementById('resetPassBtn').onclick = async () => {
    if(confirm("Send password reset email?")) {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        alert("Email sent!");
    }
};

// Logout
document.getElementById('logoutBtn').onclick = async () => {
    if(confirm("Are you sure you want to log out?")) {
        await signOut(auth);
    }
};

document.getElementById('closeProfileBtn').onclick = () => {
    document.getElementById('profileModal').style.display = 'none';
};

window.deleteTicket = async (ticketId) => {
    if (confirm("Delete this ticket record?")) {
        try {
            await deleteDoc(doc(db, 'supportTickets', ticketId));
            loadTicketHistory(); // Refresh the list
        } catch (err) {
            alert("Delete failed.");
        }
    }
};

// Close Ratings Modal
document.getElementById('closeRatingsBtn').onclick = () => {
    document.getElementById('ratingsModal').style.display = 'none';
};

// Search & Filter listeners
document.getElementById('rate_search_input').oninput = () => loadUserRatings();
document.getElementById('rate_filter_role').onchange = () => loadUserRatings();
document.getElementById('refreshRatingsBtn').onclick = () => loadUserRatings();

async function loadUserRatings() {
    const container = document.getElementById('ratingsListContainer');
    const user = auth.currentUser;
    if (!user) return;

    const searchText = document.getElementById('rate_search_input').value.toLowerCase();
    const roleFilter = document.getElementById('rate_filter_role').value;

    try {
        // Query the ratings where studentId matches current user
        const q = query(collection(db, 'ratings'), where('studentId', '==', user.uid), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        let ratings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Apply Client-Side Filtering (as suggested in evaluation)
        if (roleFilter) ratings = ratings.filter(r => r.role === roleFilter);
        if (searchText) ratings = ratings.filter(r => r.personName.toLowerCase().includes(searchText));

        if (ratings.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#999; margin-top:20px;">No ratings found.</div>`;
            return;
        }

        container.innerHTML = ratings.map(r => {
            const stars = "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
            return `
                <div style="background:#f8faff; border:1px solid #e1e8f5; border-radius:12px; padding:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:5px;">
                        <div>
                            <span style="display:block; font-weight:700; color:var(--primary-blue); font-size:0.9rem;">${r.personName}</span>
                            <small style="color:#888; text-transform:capitalize;">${r.role}</small>
                        </div>
                        <span style="color:#003057; font-size:0.9rem;">${stars}</span>
                    </div>
                    <p style="color:#555; font-size:0.8rem; line-height:1.4; font-style:italic;">"${r.comment || 'No comment provided.'}"</p>
                    <div style="text-align:right; margin-top:5px;">
                        <small style="color:#bbb; font-size:0.7rem;">${new Date(r.createdAt).toLocaleDateString()}</small>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div style="text-align:center; color:red; padding:20px;">Error loading ratings.</div>`;
    }
}

// --- MY BOOKINGS LOGIC (Upcoming & Pending) ---

let activeBookingTab = 'upcoming';

// Close Modal
document.getElementById('closeBookingsBtn').onclick = () => {
    document.getElementById('bookingsModal').style.display = 'none';
};

// Tab Click Handlers
document.getElementById('tabUpcoming').onclick = () => switchBookingTab('upcoming');
document.getElementById('tabPending').onclick = () => switchBookingTab('pending');

function switchBookingTab(tab) {
    activeBookingTab = tab;
    const upBtn = document.getElementById('tabUpcoming');
    const penBtn = document.getElementById('tabPending');

    if (tab === 'upcoming') {
        upBtn.style.background = '#003057'; upBtn.style.color = 'white';
        penBtn.style.background = 'transparent'; penBtn.style.color = '#000';
        loadUpcomingSessions();
    } else {
        penBtn.style.background = '#003057'; penBtn.style.color = 'white';
        upBtn.style.background = 'transparent'; upBtn.style.color = '#000';
        loadPendingRequests();
    }
}

async function loadUpcomingSessions() {
    const container = document.getElementById('bookingsListContainer');
    const user = auth.currentUser;
    container.innerHTML = `<div style="text-align:center; padding:20px; color:#000;">Loading confirmed sessions...</div>`;

    try {
        // Query for APPROVED sessions only
        const q = query(collection(db, 'sessions'), 
            where('studentId', '==', user.uid), 
            where('status', '==', 'approved'),
            orderBy('datetime', 'asc'));
        
        const snap = await getDocs(q);
        const now = new Date();

        // Filter out past sessions locally if necessary
        const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                                  .filter(s => new Date(s.datetime) >= now);

        if (sessions.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#999; margin-top:30px;">No upcoming sessions found.</div>`;
            return;
        }

        container.innerHTML = sessions.map(s => `
            <div style="background:#fff; border:1px solid #e1e8f5; border-left:5px solid var(--primary-blue); border-radius:12px; padding:15px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <b style="color:var(--primary-blue); display:block; font-size:1rem;">${s.personName}</b>
                        <small style="color:#000; text-transform:uppercase; letter-spacing:0.5px;">${s.role}</small>
                    </div>
                    <span style="background:var(--primary-blue); color:white; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:700;">CONFIRMED</span>
                </div>
                <div style="margin-top:10px; font-size:0.85rem; color:#444;">
                    <div>📅 ${new Date(s.datetime).toLocaleDateString()} at ${new Date(s.datetime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    <div style="margin-top:4px;">📍 Location: <b>${s.venue || s.mode || 'TBA'}</b></div>
                </div>
                <div style="margin-top:12px; display:flex; gap:8px;">
                    <button onclick="cancelBooking('${s.id}')" style="flex:1; background:#fff; color:#000; border:1px solid #003057; padding:8px; border-radius:8px; font-size:0.75rem; cursor:pointer; font-weight:600;">Cancel</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="color:red; text-align:center;">Error loading sessions.</div>`;
    }
}

async function loadPendingRequests() {
    const container = document.getElementById('bookingsListContainer');
    const user = auth.currentUser;
    container.innerHTML = `<div style="text-align:center; padding:20px; color:#000;">Checking request status...</div>`;

    try {
        const q = query(collection(db, 'sessions'), 
            where('studentId', '==', user.uid), 
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc'));
        
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `<div style="text-align:center; color:#999; margin-top:30px;">No pending requests.</div>`;
            return;
        }

        container.innerHTML = snap.docs.map(doc => {
            const s = doc.data();
            const slots = s.preferredSlots || [];
            return `
                <div style="background:#fff; border:1px solid #e1e8f5; border-left:5px solid var(--primary-blue); border-radius:12px; padding:15px; margin-bottom:12px;">
                    <b style="color:var(--primary-blue); font-size:1rem;">Request to: ${s.personName}</b>
                    <p style="font-size:0.75rem; color:#000; margin-bottom:8px;">Waiting for tutor to pick a slot...</p>
                    <div style="background:#fcfcfc; border:1px solid #f0f0f0; padding:10px; border-radius:8px;">
                        <span style="font-size:0.7rem; font-weight:700; color:#000; display:block; margin-bottom:5px;">YOUR PROPOSED TIMES:</span>
                        ${slots.map(t => `<div style="font-size:0.75rem; color:#000;">• ${new Date(t).toLocaleString([], {dateStyle:'medium', timeStyle:'short'})}</div>`).join('')}
                    </div>
                    <button onclick="cancelBooking('${doc.id}')" style="width:100%; margin-top:12px; background:var(--primary-blue); border:none; padding:8px; border-radius:8px; font-size:0.75rem; cursor:pointer; color:white;">Withdraw Request</button>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div style="color:red; text-align:center;">Error loading requests.</div>`;
    }
}

window.cancelBooking = async (id) => {
    if (confirm("Are you sure you want to cancel this booking/request?")) {
        try {
            // We use deleteDoc to keep the DB clean, or updateDoc status to 'cancelled'
            await deleteDoc(doc(db, 'sessions', id));
            switchBookingTab(activeBookingTab); // Refresh current view
        } catch (e) {
            alert("Action failed. Please try again.");
        }
    }
};

// --- NOTIFICATIONS LOGIC ---
let allNotifications = [];
let currentPage = 1;
const itemsPerPage = 10;

// 1. Real-time Listener for the Badge & Data
function startNotificationListener() {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        allNotifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Update Badge Count
        const unreadCount = allNotifications.filter(n => !n.read).length;
        const badge = document.querySelector('.nav-badge');
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        
        // If modal is open, refresh the view
        if (document.getElementById('alertsModal').style.display === 'flex') {
            renderNotifications();
        }
    });
}

// Ensure listener starts when user logs in
onAuthStateChanged(auth, (user) => {
    if (user) startNotificationListener();
});

function renderNotifications() {
    const container = document.getElementById('alertsListContainer');
    const pageDisplay = document.getElementById('pageInfo');
    
    const totalPages = Math.ceil(allNotifications.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = allNotifications.slice(start, end);

    pageDisplay.textContent = `Page ${currentPage} of ${totalPages}`;

    if (allNotifications.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#999;">No notifications yet.</div>`;
        return;
    }

    container.innerHTML = paginatedItems.map(n => {
        // Unread items get a light blue background, read items are white
        const bgColor = n.read ? '#ffffff' : '#f0f7ff';
        const borderStatus = n.read ? '1px solid #eee' : '2px solid #003057';

        return `
            <div onclick="markAsRead('${n.id}')" style="background:${bgColor}; border:${borderStatus}; border-radius:12px; padding:12px; margin-bottom:10px; cursor:pointer; position:relative; transition:0.2s;">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <b style="font-size:0.9rem; color:#003057; display:block; margin-bottom:4px;">${n.title}</b>
                    <button onclick="deleteNotification(event, '${n.id}')" style="background:none; border:none; color:#ccc; cursor:pointer;">&times;</button>
                </div>
                <p style="font-size:0.8rem; color:#333; margin-bottom:8px;">${n.message}</p>
                <div style="text-align:right;">
                    <small style="font-size:0.7rem; color:#888;">${new Date(n.timestamp).toLocaleString()}</small>
                </div>
            </div>
        `;
    }).join('');
}

// Actions
window.markAsRead = async (id) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
};

window.deleteNotification = async (e, id) => {
    e.stopPropagation(); // Prevents marking as read while deleting
    if(confirm("Delete notification?")) {
        await deleteDoc(doc(db, 'notifications', id));
    }
};

document.getElementById('markAllReadBtn').onclick = async () => {
    const batch = writeBatch(db);
    allNotifications.forEach(n => {
        if (!n.read) {
            const ref = doc(db, 'notifications', n.id);
            batch.update(ref, { read: true });
        }
    });
    await batch.commit();
};

document.getElementById('deleteAllAlertsBtn').onclick = async () => {
    if(confirm("Permanently delete all notifications?")) {
        const batch = writeBatch(db);
        allNotifications.forEach(n => {
            const ref = doc(db, 'notifications', n.id);
            batch.delete(ref);
        });
        await batch.commit();
    }
};

// Pagination Logic
document.getElementById('prevPageBtn').onclick = () => {
    if (currentPage > 1) { currentPage--; renderNotifications(); }
};
document.getElementById('nextPageBtn').onclick = () => {
    const totalPages = Math.ceil(allNotifications.length / itemsPerPage);
    if (currentPage < totalPages) { currentPage++; renderNotifications(); }
};

document.getElementById('closeAlertsBtn').onclick = () => {
    document.getElementById('alertsModal').style.display = 'none';
};

// --- MESSENGER GLOBAL STATE ---
let currentChatPartnerId = null;
let chatCurrentPage = 1;
const chatPageSize = 10;
let lastDoc = null;
let activeView = 'chats'; // 'chats' or 'users' or 'conversation'
let unsubChat = null;

// --- CORE FUNCTIONS ---

const openChatList = async () => {
    activeView = 'chats';
    document.getElementById('chatBackBtn').style.display = 'none';
    document.getElementById('inboxHeaderTitle').textContent = "Messages";
    document.getElementById('chatInputArea').style.display = 'none';
    document.getElementById('inboxTabs').style.display = 'flex';
    renderChatList();
};

const renderChatList = async () => {
    const user = auth.currentUser;
    const container = document.getElementById('inboxScrollArea');
    container.innerHTML = "Loading chats...";

    // We query 'threads' where current user is a participant
    const q = query(collection(db, 'threads'), 
                    where('participants', 'array-contains', user.uid), 
                    orderBy('lastTimestamp', 'desc'));
    
    onSnapshot(q, (snap) => {
        if (activeView !== 'chats') return;
        if (snap.empty) {
            container.innerHTML = "No conversations yet. Go to 'Find People' to start one.";
            return;
        }

        container.innerHTML = snap.docs.map(doc => {
            const data = doc.data();
            const partnerName = data.names[data.participants.find(p => p !== user.uid)];
            const isUnread = data.unreadBy && data.unreadBy.includes(user.uid);
            
            return `
                <div onclick="openConversation('${data.participants.find(p => p !== user.uid)}', '${partnerName}')" 
                     style="display:flex; align-items:center; padding:12px; border-bottom:1px solid #f0f0f0; background:${isUnread ? '#eef6ff' : 'white'}; cursor:pointer;">
                    <div style="width:45px; height:45px; border-radius:50%; background:#ddd; margin-right:12px; display:flex; align-items:center; justify-content:center; color:#003057; font-weight:bold;">
                        ${partnerName[0]}
                    </div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between;">
                            <b style="font-size:0.9rem;">${partnerName}</b>
                            <small style="color:#999;">${data.lastTimestamp ? new Date(data.lastTimestamp.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</small>
                        </div>
                        <p style="font-size:0.8rem; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:250px;">
                            ${data.lastMessage || 'Sent a file/voice note'}
                        </p>
                    </div>
                </div>
            `;
        }).join('');
    });
};

// --- USER DIRECTORY (STRICTLY HARDCODED ROLES) ---
document.getElementById('viewUsersTab').onclick = async () => {
    activeView = 'users';
    document.getElementById('viewUsersTab').style.borderBottom = "3px solid var(--primary-blue)";
    document.getElementById('viewChatsTab').style.borderBottom = "none";
    const container = document.getElementById('inboxScrollArea');
    
    container.innerHTML = "<p style='text-align:center; padding:20px;'>Loading Directory...</p>";

    try {
        // Fetch users ordered by name
        const q = query(collection(db, 'users'), orderBy('name'), limit(40));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = "<p style='padding:20px;'>No campus members found.</p>";
            return;
        }

        container.innerHTML = snap.docs.map(d => {
            const u = d.data();
            if (d.id === auth.currentUser.uid) return ''; // Hide self

            // HARDCODING EVERY ROLE BASED ON YOUR LOGIN LOGIC
            let roleLabel = "";
            let roleColor = "#888"; // Default color

            switch(u.role) {
                case 'admin':
                    roleLabel = "System Admin";
                    roleColor = "#d32f2f"; // Red
                    break;
                case 'tutor':
                    roleLabel = "Senior Tutor";
                    roleColor = "#003057"; // UJ Blue
                    break;
                case 'lecturer':
                    roleLabel = "Lecturer / Professor";
                    roleColor = "#003057"; // UJ Blue
                    break;
                case 'academic-advisor':
                    roleLabel = "Academic Advisor";
                    roleColor = "#2e7d32"; // Green
                    break;
                case 'campus-services':
                    roleLabel = "Campus Services";
                    roleColor = "#ef6c00"; // Orange
                    break;
                case 'student':
                    roleLabel = "Student";
                    roleColor = "#666"; // Grey
                    break;
                default:
                    roleLabel = "Campus Member";
                    roleColor = "#888";
            }

            return `
                <div onclick="openConversation('${d.id}', '${u.name}')" style="display:flex; align-items:center; padding:12px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
                    <img src="${u.profilePic || 'https://img.icons8.com/fluency/48/user-male-circle.png'}" style="width:40px; height:40px; border-radius:50%; margin-right:12px; object-fit:cover;">
                    <div>
                        <b style="font-size:0.9rem;">${u.name}</b>
                        <small style="display:block; color:${roleColor}; font-weight:bold; text-transform:uppercase; font-size:0.7rem; margin-top:2px;">
                            ${roleLabel}
                        </small>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error("Directory Error:", error);
        container.innerHTML = "<p style='padding:20px; color:red;'>Error loading directory. Check connection.</p>";
    }
};


// --- CONVERSATION VIEW ---
window.openConversation = async (partnerId, partnerName) => {
    activeView = 'conversation';
    currentChatPartnerId = partnerId;
    document.getElementById('chatBackBtn').style.display = 'block';
    document.getElementById('inboxHeaderTitle').textContent = partnerName;
    document.getElementById('chatInputArea').style.display = 'block';
    document.getElementById('inboxTabs').style.display = 'none';
    
    const container = document.getElementById('inboxScrollArea');
    container.innerHTML = "Opening chat...";

    const threadId = [auth.currentUser.uid, partnerId].sort().join('_');
    
    // Listen for messages in this thread
    const q = query(collection(db, 'threads', threadId, 'messages'), orderBy('timestamp', 'desc'), limit(chatPageSize));
    
    if(unsubChat) unsubChat();
    unsubChat = onSnapshot(q, (snap) => {
        const msgs = snap.docs.map(d => d.data()).reverse();
        container.innerHTML = msgs.map(m => {
            const isMe = m.senderId === auth.currentUser.uid;
            return `
                <div style="display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:10px;">
                    <div style="max-width:75%; padding:10px; border-radius:15px; background:${isMe ? 'var(--primary-blue)' : '#f0f0f0'}; color:${isMe ? 'white' : 'black'}; font-size:0.85rem;">
                        ${m.text}
                        <div style="font-size:0.6rem; text-align:right; margin-top:4px; opacity:0.7;">
                            ${m.timestamp ? new Date(m.timestamp.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        container.scrollTop = container.scrollHeight;
    });

    // Mark as Read Logic
    await updateDoc(doc(db, 'threads', threadId), {
        unreadBy: [] // Simplified for this logic
    });
};

// --- SEND LOGIC WITH QUOTA (10 per 24hrs per partner) ---
document.getElementById('sendChatBtn').onclick = async () => {
    const text = document.getElementById('chatMsgInput').value.trim();
    if (!text) return;

    const user = auth.currentUser;
    const threadId = [user.uid, currentChatPartnerId].sort().join('_');
    const today = new Date().toISOString().split('T')[0];
    const quotaRef = doc(db, 'users', user.uid, 'quotas', `${today}_${currentChatPartnerId}`);

    // 1. Check Quota
    const quotaSnap = await getDoc(quotaRef);
    let count = quotaSnap.exists() ? quotaSnap.data().count : 0;

    if (count >= 10) {
        document.getElementById('quotaWarning').style.display = 'block';
        return;
    }

    // 2. Send Message
    try {
        const msgData = {
            senderId: user.uid,
            text: text,
            timestamp: serverTimestamp()
        };
        
        await addDoc(collection(db, 'threads', threadId, 'messages'), msgData);
        
        // 3. Update Thread Meta
        await setDoc(doc(db, 'threads', threadId), {
            lastMessage: text,
            lastTimestamp: serverTimestamp(),
            participants: [user.uid, currentChatPartnerId],
            names: { [user.uid]: 'Me', [currentChatPartnerId]: document.getElementById('inboxHeaderTitle').textContent }
        }, { merge: true });

        // 4. Increment Quota
        await setDoc(quotaRef, { count: count + 1 }, { merge: true });
        
        document.getElementById('chatMsgInput').value = '';
    } catch (e) {
        alert("Failed to send.");
    }
};

// --- HELPERS ---
document.getElementById('chatBackBtn').onclick = openChatList;
document.getElementById('closeInboxBtn').onclick = () => {
    if(unsubChat) unsubChat();
    document.getElementById('inboxModal').style.display = 'none';
};

// --- TUTOR EXPLORER LOGIC (IDENTICAL TO EVALUATED PORTAL) ---
let allTutors = [];
let tutorPage = 1;
const tutorLimit = 5;

async function loadTutors() {
    const container = document.getElementById('tutorListContainer');
    container.innerHTML = "Finding available tutors...";
    
    try {
        // Fetching from 'users' collection where role is 'tutor'
        const q = query(collection(db, 'users'), where('role', '==', 'tutor'));
        const snap = await getDocs(q);
        allTutors = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTutorList();
    } catch (e) {
        container.innerHTML = "Error loading tutors.";
    }
}

function renderTutorList() {
    const container = document.getElementById('tutorListContainer');
    const search = document.getElementById('tutorSearch').value.toLowerCase();
    const filter = document.getElementById('tutorFilter').value;

    let filtered = allTutors.filter(t => {
        const matchesSearch = t.name.toLowerCase().includes(search) || (t.modules && t.modules.toLowerCase().includes(search));
        const matchesFilter = filter === 'all' || t.department === filter;
        return matchesSearch && matchesFilter;
    });

    const start = (tutorPage - 1) * tutorLimit;
    const paginated = filtered.slice(start, start + tutorLimit);
    
    document.getElementById('tutorPageInfo').textContent = `Page ${tutorPage} of ${Math.ceil(filtered.length/tutorLimit) || 1}`;

    container.innerHTML = paginated.map(t => `
            <div style="border:1px solid #eee; border-radius:15px; padding:15px; margin-bottom:10px; background:#fff; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; gap:12px;">
                <img src="${t.profilePic || 'https://img.icons8.com/fluency/48/user-male-circle.png'}" style="width:50px; height:50px; border-radius:50%; border: 1px solid #eee;">
                <div style="flex:1;">
                    <b style="color:var(--primary-blue); font-size:1rem;">${t.name}</b>
                    <div style="font-size:0.75rem; color:var(--primary-blue); font-weight:600; margin-top:2px;">
                        ${t.department || 'General Department'}
                    </div>
                    <div style="font-size:0.7rem; color:#666; margin-top:2px;">
                        Focus: ${t.modules || 'General Support'}
                    </div>
                </div>
            </div>
    
    <div style="margin-top:10px; border-top:1px solid #f5f5f5; padding-top:10px;">
    <div onclick="toggleAvailability(this)" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
        <span style="font-size:0.65rem; font-weight:700; color:#888; text-transform:uppercase;">Weekly Availability</span>
        <span class="toggle-icon" style="font-size:0.8rem; color:#888; transition: transform 0.3s; display:inline-block;">▼</span>
    </div>
    <div class="availability-content" style="display:none; margin-top:8px;">
        ${Array.isArray(t.availability) && t.availability.length > 0 
            ? t.availability.map(slot => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f9fbff; border:1px solid #edf2f7; padding:6px 12px; border-radius:8px; margin-bottom:4px;">
                    <span style="font-size:0.75rem; font-weight:700; color:var(--primary-blue);">${slot.day}</span>
                    <span style="font-size:0.75rem; color:#333;">${slot.start} - ${slot.end}</span>
                </div>
            `).join('') 
            : `<div style="font-size:0.75rem; color:#999; text-align:center;">By appointment only</div>`
        }
    </div>
</div>


            <div style="display:flex; gap:5px; margin-top:12px;">
                <button onclick="bookTutorPrompt('${t.id}', '${t.name}')" style="flex:1; background:var(--primary-blue); color:white; border:none; padding:10px; border-radius:8px; font-size:0.75rem; font-weight:600; cursor:pointer;">Book</button>
                <button onclick="openConversation('${t.id}', '${t.name}')" style="flex:1; border:1px solid var(--primary-blue); background:white; color:var(--primary-blue); padding:10px; border-radius:8px; font-size:0.75rem; font-weight:600; cursor:pointer;">Chat</button>
                <button onclick="rateTutorPrompt('${t.id}', '${t.name}')" style="flex:1; border:1px solid #ddd; background:white; color:#666; padding:10px; border-radius:8px; font-size:0.75rem; cursor:pointer;">Rate</button>
            </div>
        </div>

    `).join('');
}

// Search Listeners
document.getElementById('tutorSearch').oninput = renderTutorList;
document.getElementById('tutorFilter').onchange = renderTutorList;

// --- GLOBAL TEMPORARY STORAGE ---
let activeTutorId = null;
let activeTutorName = null;

// --- REPLACED BOOKING LOGIC ---
window.bookTutorPrompt = (tutorId, tutorName) => {
    activeTutorId = tutorId;
    activeTutorName = tutorName;
    document.getElementById('bookTargetName').textContent = `Book ${tutorName}`;
    document.getElementById('bookingActionModal').style.display = 'flex';
};

// --- FIXED BOOKING SUBMISSION ---
document.getElementById('confirmBookingBtn').onclick = async () => {
    const topic = document.getElementById('book_topic').value.trim();
    const mode = document.getElementById('book_mode').value;

    if (!topic || selectedSlots.length === 0) {
        return alert("Please enter a topic and add at least one time slot.");
    }

    try {
        const studentSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const studentData = studentSnap.data();
        const studentName = studentSnap.exists() ? studentData.name : "A Student";

        // 1. CREATE THE ACTUAL SESSION RECORD
        await addDoc(collection(db, 'sessions'), {
            studentId: auth.currentUser.uid,
            studentName: studentName,
            tutorId: activeTutorId,
            personName: activeTutorName,
            role: 'tutor',
            topic: topic,
            preferredSlots: selectedSlots, 
            mode: mode,
            status: 'pending',
            timestamp: new Date().toISOString()
        });

        // 2. TRIGGER THE NOTIFICATION (The "Ping")
        // This is what makes the Tutor see a "1" on their Alerts tab
        await addDoc(collection(db, 'notifications'), {
            userId: activeTutorId, // This must match the Tutor's UID
            title: "New Booking Request",
            message: `${studentName} requested a session for "${topic}"`,
            timestamp: new Date().toISOString(),
            read: false
        });
        
        alert("Request Sent! The tutor has been notified.");
        
        // Reset UI
        selectedSlots = []; 
        document.getElementById('queued_slots').innerHTML = '';
        document.getElementById('book_topic').value = '';
        document.getElementById('bookingActionModal').style.display = 'none';

    } catch (e) {
        console.error(e);
        alert("Booking failed.");
    }
};



// --- REPLACED RATING LOGIC ---
window.rateTutorPrompt = (tutorId, tutorName) => {
    activeTutorId = tutorId;
    activeTutorName = tutorName;
    document.getElementById('rateTargetName').textContent = `Rate ${tutorName}`;
    document.getElementById('ratingActionModal').style.display = 'flex';
};

document.getElementById('confirmRatingBtn').onclick = async () => {
    const stars = document.getElementById('rate_stars').value;
    const comment = document.getElementById('rate_comment').value.trim();

    try {
        await addDoc(collection(db, 'ratings'), {
            studentId: auth.currentUser.uid,
            tutorId: activeTutorId,
            personName: activeTutorName,
            role: 'tutor',
            stars: parseInt(stars),
            comment: comment,
            createdAt: new Date().toISOString()
        });
        
        alert("Feedback submitted!");
        document.getElementById('ratingActionModal').style.display = 'none';
    } catch (e) {
        alert("Error saving rating");
    }
};


// Helper for dynamic badge updates
function updateBadge(tabId) {
    // This looks for the nav-badge in the HTML and increments it
    const bookingNavItem = document.querySelectorAll('.nav-item')[1]; // My Bookings is index 1
    let badge = bookingNavItem.querySelector('.nav-badge');
    if(!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        bookingNavItem.appendChild(badge);
    }
    badge.style.display = 'flex';
    badge.textContent = (parseInt(badge.textContent) || 0) + 1;
}

let selectedSlots = [];
document.getElementById('add_slot_btn').onclick = () => {
    const p = document.getElementById('slot_picker');
    if (p.value) { 
        selectedSlots.push(p.value); 
document.getElementById('queued_slots').innerHTML += `<span style="background:#003057; color:white; padding:4px 8px; border-radius:12px; font-size:0.7rem; margin:2px; display:inline-block;">${new Date(p.value).toLocaleString([], {dateStyle:'short', timeStyle:'short'})}</span> `;    
        p.value = '';
    }
};

window.toggleAvailability = (header) => {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    const isHidden = content.style.display === "none";
    
    content.style.display = isHidden ? "block" : "none";
    icon.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
};


