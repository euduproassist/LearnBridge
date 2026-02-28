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
            const color = t.status === 'open' ? '#FF7A00' : '#28a745';
            return `
                <div style="border-left:3px solid ${color}; padding:8px; margin-bottom:8px; background:#f9f9f9; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <b style="display:block;">${t.title}</b>
                        <small style="color:${color}">${t.status.toUpperCase()}</small>
                    </div>
                    <button onclick="deleteTicket('${doc.id}')" style="background:none; border:none; color:#d73a3a; cursor:pointer; font-size:1.2rem; font-weight:bold; padding:0 5px;">&times;</button>
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
                        <span style="color:#FF7A00; font-size:0.9rem;">${stars}</span>
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

