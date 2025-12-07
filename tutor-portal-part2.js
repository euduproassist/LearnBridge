// tutor-portal-part2.js — PART 2 of 3
// Chat, Notifications, Ratings respond, Report Issue, Forgot-password OTP helpers

import { auth, db } from './firebase-config.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/* Reuse helper functions: $, show, hide, escapeHtml, STATE expected from part1 when combined. */
const $ = id => document.getElementById(id);
function escapeHtml(s) { if (s === undefined || s === null) return ''; return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'"':'&#39;'}[c])); }

// Minimal in-memory pollers to refresh chat/messages (cleanup when modal closes)
const CHAT_POLLERS = {}; // { chatId: intervalId }

/* ---------- Chat UI ---------- */
// Opens a simple selector to pick a student to chat with (search recent students)
export async function openChatSelector(uid) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Start Chat</h3>
        <div>
          <input id="chatSearchInput" placeholder="Search student name or module" style="width:100%;margin-bottom:8px" />
          <div id="chatResults" style="max-height:320px;overflow:auto"></div>
          <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="chatCancel">Cancel</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#chatCancel').onclick = () => modal.remove();

    const results = modal.querySelector('#chatResults');

    async function loadRecent() {
      results.innerHTML = 'Loading recent...';
      // fetch recent sessions to find students
      const sessionsSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), orderBy('createdAt','desc'), limit(50)));
      const students = {};
      sessionsSnap.forEach(d => {
        const s = d.data();
        if (s.studentId) students[s.studentId] = { id: s.studentId, name: s.studentName, photo: s.studentPhoto };
      });
      const list = Object.values(students);
      if (list.length === 0) results.innerHTML = '<div class="empty">No recent students. Try searching.</div>';
      else {
        results.innerHTML = list.map(st => `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #eee">
            <img src="${escapeHtml(st.photo||'assets/logos/uj.png')}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">
            <div style="flex:1">
              <div><strong>${escapeHtml(st.name||'Student')}</strong></div>
            </div>
            <div><button class="btn start-chat" data-id="${escapeHtml(st.id)}" data-name="${escapeHtml(st.name)}">Chat</button></div>
          </div>
        `).join('');
        results.querySelectorAll('.start-chat').forEach(b => b.onclick = (ev) => {
          const id = ev.target.dataset.id; const name = ev.target.dataset.name;
          modal.remove(); openChatWindow({ id, name, photo: '' });
        });
      }
    }

    modal.querySelector('#chatSearchInput').oninput = async (ev) => {
      const q = ev.target.value.trim().toLowerCase();
      if (!q) return loadRecent();
      // search users collection for students matching
      const usersSnap = await getDocs(query(collection(db,'users'), where('role','==','student')));
      const users = usersSnap.docs.map(d=>({ id: d.id, ...d.data() })).filter(u => ((u.name||'') + ' ' + (u.modules||'') ).toLowerCase().includes(q));
      if (users.length === 0) results.innerHTML = '<div class="empty">No matches</div>';
      else {
        results.innerHTML = users.map(u => `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border-bottom:1px solid #eee">
            <img src="${escapeHtml(u.profilePic||'assets/logos/uj.png')}" style="width:44px;height:44px;border-radius:6px;object-fit:cover">
            <div style="flex:1"><strong>${escapeHtml(u.name||'Student')}</strong><div class="muted">${escapeHtml(u.modules||'')}</div></div>
            <div><button class="btn start-chat" data-id="${escapeHtml(u.id)}" data-name="${escapeHtml(u.name)}">Chat</button></div>
          </div>
        `).join('');
        results.querySelectorAll('.start-chat').forEach(b => b.onclick = (ev) => { const id = ev.target.dataset.id; const name = ev.target.dataset.name; modal.remove(); openChatWindow({ id, name, photo: '' }); });
      }
    };

    await loadRecent();
  } catch (err) {
    console.error('openChatSelector', err);
    alert('Failed to open chat selector: ' + err.message);
  }
}

