// ====================== CONFIGURATION ======================
const API_BASE = window.location.origin;
let currentUser = null;
let selectedChatUser = null;
let pollingInterval = null;

// ====================== UTILITY FUNCTIONS ======================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ====================== AUTHENTICATION ======================
const Auth = {
  init() {
    // Check if we're on the login page
    const step1 = document.getElementById('step1');
    if (!step1) return;

    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const otpInput = document.getElementById('otp');
    const step1Error = document.getElementById('step1Error');
    const step2Error = document.getElementById('step2Error');
    const displayEmail = document.getElementById('displayEmail');
    let currentEmail = '';

    document.getElementById('sendOtpBtn').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      if (!name || !email) {
        step1Error.textContent = 'Name and email are required';
        return;
      }
      if (!email.includes('@')) {
        step1Error.textContent = 'Valid email required';
        return;
      }
      step1Error.textContent = '';

      try {
        const res = await fetch(`${API_BASE}/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

        currentEmail = email;
        displayEmail.textContent = email;
        document.getElementById('step1').classList.add('hidden');
        document.getElementById('step2').classList.remove('hidden');
      } catch (err) {
        step1Error.textContent = err.message;
      }
    });

    document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
      const otp = otpInput.value.trim();
      if (otp.length !== 6) {
        step2Error.textContent = 'Enter 6-digit OTP';
        return;
      }
      step2Error.textContent = '';

      try {
        const res = await fetch(`${API_BASE}/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentEmail,
            otp,
            name: nameInput.value.trim()
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Verification failed');

        localStorage.setItem('lightchat_user', JSON.stringify({ email: currentEmail, name: nameInput.value.trim() }));
        window.location.href = '/chat';
      } catch (err) {
        step2Error.textContent = err.message;
      }
    });

    document.getElementById('backToStep1').addEventListener('click', () => {
      document.getElementById('step2').classList.add('hidden');
      document.getElementById('step1').classList.remove('hidden');
    });
  }
};

