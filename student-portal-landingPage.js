import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

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

// Logic to switch the "Blue Cover" and Icon Colors
const navItems = document.querySelectorAll('.nav-item');

navItems.forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault(); 
        
        // 1. Reset all tabs: Remove blue line and turn icons grey
        navItems.forEach(nav => {
            nav.classList.remove('active');
            const icon = nav.querySelector('img');
            if (icon) {
                // This swaps the blue hex code (003057) for the grey one (888888)
                icon.src = icon.src.replace('003057', '888888');
                icon.setAttribute('style', 'filter: none;');
            }
        });
        
        // 2. Activate clicked tab: Add blue line and turn icon blue
        this.classList.add('active');
        const activeIcon = this.querySelector('img');
        if (activeIcon) {
            activeIcon.src = activeIcon.src.replace('888888', '003057');
        }
    });
});

// --- Support Ticket Logic ---

// Open Modal when Support tab is clicked
document.querySelectorAll('.nav-item').forEach(item => {
    if (item.textContent.includes('Support')) {
        item.addEventListener('click', () => {
            document.getElementById('supportModal').style.display = 'flex';
            loadTicketHistory();
        });
    }
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

// Load Ticket History (The "Suggested Add-on")
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
                <div style="border-left:3px solid ${color}; padding:5px 10px; margin-bottom:8px; background:#f9f9f9;">
                    <div style="display:flex; justify-content:space-between;">
                        <b>${t.title}</b>
                        <span style="color:${color}">${t.status}</span>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        historyDiv.innerHTML = "Log in to see history.";
    }
}



