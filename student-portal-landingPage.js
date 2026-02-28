import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

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

// Navigation Logic
document.getElementById('findTutorBtn').addEventListener('click', () => {
    // Redirects to the functional portal
    window.location.href = 'student-portal.html';
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
        if (tabText.includes('Support-tickets')) {
            document.getElementById('supportModal').style.display = 'flex';
            loadTicketHistory();
        } else if (tabText.includes('Ratings')) {
            document.getElementById('ratingsModal').style.display = 'flex';
            loadUserRatings();
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