// constructs chatId deterministically
function chatIdFor(a,b) { return [a,b].sort().join('__'); }

// openChatWindow with minimal chat features (text only, attachments placeholder)
export async function openChatWindow(userObj) {
  try {
    if (!auth.currentUser) return alert('Not signed in');
    const myId = auth.currentUser.uid;
    const theirId = userObj.id;
    const chatId = chatIdFor(myId, theirId);

    // build modal
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal" style="max-width:720px">
        <h3>Chat with ${escapeHtml(userObj.name || 'Student')}</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div id="chatMessages" style="height:320px;overflow:auto;padding:6px;border:1px solid #eee;border-radius:8px;background:#fff"></div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="chatInput" placeholder="Write a message..." style="flex:1;padding:8px;border-radius:6px;border:1px solid #ccc" />
            <button class="btn" id="chatSend">Send</button>
            <button class="btn secondary" id="chatClose">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const messagesEl = modal.querySelector('#chatMessages');
    const inputEl = modal.querySelector('#chatInput');

    modal.querySelector('#chatClose').onclick = () => {
      modal.remove();
      // cleanup poller
      if (CHAT_POLLERS[chatId]) clearInterval(CHAT_POLLERS[chatId]);
      delete CHAT_POLLERS[chatId];
    };

    modal.querySelector('#chatSend').onclick = async () => {
      const txt = inputEl.value.trim();
      if (!txt) return;
      try {
        await addDoc(collection(db,'chats'), {
          chatId,
          from: myId,
          to: theirId,
          text: txt,
          createdAt: new Date().toISOString()
        });
        inputEl.value = '';
        await renderMessages();
      } catch (err) {
        console.error('send chat', err);
        alert('Failed to send message: ' + err.message);
      }
    };

    async function renderMessages() {
      try {
        const q = query(collection(db,'chats'), where('chatId','==', chatId), orderBy('createdAt','asc'));
        const snap = await getDocs(q);
        const msgs = snap.docs.map(d=>({ id: d.id, ...d.data() }));
        messagesEl.innerHTML = msgs.map(m => `
          <div style="margin-bottom:6px;display:flex;flex-direction:column;align-items:${m.from===myId?'flex-end':'flex-start'}">
            <div style="background:${m.from===myId?'#ff7a00':'#f0f0f0'};color:${m.from===myId?'#fff':'#333'};padding:8px;border-radius:8px;max-width:80%">${escapeHtml(m.text)}</div>
            <div class="muted" style="font-size:11px;margin-top:4px">${new Date(m.createdAt).toLocaleString()}</div>
          </div>
        `).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } catch (err) {
        console.error('renderMessages', err);
      }
    }

    // initial render
    await renderMessages();
    // poll every 3s for new messages
    CHAT_POLLERS[chatId] = setInterval(renderMessages, 3000);

  } catch (err) {
    console.error('openChatWindow', err);
    alert('Failed to open chat: ' + err.message);
  }
}

/* ---------- Notifications Center (tutor) ---------- */
export async function loadNotifications(uid) {
  try {
    // notifications derive from sessions, chat unread messages, reschedule requests
    const list = [];
    // sessions with status changes
    const sessSnap = await getDocs(query(collection(db,'sessions'), where('personId','==', uid), orderBy('createdAt','desc'), limit(50)));
    sessSnap.forEach(d => {
      const s = d.data();
      const label = s.status || 'update';
      list.push({ text: `${label}: ${s.studentName || 'Student'} — ${new Date(s.datetime||s.createdAt).toLocaleString()}`, ts: s.createdAt || s.datetime });
    });

    // recent chat messages to tutor (count last 20)
    const chatSnap = await getDocs(query(collection(db,'chats'), where('to','==', uid), orderBy('createdAt','desc'), limit(20)));
    chatSnap.forEach(d => {
      const c = d.data();
      list.push({ text: `Message from ${c.from}: ${String(c.text||'')}`, ts: c.createdAt });
    });

    // sort by ts desc
    list.sort((a,b) => new Date(b.ts) - new Date(a.ts));
    const con = $('notificationsList'); if (!con) return;
    con.innerHTML = list.length ? `<ul>${list.map(n => `<li>${escapeHtml(n.text)} <div class="muted" style="font-size:12px">${new Date(n.ts).toLocaleString()}</div></li>`).join('')}</ul>` : '<div class="empty">No notifications</div>';
  } catch (err) {
    console.error('loadNotifications', err);
    const con = $('notificationsList'); if (con) con.innerHTML = '<div class="empty">Failed to load notifications</div>';
  }
}

