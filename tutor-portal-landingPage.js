import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, orderBy, deleteDoc, onSnapshot, updateDoc, writeBatch, limit, startAfter, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

// --- Profile Logic ---
const avatars = [
    "https://img.icons8.com/fluency/48/student-male.png",
    "https://img.icons8.com/fluency/48/student-female.png",
    "https://img.icons8.com/fluency/48/user-male-circle.png",
    "https://img.icons8.com/fluency/48/university.png"
];

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let selectedDays = []; // We will now store objects here: {day: "Monday", start: "08:00", end: "10:00"}
const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
let currentPreAvatar = "";


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
                const firstName = userData.name ? userData.name.split(' ')[0] : 'Tutor';
                document.getElementById('display-name').textContent = `Hello, ${firstName}! `;
                
                // 2. DYNAMIC CAMPUS (Optional): Shows department or year if available
                if(userData.department) {
                    document.getElementById('display-campus').textContent = `(${userData.department})`;
                }
            }

        } catch (error) {
            console.error("Error fetching user name:", error);
        } // Closed the catch block properly

    } else {
        // Not logged in? Go back to login
        window.location.href = 'index.html';
    }
});

// --- Integrated Navigation Logic ---
document.addEventListener('DOMContentLoaded', () => {
const navItems = document.querySelectorAll('.nav-item');

navItems.forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault(); 
        const tabText = this.textContent.trim();
        
        // 1. UI Reset (Icons & Lines)
        navItems.forEach(nav => {
            nav.classList.remove('active');
            const icon = nav.querySelector('img');
if (icon && icon.src) icon.src = icon.src.replace('003057', '888888');

        });

        // 2. UI Activate
        this.classList.add('active');
        const activeIcon = this.querySelector('img');
if (activeIcon && activeIcon.src) activeIcon.src = activeIcon.src.replace('888888', '003057');


        // 3. Trigger Modals based on text
        const badge = this.querySelector('.nav-badge');
        if (badge) badge.style.display = 'none'; // Clear notification when clicked

        if (tabText.includes('Support-tickets')) {
            document.getElementById('supportModal').style.display = 'flex';
            loadTicketHistory();
        } else if (tabText.includes('Alerts')) {
            document.getElementById('alertsModal').style.display = 'flex';
            renderNotifications();
        } else if (tabText.includes('Inbox')) {
            document.getElementById('inboxModal').style.display = 'flex';
            openChatList();
        } else if (tabText.includes('Profile')) {
            document.getElementById('profileModal').style.display = 'flex';
            loadProfileSummary();
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
            userId: user.uid,
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
        const q = query(collection(db, 'supportTickets'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
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


    // Open Presence Modal from Grid Card
document.getElementById('openPresenceBtn').onclick = () => {
    document.getElementById('presenceModal').style.display = 'flex';
    loadPresenceData();
};

    document.getElementById('savePresenceBtn').onclick = async () => {
    const user = auth.currentUser;
    const data = {
        name: document.getElementById('pre_name').value.trim(),
        department: document.getElementById('pre_dept').value.trim(),
        modules: document.getElementById('pre_modules').value.trim(),
        profilePic: currentPreAvatar,
        availability: selectedDays
    };

    try {
        await setDoc(doc(db, 'users', user.uid), data, { merge: true });
        // Close this modal
        document.getElementById('presenceModal').style.display = 'none';
        // Open Profile Summary Modal (Linking)
        document.getElementById('profileModal').style.display = 'flex';
        loadProfileSummary(); 
    } catch (e) { alert("Error saving data"); }
};

// Connect the buttons in the summary view
document.getElementById('triggerEditBtn').onclick = () => {
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('presenceModal').style.display = 'flex';
    loadPresenceData();
};

document.getElementById('sum_CloseBtn').onclick = () => document.getElementById('profileModal').style.display = 'none';

// Tab Switching Logic
document.getElementById('tabSetupProfile').onclick = function() {
    this.style.background = 'white'; this.style.borderBottom = '3px solid #003057';
    document.getElementById('tabSetupWork').style.background = '#f4f4f4'; document.getElementById('tabSetupWork').style.borderBottom = 'none';
    document.getElementById('paneProfile').style.display = 'block';
    document.getElementById('paneAvailability').style.display = 'none';
};

document.getElementById('tabSetupWork').onclick = function() {
    this.style.background = 'white'; this.style.borderBottom = '3px solid #003057';
    document.getElementById('tabSetupProfile').style.background = '#f4f4f4'; document.getElementById('tabSetupProfile').style.borderBottom = 'none';
    document.getElementById('paneProfile').style.display = 'none';
    document.getElementById('paneAvailability').style.display = 'block';
    renderDays();
};

document.getElementById('closePresenceBtn').onclick = () => {
    document.getElementById('presenceModal').style.display = 'none';
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
let unsubChatList = null;

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
    
    if (unsubChatList) unsubChatList();
    unsubChatList = onSnapshot(q, (snap) => {
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

// --- USER DIRECTORY (TUTOR PORTAL - HARDCODED ROLES) ---
document.getElementById('viewUsersTab').onclick = async () => {
    activeView = 'users';
    document.getElementById('viewUsersTab').style.borderBottom = "3px solid var(--primary-blue)";
    document.getElementById('viewChatsTab').style.borderBottom = "none";
    const container = document.getElementById('inboxScrollArea');
    
    container.innerHTML = "<p style='text-align:center; padding:20px;'>Loading authorized contacts...</p>";

    try {
        // Query only for the roles a tutor is allowed to talk to
        const q = query(
            collection(db, 'users'), 
            where('role', 'in', ['student', 'admin']), 
            orderBy('name'), 
            limit(30)
        );
        
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = "<p style='padding:20px;'>No students or admins found.</p>";
            return;
        }

        container.innerHTML = snap.docs.map(d => {
            const u = d.data();
            if (d.id === auth.currentUser.uid) return ''; // Hide self

            // HARDCODED ROLE LOGIC
            let roleTitle = "";
            let roleColor = "";

            if (u.role === 'admin') {
                roleTitle = "SYSTEM ADMIN";
                roleColor = "#d32f2f"; // Red for Admin
            } else if (u.role === 'student') {
                roleTitle = "STUDENT";
                roleColor = "#666"; // Grey for Student
            } else {
                // This acts as a safety, though the query above should prevent other roles
                return ''; 
            }

            return `
                <div onclick="openConversation('${d.id}', '${u.name}')" style="display:flex; align-items:center; padding:12px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
                    <img src="${u.profilePic || 'https://img.icons8.com/fluency/48/user-male-circle.png'}" style="width:40px; height:40px; border-radius:50%; margin-right:12px;">
                    <div>
                        <b style="font-size:0.9rem;">${u.name}</b>
                        <small style="display:block; color:${roleColor}; font-weight:bold; font-size:0.7rem;">
                            ${roleTitle}
                        </small>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error("Filter Error:", error);
        container.innerHTML = "<p style='padding:20px; color:red;'>Check console for index link.</p>";
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
    if(unsubChatList) unsubChatList();
    document.getElementById('inboxModal').style.display = 'none';
};
});

async function loadPresenceData() {
    const user = auth.currentUser;
    const snap = await getDoc(doc(db, 'users', user.uid));

    // Setup Avatar Picker
    const picker = document.getElementById('presenceAvatarPicker');
    picker.innerHTML = avatars.map(url => `
        <img src="${url}" onclick="selectPreAvatar('${url}')" style="width:35px; cursor:pointer; border-radius:50%; border:2px solid transparent;" class="pre-avatar-opt">
    `).join('');

    if (snap.exists()) {
        const d = snap.data();
        document.getElementById('pre_name').value = d.name || "";
        document.getElementById('pre_dept').value = d.department || "";
        document.getElementById('pre_modules').value = d.modules || "";
        currentPreAvatar = d.profilePic || avatars[0];
        document.getElementById('presenceAvatar').src = currentPreAvatar;
        selectedDays = d.availability || [];
    }
}

window.selectPreAvatar = (url) => {
    currentPreAvatar = url;
    document.getElementById('presenceAvatar').src = url;
};

function renderDays() {
    const container = document.getElementById('daysContainer');
    container.innerHTML = daysOfWeek.map(day => {
        // Check if this day is already in our selected list
        const existingRecord = selectedDays.find(d => d.day === day);
        const isChecked = !!existingRecord;

        return `
        <div style="background: #f8f9fa; padding: 12px; border-radius: 12px; margin-bottom: 10px; border: 1px solid #eee;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: ${isChecked ? '10px' : '0'};">
                <span style="color:black; font-weight:600;">${day}</span>
                <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleDayRow('${day}')" style="width:22px; height:22px;">
            </div>
            
            ${isChecked ? `
            <div style="display:flex; gap:10px; align-items:center;">
                <select onchange="updateTime('${day}', 'start', this.value)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ccc; font-size:0.8rem;">
                    <option value="">Start</option>
                    ${timeSlots.map(t => `<option value="${t}" ${existingRecord.start === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <span style="color:#666; font-size:0.7rem;">to</span>
                <select onchange="updateTime('${day}', 'end', this.value)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ccc; font-size:0.8rem;">
                    <option value="">End</option>
                    ${timeSlots.map(t => `<option value="${t}" ${existingRecord.end === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
            ` : ''}
        </div>`;
    }).join('');
}

window.toggleDayRow = (day) => {
    const index = selectedDays.findIndex(d => d.day === day);
    if (index > -1) {
        selectedDays.splice(index, 1); // Remove if unchecked
    } else {
        selectedDays.push({ day: day, start: "08:00", end: "09:00" }); // Default values when checked
    }
    renderDays(); // Refresh UI to show/hide selectors
};

window.updateTime = (day, field, value) => {
    const record = selectedDays.find(d => d.day === day);
    if (record) {
        if (field === 'start' && value >= record.end) {
            alert("Start time must be before end time!");
            renderDays(); // Reset the UI
            return;
        }
        if (field === 'end' && value <= record.start) {
            alert("End time must be after start time!");
            renderDays(); // Reset the UI
            return;
        }
        record[field] = value;
    }
};

async function loadProfileSummary() {
    const user = auth.currentUser;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
        const d = snap.data();
        document.getElementById('sum_Avatar').src = d.profilePic || avatars[0];
        document.getElementById('sum_Name').textContent = d.name || "No Name Set";
        document.getElementById('sum_Details').textContent = `${d.modules || 'No Modules'} | ${d.department || 'No Dept'}`;
     const availabilityData = d.availability || [];


    }
}


document.getElementById('sum_LogoutBtn').onclick = async () => {
    if(confirm("Are you sure you want to log out?")) {
        await signOut(auth);
    }
};

document.getElementById('sum_ResetBtn').onclick = async () => {
    const user = auth.currentUser;
    if(user && confirm("Send password reset email to " + user.email + "?")) {
        try {
            await sendPasswordResetEmail(auth, user.email);
            alert("Email sent!");
        } catch (e) {
            alert("Error: " + e.message);
        }
    }
};