// ====================== CHAT APPLICATION ======================
const Chat = {
  init() {
    // Check if we're on the chat page
    const userListContainer = document.getElementById('userList');
    if (!userListContainer) return;

    // Load current user from localStorage
    const stored = localStorage.getItem('lightchat_user');
    if (!stored) {
      window.location.href = '/';
      return;
    }
    currentUser = JSON.parse(stored);

    // Display current user name
    document.getElementById('currentUserName').textContent = currentUser.name;

    // Bind events
    document.getElementById('logoutBtn').addEventListener('click', () => {
      localStorage.removeItem('lightchat_user');
      window.location.href = '/';
    });

    document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
      if (!confirm('Delete your account and all messages? This cannot be undone.')) return;
      try {
        await fetch(`${API_BASE}/delete-account`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentUser.email })
        });
        localStorage.removeItem('lightchat_user');
        window.location.href = '/';
      } catch (err) {
        alert('Failed to delete account');
      }
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.loadUsers(e.target.value);
    });

    document.getElementById('messageForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('messageInput');
      const message = input.value.trim();
      if (!message || !selectedChatUser) return;

      try {
        await fetch(`${API_BASE}/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderEmail: currentUser.email,
            receiverEmail: selectedChatUser.email,
            message
          })
        });
        input.value = '';
        this.loadMessages();
      } catch (err) {
        alert('Failed to send message');
      }
    });

    // Cleanup polling on page unload
    window.addEventListener('beforeunload', () => {
      if (pollingInterval) clearInterval(pollingInterval);
    });

    // Initial user load
    this.loadUsers();
  },

  async loadUsers(searchTerm = '') {
    try {
      const res = await fetch(`${API_BASE}/users`);
      const users = await res.json();
      const filtered = users.filter(u =>
        u.email !== currentUser.email &&
        (u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      this.renderUserList(filtered);
    } catch (err) {
      console.error('Failed to load users', err);
    }
  },

  renderUserList(users) {
    const container = document.getElementById('userList');
    if (users.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-4">No users found</p>';
      return;
    }
    container.innerHTML = users.map(user => `
      <div class="user-item p-3 rounded-lg hover:bg-white/5 cursor-pointer transition flex items-center gap-3" data-email="${user.email}" data-name="${user.name}">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">${user.name.charAt(0).toUpperCase()}</div>
        <div>
          <p class="font-medium">${user.name}</p>
          <p class="text-xs text-gray-400">${user.email}</p>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.user-item').forEach(el => {
      el.addEventListener('click', () => this.selectUser(el.dataset.email, el.dataset.name));
    });
  },

  selectUser(email, name) {
    selectedChatUser = { email, name };
    document.getElementById('chatWithName').textContent = name;
    document.getElementById('chatWithEmail').textContent = email;
    document.getElementById('messageInputArea').classList.remove('hidden');
    this.loadMessages();
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => this.loadMessages(), 2000);
  },

  async loadMessages() {
    if (!selectedChatUser) return;
    try {
      const res = await fetch(`${API_BASE}/messages/${currentUser.email}?with=${selectedChatUser.email}`);
      const messages = await res.json();
      this.renderMessages(messages);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  },

  renderMessages(messages) {
    const container = document.getElementById('messageContainer');
    if (messages.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-500 mt-10">No messages yet. Say hello! 👋</div>';
      return;
    }
    container.innerHTML = messages.map(msg => {
      const isSentByMe = msg.senderEmail === currentUser.email;
      return `
        <div class="flex ${isSentByMe ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[70%] rounded-2xl px-4 py-2 ${isSentByMe ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'}">
            <p>${escapeHtml(msg.message)}</p>
            <p class="text-xs opacity-70 mt-1">${formatTime(msg.timestamp)}</p>
          </div>
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }
};

// ====================== ADMIN PANEL ======================
const Admin = {
  init() {
    const loginSection = document.getElementById('loginSection');
    if (!loginSection) return; // Not admin page

    let authHeaders = {};
    const dashboard = document.getElementById('dashboard');
    const loginError = document.getElementById('loginError');

    document.getElementById('loginBtn').addEventListener('click', async () => {
      const email = document.getElementById('adminEmail').value.trim();
      const password = document.getElementById('adminPassword').value;
      if (!email || !password) {
        loginError.textContent = 'Both fields required';
        return;
      }

      authHeaders = { email, password };

      try {
        const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders });
        if (!res.ok) throw new Error('Invalid credentials');
        const users = await res.json();
        this.showDashboard(users, authHeaders);
      } catch (err) {
        loginError.textContent = err.message;
      }
    });

    document.getElementById('logoutAdminBtn').addEventListener('click', () => {
      authHeaders = {};
      dashboard.classList.add('hidden');
      loginSection.classList.remove('hidden');
      document.getElementById('adminEmail').value = '';
      document.getElementById('adminPassword').value = '';
    });
  },

  showDashboard(users, authHeaders) {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    this.renderUserTable(users, authHeaders);
  },

  renderUserTable(users, authHeaders) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = users.map(user => `
      <tr class="border-t border-white/10">
        <td class="px-6 py-3">${user.name}</td>
        <td class="px-6 py-3">${user.email}</td>
        <td class="px-6 py-3">${new Date(user.createdAt).toLocaleDateString()}</td>
        <td class="px-6 py-3">
          <button class="delete-user-btn text-red-400 hover:text-red-300" data-email="${user.email}">Delete</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const email = e.target.dataset.email;
        if (!confirm(`Delete user ${email} and all their messages?`)) return;
        try {
          await fetch(`${API_BASE}/admin/delete-user`, {
            method: 'DELETE',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders });
          const updated = await res.json();
          this.renderUserTable(updated, authHeaders);
        } catch (err) {
          alert('Failed to delete user');
        }
      });
    });
  }
};

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', () => {
  // Determine which page we're on by checking key elements
  if (document.getElementById('step1')) {
    Auth.init();
  } else if (document.getElementById('userList')) {
    Chat.init();
  } else if (document.getElementById('loginSection')) {
    Admin.init();
  }
});