/* ---------- Ratings: Load + Respond ---------- */
export async function loadTutorRatings(uid, roleFilter = '', searchText = '') {
  try {
    const ratingsCol = collection(db,'ratings');
    const q = query(ratingsCol, where('personId','==', uid), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (roleFilter) docs = docs.filter(r => r.role === roleFilter);
    if (searchText) docs = docs.filter(r => (r.personName||'').toLowerCase().includes(searchText.toLowerCase()));
    const container = $('ratingsList'); if (!container) return;
    if (docs.length === 0) { $('ratingsEmpty')?.classList?.remove('hidden'); container.innerHTML = ''; return; }
    $('ratingsEmpty')?.classList?.add('hidden');
    container.innerHTML = docs.map(r => `
      <div class="profile-card" style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between">
          <div><strong>${escapeHtml(r.studentName||'Student')}</strong> <span class="muted">(${escapeHtml(r.role)})</span></div>
          <div>${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
        </div>
        <div class="muted" style="font-size:13px">${new Date(r.createdAt).toLocaleString()}</div>
        <div>${escapeHtml(r.comment||'')}</div>
        <div style="display:flex;gap:8px;margin-top:6px"><button class="btn reply-rating" data-id="${escapeHtml(r.id)}">Reply</button></div>
        <div class="rating-reply" id="reply_${escapeHtml(r.id)}"></div>
      </div>
    `).join('');

    // attach reply handlers
    container.querySelectorAll('.reply-rating').forEach(b => b.onclick = async (ev) => {
      const id = ev.target.dataset.id;
      openRatingReplyModal(uid, id);
    });

  } catch (err) {
    console.error('loadTutorRatings', err);
  }
}

async function openRatingReplyModal(uid, ratingId) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Reply to rating</h3>
        <div>
          <textarea id="replyText" rows="4" style="width:100%;margin-bottom:8px" placeholder="Type your reply (this will be visible to student)"></textarea>
          <div style="display:flex;gap:8px"><button class="btn" id="replySend">Send Reply</button><button class="btn secondary" id="replyCancel">Cancel</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#replyCancel').onclick = () => modal.remove();
    modal.querySelector('#replySend').onclick = async () => {
      const text = modal.querySelector('#replyText').value.trim();
      if (!text) return alert('Enter reply text');
      try {
        // store reply as subcollection under ratings/{ratingId}/replies or add reply field
        await addDoc(collection(db, `ratings/${ratingId}/replies`), {
          from: auth.currentUser.uid,
          text,
          createdAt: new Date().toISOString()
        });
        alert('Reply saved.');
        modal.remove();
        // refresh ratings
        await loadTutorRatings(uid);
      } catch (err) { console.error('reply save', err); alert('Failed to save reply: ' + err.message); }
    };
  } catch (err) { console.error('openRatingReplyModal', err); }
}

