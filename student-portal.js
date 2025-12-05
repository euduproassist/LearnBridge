// student-portal.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

onAuthStateChanged(auth, user => {
  if (!user) {
    // not logged in — maybe redirect to login
    window.location.href = 'index.html';
    return;
  }
  const uid = user.uid;
  initPortal(uid);
});

async function initPortal(uid) {
  // ------- PROFILE -------
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  const profile = snap.exists() ? snap.data() : {
    email: auth.currentUser.email,
    name: "",
    year: "",
    department: "",
    course: "",
    profilePic: ""
  };

  document.getElementById('profileEmail').value = profile.email;
  document.getElementById('profileName').value = profile.name || '';
  document.getElementById('profileYear').value = profile.year || '';
  document.getElementById('profileDept').value = profile.department || '';
  document.getElementById('profileCourse').value = profile.course || '';
  document.getElementById('profilePic').value = profile.profilePic || '';

  document.getElementById('saveProfileBtn').onclick = async () => {
    const newData = {
      name: document.getElementById('profileName').value.trim(),
      year: document.getElementById('profileYear').value,
      department: document.getElementById('profileDept').value.trim(),
      course: document.getElementById('profileCourse').value.trim(),
      profilePic: document.getElementById('profilePic').value.trim()
    };
    await setDoc(userRef, { ...profile, ...newData }, { merge: true });
    alert('Profile saved successfully!');
  };

  // ------- UPCOMING SESSIONS -------
  await renderSessions(uid);
}

async function renderSessions(uid) {
  const container = document.getElementById('sessionsContainer');
  // Query sessions where studentId == uid and maybe status == 'approved' or 'upcoming'
  const q = query(collection(db, "sessions"), where("studentId", "==", uid));
  const snapshot = await getDocs(q);
  const sessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  if (!sessions.length) {
    container.innerHTML = `<div class="empty">No upcoming sessions.</div>`;
    return;
  }

  const html = `
    <table>
      <thead><tr><th>Person</th><th>Date & Time</th><th>Mode</th><th>Actions</th></tr></thead>
      <tbody>
        ${sessions.map(s => `
          <tr data-id="${s.id}">
            <td>${s.personName}</td>
            <td>${new Date(s.datetime).toLocaleString()}</td>
            <td>${s.mode}</td>
            <td>
              <button data-act="cancel">Cancel</button>
              <button data-act="reschedule">Update</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  container.innerHTML = html;

  container.querySelectorAll('button[data-act="cancel"]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.closest('tr').dataset.id;
      if (confirm('Cancel this session?')) {
        await deleteDoc(doc(db, "sessions", id));
        renderSessions(uid);
      }
    };
  });

  container.querySelectorAll('button[data-act="reschedule"]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.closest('tr').dataset.id;
      const newDate = prompt('Enter new date & time (YYYY‑MM‑DDTHH:MM)', '');
      const newMode = prompt('Enter mode (online / in-person)', '');
      if (newDate && newMode) {
        await updateDoc(doc(db, "sessions", id), {
          datetime: new Date(newDate).toISOString(),
          mode: newMode
        });
        renderSessions(uid);
      }
    };
  });
}
