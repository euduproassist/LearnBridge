import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const STATE = {
    uid: null,
    profile: null
};

// Auth Guard
onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    STATE.uid = user.uid;
    loadTutorData(user.uid);
});

async function loadTutorData(uid) {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
        const data = snap.data();
        STATE.profile = data;
        document.getElementById('tutorName').textContent = `Hello, ${data.name}!`;
        document.getElementById('tutorSub').textContent = `${data.department || 'Tutor'} • Active`;
    }
}

// Simple Navigation Logic
window.openModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
};

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
};

// This matches your "Memorized" rule: Simple Data, Simple Rows.
function renderSimpleTable(containerId, dataArray) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let html = `<table><thead><tr>`;
    // Generate headers from keys of first object
    Object.keys(dataArray[0]).forEach(key => html += `<th>${key}</th>`);
    html += `</tr></thead><tbody>`;
    
    dataArray.forEach(row => {
        html += `<tr>`;
        Object.values(row).forEach(val => html += `<td>${val}</td>`);
        html += `</tr>`;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