/* ---------- Report an Issue (Tutor) ---------- */
export async function openReportIssueModal(uid) {
  try {
    const modal = document.createElement('div'); modal.className = 'modal-back';
    modal.innerHTML = `
      <div class="modal">
        <h3>Report an Issue</h3>
        <div>
          <label>Title</label>
          <input id="issueTitle" style="width:100%;margin-bottom:8px" />
          <label>Description</label>
          <textarea id="issueDesc" rows="4" style="width:100%;margin-bottom:8px"></textarea>
          <label>Priority</label>
          <select id="issuePriority" style="width:100%;margin-bottom:8px"><option>Normal</option><option>Urgent</option></select>
          <label>Category</label>
          <select id="issueCategory" style="width:100%;margin-bottom:8px"><option>Technical</option><option>Student Behavior</option><option>Scheduling</option><option>Other</option></select>
          <div style="display:flex;gap:8px"><button class="btn" id="issueSend">Send</button><button class="btn secondary" id="issueCancel">Cancel</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#issueCancel').onclick = () => modal.remove();
    modal.querySelector('#issueSend').onclick = async () => {
      const title = modal.querySelector('#issueTitle').value.trim();
      const desc = modal.querySelector('#issueDesc').value.trim();
      const priority = modal.querySelector('#issuePriority').value;
      const category = modal.querySelector('#issueCategory').value;
      if (!title || !desc) return alert('Please provide title and description');
      try {
        await addDoc(collection(db,'issues'), {
          reporterId: uid,
          title,
          description: desc,
          priority,
          category,
          status: 'open',
          createdAt: new Date().toISOString()
        });
        alert('Issue reported. Admin will review.');
        modal.remove();
      } catch (err) { console.error('report issue', err); alert('Failed to send issue: ' + err.message); }
    };
  } catch (err) { console.error('openReportIssueModal', err); }
}

/* ---------- Forgot password (OTP-backed) ---------- */
// This implementation writes an OTP doc to "passwordResets" collection. A backend/cloud-function is expected to send the email.
export async function requestPasswordResetOTP(email) {
  try {
    if (!email) return alert('Enter email');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15*60*1000).toISOString();
    await addDoc(collection(db,'passwordResets'), { email, otp, expires, createdAt: new Date().toISOString(), used: false });
    alert('OTP generated and stored. (In production your system should email the OTP automatically).');
    return true;
  } catch (err) { console.error('requestPasswordResetOTP', err); alert('Failed to request OTP: ' + err.message); return false; }
}

export async function verifyPasswordResetOTP(email, otp, newPassword) {
  try {
    // find matching reset doc
    const snap = await getDocs(query(collection(db,'passwordResets'), where('email','==', email), where('otp','==', otp)));
    if (snap.empty) return alert('Invalid OTP');
    const docRef = snap.docs[0];
    const data = docRef.data();
    if (new Date(data.expires) < new Date()) return alert('OTP expired');
    // in real system, use admin SDK to change password or send reset link; here we call firebase.auth() reset link method
    await sendPasswordResetEmail(auth, email);
    // mark used
    await updateDoc(doc(db,'passwordResets', docRef.id), { used: true, usedAt: new Date().toISOString() });
    alert('OTP verified. A password reset email was sent to your address.');
    return true;
  } catch (err) { console.error('verifyPasswordResetOTP', err); alert('Failed to verify OTP: ' + err.message); return false; }
}

/* ---------- Notifications preferences (save) ---------- */
export async function saveNotificationPreferences(uid, { sms = false, email = true, inApp = true } = {}) {
  try {
    await setDoc(doc(db,'users',uid), { notificationPrefs: { sms, email, inApp } }, { merge: true });
    alert('Notification preferences saved.');
  } catch (err) { console.error('saveNotificationPreferences', err); alert('Failed to save preferences: ' + err.message); }
}

/* ---------- Utilities and small glue functions used by part1 and part3 ---------- */
export function generateGoogleCalendarLink({ title, details, location, start, end }) {
  const fmt = (d) => { return d.toISOString().replace(/-|:|\.\d+/g, ''); };
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, details: details || '', location: location || '', dates: `${fmt(start)}/${fmt(end)}` });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

/* Cleanup helper: remove all chat pollers (used when navigating away) */
export function cleanupAllChatPollers() {
  Object.keys(CHAT_POLLERS).forEach(id => { clearInterval(CHAT_POLLERS[id]); delete CHAT_POLLERS[id]; });
}

/* ---------- End of PART 2 ---------- */
