import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

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




