import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/**
 * STUDENT PORTAL LANDING PAGE LOGIC
 * This script handles:
 * 1. Auth State Persistence
 * 2. Dynamic Data Fetching (First Name)
 * 3. Navigation Security
 */

// 1. Monitor Authentication State
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Authenticated User UID:", user.uid);
        
        // Initial fallback if Firestore is slow
        const displayNameElement = document.getElementById('userNameDisplay');
        
        try {
            // 2. Reference the 'users' collection with the logged-in UID
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                
                // 3. Extract the name (Assumes 'name' field exists in Firestore)
                // If the user signed up with "Tshepo Modise", this takes "Tshepo"
                const fullName = userData.name || "Student";
                const firstName = fullName.split(' ')[0];

                // Update the UI heading dynamically
                displayNameElement.textContent = `Hello, ${firstName}! 👋`;
                
                // Security Check: Ensure a non-student didn't sneak in
                if (userData.role !== 'student') {
                    console.warn("Unauthorized access: Not a student.");
                    window.location.href = 'index.html'; 
                }
            } else {
                console.error("No Firestore document found for this UID.");
                displayNameElement.textContent = "Hello, Student! 👋";
            }
        } catch (error) {
            console.error("Error fetching student profile:", error);
            displayNameElement.textContent = "Hello! 👋";
        }
    } else {
        // 4. Redirect to login if no user is authenticated
        console.log("No user logged in. Redirecting...");
        window.location.href = 'index.html';
    }
});

/**
 * GRID BUTTON EVENT LISTENERS
 */

// 'Find Tutor' Card Logic
const findTutorCard = document.getElementById('findTutorCard');
if (findTutorCard) {
    findTutorCard.addEventListener('click', () => {
        // Redirect to your main student functional portal
        window.location.href = 'student-portal.html';
    });
}

// Bottom Navigation Logic (Simple redirection examples)
document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Example logic for Profile Tab (index 3)
        if (index === 3) {
            const confirmLogout = confirm("Would you like to log out?");
            if (confirmLogout) {
                handleLogout();
            }
        }
        
        // Add more navigation logic for Bookings (index 1) or Inbox (index 2) here
    });
});

/**
 * HELPER FUNCTIONS
 */
async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        alert("Logout failed: " + error.message);
    }
}

