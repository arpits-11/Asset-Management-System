const BASE_URL = 'https://asset-management-system-wgix.onrender.com';

let currentUser = null;
let allUsers = [];
let editingUserId = null;
let deleteUserId = null;

const getToken = () => localStorage.getItem('ams_token');
const authHdrs = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
});

function showMsg(elId, message, type = 'error') {
    const el = document.getElementById(elId);
    if (!el) return;
    el.className = type === 'error' ? 'error-msg' : type === 'success' ? 'success-msg' : 'info-msg';
    el.textContent = message;
    el.style.display = 'block';
}

function clearMsg(elId) {
    const el = document.getElementById(elId);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
}

window.addEventListener('load', () => {
    const token = localStorage.getItem('ams_token');
    const user = JSON.parse(localStorage.getItem('ams_user') || 'null');
    if (token && user) {
        currentUser = user;
        showApp();
    } else {
        showAuth();
    }
});

function switchAuthTab(tab) {
    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('auth-title').textContent = tab === 'login' ? 'Welcome Back' : 'Create Account';
    document.getElementById('auth-subtitle').textContent = tab === 'login'
        ? 'Sign in to your account to continue'
        : 'Register to request access to the system';
    clearMsg('login-msg');
    clearMsg('register-msg');
}

function showAuth() {
    document.getElementById('auth-page').style.display = 'block';
    document.getElementById('app').style.display = 'none';
}

function showApp() {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    document.getElementById('sidebar-name').textContent = currentUser.name;
    document.getElementById('sidebar-role').textContent = currentUser.role;
    document.getElementById('sidebar-avatar').textContent = currentUser.name[0].toUpperCase();
    document.getElementById('topbar-name').textContent = currentUser.name;
    document.getElementById('topbar-badge').innerHTML =
        `<span class="badge badge-${currentUser.role}">${currentUser.role}</span>`;


    if (currentUser.role !== 'admin') {
        document.getElementById('nav-users').style.display = 'none';
        document.getElementById('nav-approvals').style.display = 'none';
        document.getElementById('admin-nav-section').style.display = 'none';
    }
    if (currentUser.role === 'employee') {
        document.getElementById('nav-activity').style.display = 'none';
    }

    showPage('dashboard');
    loadDashboard();
    if (currentUser.role === 'admin') loadPendingBadge();
}

async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    clearMsg('login-msg');

    if (!email && !password) { showMsg('login-msg', '⚠️ Email and password are required.'); return; }
    if (!email) { showMsg('login-msg', '⚠️ Please enter your email address.'); return; }
    if (!password) { showMsg('login-msg', '⚠️ Please enter your password.'); return; }
    if (!email.includes('@') || !email.includes('.')) { showMsg('login-msg', '⚠️ Please enter a valid email address.'); return; }

    const btn = document.querySelector('#login-form .btn-primary');
    btn.textContent = 'Signing in...';
    btn.disabled = true;

    try {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('ams_token', data.token);
            localStorage.setItem('ams_user', JSON.stringify(data.user));
            currentUser = data.user;
            showApp();
        } else {
            showMsg('login-msg', data.message);
        }
    } catch (err) {
        showMsg('login-msg', 'Could not connect to server. Make sure the server is running.');
    } finally {
        btn.textContent = 'Sign In →';
        btn.disabled = false;
    }
}

async function register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const department = document.getElementById('reg-department').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    clearMsg('register-msg');

    if (!name) { showMsg('register-msg', '⚠️ Full name is required.'); return; }
    if (name.length < 3) { showMsg('register-msg', '⚠️ Name must be at least 3 characters.'); return; }
    if (!email) { showMsg('register-msg', '⚠️ Email address is required.'); return; }
    if (!email.includes('@') || !email.includes('.')) { showMsg('register-msg', '⚠️ Please enter a valid email address.'); return; }
    if (!password) { showMsg('register-msg', '⚠️ Password is required.'); return; }
    if (password.length < 6) { showMsg('register-msg', '⚠️ Password must be at least 6 characters.'); return; }
    if (!/^(?=.*[0-9])(?=.*[@$#&])/.test(password)) { showMsg('register-msg', '⚠️ Password must contain both a number a special character(@$#&).'); return; }
    if (!confirm) { showMsg('register-msg', '⚠️ Please confirm your password.'); return; }
    if (password !== confirm) { showMsg('register-msg', '⚠️ Passwords do not match.'); return; }

    const btn = document.querySelector('#register-form .btn-primary');
    btn.textContent = 'Creating account...';
    btn.disabled = true;

    try {
        const res = await fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, department, phone })
        });
        const data = await res.json();

        if (res.ok) {
            if (data.isFirstUser) {
                showMsg('register-msg',
                    '🎉 You are the first user — you have been made Admin! Please sign in.', 'success');
            } else {
                showMsg('register-msg',
                    '✅ Registration successful! Your account is pending admin approval. You will be notified once approved.', 'success');
            }

            document.getElementById('reg-name').value = '';
            document.getElementById('reg-email').value = '';
            document.getElementById('reg-password').value = '';
            document.getElementById('reg-confirm').value = '';
            document.getElementById('reg-department').value = '';
            document.getElementById('reg-phone').value = '';


            setTimeout(() => switchAuthTab('login'), 2500);
        } else {
            showMsg('register-msg', data.message);
        }
    } catch (err) {
        showMsg('register-msg', 'Could not connect to server. Make sure the server is running.');
    } finally {
        btn.textContent = 'Create Account →';
        btn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('ams_token');
    localStorage.removeItem('ams_user');
    currentUser = null;
    allUsers = [];
    showAuth();
    switchAuthTab('login');
}

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');
    document.getElementById(`nav-${page}`)?.classList.add('active');

    const titles = {
        dashboard: '📊 Dashboard',
        users: '👥 User Management',
        approvals: '✅ Pending Approvals',
        activity: '📋 Activity Log',
        assets: '📦 All Assets',
        categories: '🗂️ Categories',
        inventory: '🏭 Inventory',
        maintenance: '🔧 Maintenance',
        alerts: '🔔 Alerts',
        reports: '📈 Reports',
        depreciation: '📉 Depreciation',
        insurance: '🛡️ Insurance',
        finance: '💰 Finance Dashboard'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    if (page === 'dashboard') loadDashboard();
    if (page === 'users') loadUsers();
    if (page === 'approvals') loadPendingUsers();
    if (page === 'activity') loadActivity();
    if (page === 'inventory') loadInventory();
}

//Dashboard 
async function loadDashboard() {
    try {
        const res = await fetch(`${BASE_URL}/api/dashboard/stats`, { headers: authHdrs() });
        if (res.status === 401) {
            logout();
            return;
        }
        const data = await res.json();

        document.getElementById('stat-total-users').textContent = data.totalUsers;
        document.getElementById('stat-active-users').textContent = data.activeUsers;
        document.getElementById('stat-managers').textContent = data.managerCount;
        document.getElementById('stat-pending').textContent = data.pendingUsers;

        renderDashboardActivity(data.recentActivities);
        renderRoleDistribution(data);
    } catch (err) {
        console.log('Dashboard error:', err);
    }
}

function renderDashboardActivity(activities) {
    const el = document.getElementById('dashboard-activity');
    if (!activities || !activities.length) {
        el.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px; font-size:14px;">No activity yet.</p>';
        return;
    }
    el.innerHTML = activities.map(a => `
        <div class="activity-item">
            <div class="activity-dot"></div>
            <div>
                <div class="activity-text">
                    <strong>${a.userName}</strong>
                    <span style="color:#94a3b8;"> — ${a.action}</span>
                    ${a.detail ? `<span style="color:#64748b;"> · ${a.detail}</span>` : ''}
                </div>
                <div class="activity-time">${new Date(a.createdAt).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
}

function renderRoleDistribution(data) {
    const el = document.getElementById('role-distribution');
    const total = data.totalUsers || 1;
    el.innerHTML = [
        { label: 'Admins', count: data.adminCount, color: '#4f6ef7', bg: 'rgba(79,110,247,0.15)' },
        { label: 'Managers', count: data.managerCount, color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
        { label: 'Employees', count: data.employeeCount, color: '#22c55e', bg: 'rgba(34,197,94,0.15)' }
    ].map(r => {
        const pct = Math.round((r.count / total) * 100);
        return `
        <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:13px; color:#94a3b8;">${r.label}</span>
                <span style="font-size:13px; font-weight:600; color:${r.color};">${r.count}</span>
            </div>
            <div style="background:${r.bg}; border-radius:20px; height:8px; overflow:hidden;">
                <div style="background:${r.color}; width:${pct}%; height:100%; border-radius:20px; transition:width 0.5s;"></div>
            </div>
        </div>`;
    }).join('');
}

async function loadUsers() {
    try {
        const res = await fetch(`${BASE_URL}/api/users`, { headers: authHdrs() });
        allUsers = await res.json();
        renderUsers(allUsers);
    } catch (err) {
        console.log('Error loading users:', err);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('users-table-body');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:30px;">No users found</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:32px; height:32px; border-radius:50%; background:#4f6ef7;
                        display:flex; align-items:center; justify-content:center;
                        font-weight:700; font-size:13px; flex-shrink:0;">
                        ${u.name[0].toUpperCase()}
                    </div>
                    <span>${u.name}</span>
                </div>
            </td>
            <td style="color:#94a3b8;">${u.email}</td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td style="color:#94a3b8;">${u.department || '—'}</td>
            <td><span class="badge ${u.isActive ? 'badge-active' : 'badge-inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
            <td style="color:#94a3b8; font-size:13px;">
                ${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
            </td>
            <td>
                ${currentUser.role === 'admin' && u._id !== currentUser._id ? `
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-outline btn-sm" onclick="openEditUserModal('${u._id}')">✏️ Edit</button>
                        <button class="btn btn-danger  btn-sm" onclick="openDeleteModal('${u._id}', '${u.name}')">🗑️</button>
                    </div>
                ` : '<span style="color:#475569; font-size:12px;">—</span>'}
            </td>
        </tr>
    `).join('');
}

function filterUsers() {
    const search = document.getElementById('user-search').value.toLowerCase();
    const role = document.getElementById('user-role-filter').value;
    const status = document.getElementById('user-status-filter').value;

    const filtered = allUsers.filter(u => {
        const matchSearch = u.name.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search) ||
            (u.department || '').toLowerCase().includes(search);
        const matchRole = !role || u.role === role;
        const matchStatus = status === '' || u.isActive.toString() === status;
        return matchSearch && matchRole && matchStatus;
    });
    renderUsers(filtered);
}

async function loadPendingUsers() {
    try {
        const res = await fetch(`${BASE_URL}/api/users/pending`, { headers: authHdrs() });
        const users = await res.json();
        renderPendingUsers(users);
        updatePendingBadge(users.length);
    } catch (err) {
        console.log('Error loading pending users:', err);
    }
}

async function loadPendingBadge() {
    try {
        const res = await fetch(`${BASE_URL}/api/users/pending`, { headers: authHdrs() });
        const users = await res.json();
        updatePendingBadge(users.length);
    } catch (err) { }
}

function updatePendingBadge(count) {
    const badge = document.getElementById('pending-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

function renderPendingUsers(users) {
    const el = document.getElementById('pending-list');
    if (!users.length) {
        el.innerHTML = `
            <div style="text-align:center; padding:60px;">
                <div style="font-size:3rem; margin-bottom:12px;">✅</div>
                <p style="color:#94a3b8; font-size:14px;">No pending approvals. All caught up!</p>
            </div>`;
        return;
    }
    el.innerHTML = users.map(u => `
        <div class="pending-card">
            <div class="pending-info">
                <div class="pending-avatar">${u.name[0].toUpperCase()}</div>
                <div>
                    <div class="pending-name">${u.name}</div>
                    <div class="pending-email">${u.email}
                        ${u.department ? ` · ${u.department}` : ''}
                        ${u.phone ? ` · ${u.phone}` : ''}
                    </div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">
                        Registered: ${new Date(u.createdAt).toLocaleString()}
                    </div>
                </div>
            </div>
            <div class="pending-actions">
                <select id="role-select-${u._id}"
                    style="padding:6px 10px; background:#0f1117; border:1px solid #2d3148;
                    border-radius:6px; color:#f1f5f9; font-size:13px; font-family:system-ui;">
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                </select>
                <button class="btn btn-success btn-sm" onclick="approveUser('${u._id}')">✅ Approve</button>
                <button class="btn btn-danger  btn-sm" onclick="rejectUser('${u._id}', '${u.name}')">❌ Reject</button>
            </div>
        </div>
    `).join('');
}

async function approveUser(userId) {
    const roleEl = document.getElementById(`role-select-${userId}`);
    const role = roleEl ? roleEl.value : 'employee';
    try {
        const res = await fetch(`${BASE_URL}/api/users/${userId}/approve`, {
            method: 'PUT',
            headers: authHdrs(),
            body: JSON.stringify({ role })
        });
        if (res.ok) {
            loadPendingUsers();
            loadDashboard();
        }
    } catch (err) {
        console.log('Approve error:', err);
    }
}

async function rejectUser(userId, userName) {
    if (!confirm(`Reject and delete registration for "${userName}"?`)) return;
    try {
        await fetch(`${BASE_URL}/api/users/${userId}/reject`, {
            method: 'DELETE', headers: authHdrs()
        });
        loadPendingUsers();
        loadDashboard();
    } catch (err) {
        console.log('Reject error:', err);
    }
}


function openUserModal() {
    editingUserId = null;
    document.getElementById('user-modal-title').textContent = 'Add New User';
    document.getElementById('save-user-btn').textContent = 'Add User';
    document.getElementById('u-password-group').style.display = 'block';
    document.getElementById('u-name').value = '';
    document.getElementById('u-email').value = '';
    document.getElementById('u-password').value = '';
    document.getElementById('u-role').value = 'employee';
    document.getElementById('u-department').value = '';
    document.getElementById('u-phone').value = '';
    clearMsg('user-modal-error');
    clearMsg('user-modal-success');
    document.getElementById('user-modal').classList.add('open');
}

function openEditUserModal(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;
    editingUserId = userId;
    document.getElementById('user-modal-title').textContent = 'Edit User';
    document.getElementById('save-user-btn').textContent = 'Save Changes';
    document.getElementById('u-password-group').style.display = 'none';
    document.getElementById('u-name').value = user.name;
    document.getElementById('u-email').value = user.email;
    document.getElementById('u-role').value = user.role;
    document.getElementById('u-department').value = user.department || '';
    document.getElementById('u-phone').value = user.phone || '';
    clearMsg('user-modal-error');
    clearMsg('user-modal-success');
    document.getElementById('user-modal').classList.add('open');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.remove('open');
    editingUserId = null;
}

async function saveUser() {
    const name = document.getElementById('u-name').value.trim();
    const email = document.getElementById('u-email').value.trim();
    const password = document.getElementById('u-password').value;
    const role = document.getElementById('u-role').value;
    const department = document.getElementById('u-department').value.trim();
    const phone = document.getElementById('u-phone').value.trim();

    clearMsg('user-modal-error');
    clearMsg('user-modal-success');

    if (!name) { showMsg('user-modal-error', '⚠️ Full name is required.'); return; }
    if (name.length < 3) { showMsg('user-modal-error', '⚠️ Name must be at least 3 characters.'); return; }
    if (!email) { showMsg('user-modal-error', '⚠️ Email address is required.'); return; }
    if (!email.includes('@') || !email.includes('.')) { showMsg('user-modal-error', '⚠️ Please enter a valid email address.'); return; }
    if (!editingUserId) {
        if (!password) { showMsg('user-modal-error', '⚠️ Password is required.'); return; }
        if (password.length < 6) { showMsg('user-modal-error', '⚠️ Password must be at least 6 characters.'); return; }
        if (!/^(?=.*[0-9])(?=.*[@$#&])/.test(password)) { showMsg('register-msg', '⚠️ Password must contain both a number a special character(@$#&).'); return; }
    }
    if (!role) { showMsg('user-modal-error', '⚠️ Please select a role.'); return; }
    if (phone && !/^[0-9+\-\s()]{10}$/.test(phone)) { showMsg('user-modal-error', '⚠️ Please enter a valid phone number.'); return; }

    const btn = document.getElementById('save-user-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const url = editingUserId ? `${BASE_URL}/api/users/${editingUserId}` : `${BASE_URL}/api/users`;
        const method = editingUserId ? 'PUT' : 'POST';
        const body = editingUserId
            ? { name, role, department, phone }
            : { name, email, password, role, department, phone };

        const res = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(body) });
        const data = await res.json();

        if (res.ok) {
            showMsg('user-modal-success', editingUserId ? '✅ User updated successfully!' : '✅ User created successfully!', 'success');
            loadUsers();
            loadDashboard();
            setTimeout(() => closeUserModal(), 1500);
        } else {
            showMsg('user-modal-error', data.message);
        }
    } catch (err) {
        showMsg('user-modal-error', 'Could not connect to server.');
    } finally {
        btn.textContent = editingUserId ? 'Save Changes' : 'Add User';
        btn.disabled = false;
    }
}


function openDeleteModal(userId, userName) {
    deleteUserId = userId;
    document.getElementById('confirm-message').textContent =
        `Are you sure you want to permanently delete "${userName}"? This action cannot be undone.`;
    document.getElementById('confirm-modal').classList.add('open');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('open');
    deleteUserId = null;
}

async function confirmDelete() {
    if (!deleteUserId) return;
    const btn = document.getElementById('confirm-btn');
    btn.textContent = 'Deleting...';
    btn.disabled = true;
    try {
        await fetch(`${BASE_URL}/api/users/${deleteUserId}`, {
            method: 'DELETE', headers: authHdrs()
        });
        closeConfirmModal();
        loadUsers();
        loadDashboard();
    } catch (err) {
        console.log('Delete error:', err);
    } finally {
        btn.textContent = 'Delete';
        btn.disabled = false;
    }
}


async function loadActivity() {
    const el = document.getElementById('activity-log-list');
    el.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:40px; font-size:14px;">Loading...</p>';
    try {
        const res = await fetch(`${BASE_URL}/api/activity`, { headers: authHdrs() });
        const activities = await res.json();

        if (!activities.length) {
            el.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:40px; font-size:14px;">No activity yet.</p>';
            return;
        }

        const actionIcons = {
            login: '🔐',
            user_created: '➕',
            user_updated: '✏️',
            user_deleted: '🗑️',
            user_approved: '✅',
            user_rejected: '❌'
        };

        el.innerHTML = activities.map(a => `
            <div class="activity-item">
                <div style="font-size:20px; flex-shrink:0;">${actionIcons[a.action] || '📌'}</div>
                <div style="flex:1;">
                    <div class="activity-text">
                        <strong>${a.userName}</strong>
                        <span style="color:#94a3b8;"> — ${a.action.replace(/_/g, ' ')}</span>
                        ${a.detail ? `<span style="color:#64748b;"> · ${a.detail}</span>` : ''}
                    </div>
                    <div class="activity-time">${new Date(a.createdAt).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        el.innerHTML = '<p style="color:#ef4444; text-align:center; padding:40px; font-size:14px;">Error loading activity.</p>';
    }
}

setInterval(() => {
    if (currentUser?.role === 'admin') loadPendingBadge();
}, 60000);

let allAssets = [];
let allCategories = [];
let editingAssetId = null;
let editingCatId = null;
let viewingAsset = null;
let assigningAssetId = null;

const statusColors = {
    'active': 'badge-active',
    'in-repair': 'badge-in-repair',
    'disposed': 'badge-disposed',
    'lost': 'badge-lost',
    'reserved': 'badge-reserved'
};

const conditionColors = {
    'excellent': 'badge-excellent',
    'good': 'badge-good',
    'fair': 'badge-fair',
    'poor': 'badge-poor'
};

const historyIcons = {
    'assigned': '👤',
    'transferred': '🔄',
    'returned': '↩️',
    'active': '✅',
    'in-repair': '🔧',
    'disposed': '🗑️',
    'lost': '❌',
    'reserved': '🔒'
};

function formatCurrency(val) {
    return '₹' + Number(val || 0).toLocaleString('en-IN');
}
function formatDate(d) {
    if (!d) return '_';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const _origShowPage = showPage;
showPage = function (page) {
    _origShowPage(page);
    if (page === 'assets') { loadAssets(); loadAssetStats(); }
    if (page === 'categories') { loadCategories(); }
};

const _origShowApp = showApp;
showApp = function () {
    _origShowApp();
    if (currentUser?.role === 'employee') {
        const addAsset = document.getElementById('add-asset-btn');
        const addCat = document.getElementById('add-cat-btn');
        if (addAsset) addAsset.style.display = 'none';
        if (addCat) addCat.style.display = 'none';
    }
};

// Asset stats
async function loadAssetStats() {
    try {
        const res = await fetch(`${BASE_URL}/api/assets/stats/summary`, { headers: authHdrs() });
        const data = await res.json();
        document.getElementById('ast-total').textContent = data.total || 0;
        document.getElementById('ast-active').textContent = data.active || 0;
        document.getElementById('ast-repair').textContent = data.inRepair || 0;
        document.getElementById('ast-assigned').textContent = data.assigned || 0;
        document.getElementById('ast-value').textContent = formatCurrency(data.totalValue);
    }
    catch (err) { console.log('Asset stats error:', err); }
}

// Categories
async function loadCategories() {
    try {
        const res = await fetch(`${BASE_URL}/api/categories`, { headers: authHdrs() });
        if (res.status === 401) {
            console.log('Session expired. Please log in again.');
            logout();
            return;
        }
        const data = await res.json();

        allCategories = Array.isArray(data) ? data : [];
        renderCategories(allCategories);
        populateCategoryDropdowns();
    }
    catch (err) {
        console.log('Categories error:', err);
        allCategories = [];
    }
}

function renderCategories(cats) {
    const grid = document.getElementById('categories-grid');
    if (!cats.length) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px;">
                <div style="font-size:3rem; margin-bottom:12px;">🗂️</div>
                <p style="color:#94a3b8; margin-bottom:16px;">No categories yet. Add your first one!</p>
            </div>`;
        return;
    }
    grid.innerHTML = cats.map(c => `<div class="category-card">
            <div class="category-card-header">
                <div class="category-icon">${c.icon || '📦'}</div>
                <div>
                    <div class="category-name">${c.name}</div>
                    <div class="category-meta">
                        <span class="badge ${c.type === 'tangible' ? 'badge-active' : 'badge-admin'}" style="font-size:10px; padding:2px 6px;">
                            ${c.type}
                        </span>
                        &nbsp;
                        <span class="badge badge-pending" style="font-size:10px; padding:2px 6px;">
                            ${c.mobility}
                        </span>
                    </div>
                </div>
            </div>
            ${c.description ? `<p style="font-size:13px; color:#94a3b8;">${c.description}</p>` : ''}
            <div class="category-footer">
                <span class="category-count">0 assets</span>
                ${currentUser?.role !== 'employee' ? `
                <div class="category-actions">
                    <button class="btn btn-outline btn-sm" onclick="openEditCategoryModal('${c._id}')">✏️</button>
                    ${currentUser?.role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteCategory('${c._id}', '${c.name}')">🗑️</button>` : ''}
                </div>` : ''}
            </div>
        </div>`).join('');
}

function populateCategoryDropdowns() {
    const aCat = document.getElementById('a-category');
    if (aCat) {
        const val = aCat.value;
        aCat.innerHTML = '<option value="">Select category...</option>' + allCategories.map(c =>
            `<option value="${c._id}">${c.icon || '📦'}${c.name}</option>`).join('');
        if (val) aCat.value = val;
    }
    const fCat = document.getElementById('asset-category-filter');
    if (fCat) {
        const val = fCat.value;
        fCat.innerHTML = '<option value="">All Categories</option>' + allCategories.map(c =>
            `<option value="${c._id}">${c.name}</option>`).join('');
        if (val) fCat.value = val;
    }
}

// category modal
function openCategoryModal() {
    editingCatId = null;
    document.getElementById('cat-modal-title').textContent = 'Add Category';
    document.getElementById('save-cat-btn').textContent = 'Add Category';
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-type').value = 'tangible';
    document.getElementById('cat-mobility').value = 'moveable';
    document.getElementById('cat-icon').value = '';
    document.getElementById('cat-description').value = '';
    clearMsg('cat-modal-error');
    clearMsg('cat-modal-success');
    document.getElementById('category-modal').classList.add('open');
    setTimeout(() => document.getElementById('cat-name').focus(), 100);
}

function openEditCategoryModal(catId) {
    const cat = allCategories.find(c => c._id === catId);
    if (!cat) return;
    editingCatId = catId;
    document.getElementById('cat-modal-title').textContent = 'Edit Category';
    document.getElementById('save-cat-btn').textContent = 'Save Changes';
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-type').value = cat.type;
    document.getElementById('cat-mobility').value = cat.mobility;
    document.getElementById('cat-icon').value = cat.icon || '';
    document.getElementById('cat-description').value = cat.description || '';
    clearMsg('cat-modal-error');
    clearMsg('cat-modal-success');
    document.getElementById('category-modal').classList.add('open');
}

function closeCategoryModal() {
    document.getElementById('category-modal').classList.remove('open');
    editingCatId = null;
}

async function saveCategory() {
    const name = document.getElementById('cat-name').value.trim();
    const type = document.getElementById('cat-type').value;
    const mobility = document.getElementById('cat-mobility').value;
    const icon = document.getElementById('cat-icon').value.trim() || '📦';
    const description = document.getElementById('cat-description').value.trim();

    clearMsg('cat-modal-error');
    clearMsg('cat-modal-success');

    if (!name) { showMsg('cat-modal-error', '⚠️ Category name is required.'); return; }
    if (name.length < 2) { showMsg('cat-modal-error', '⚠️ Category name must be at least 2 characters.'); return; }
    if (name.length > 50) { showMsg('cat-modal-error', '⚠️ Category name must be under 50 characters.'); return; }
    if (!type) { showMsg('cat-modal-error', '⚠️ Please select a type (Tangible/Non-Tangible).'); return; }
    if (!mobility) { showMsg('cat-modal-error', '⚠️ Please select mobility (Moveable/Non-Moveable).'); return; }

    const btn = document.getElementById('save-cat-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const url = editingCatId ? `${BASE_URL}/api/categories/${editingCatId}` : `${BASE_URL}/api/categories`;
        const method = editingCatId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method, headers: authHdrs(),
            body: JSON.stringify({ name, type, mobility, icon, description })
        });
        const data = await res.json();

        if (res.ok) {
            showMsg('cat-modal-success', editingCatId ? '✅ Category updated!' : '✅ Category created!', 'success');
            loadCategories();
            setTimeout(() => closeCategoryModal(), 1500);
        } else {
            showMsg('cat-modal-error', data.message);
        }
    } catch (err) {
        showMsg('cat-modal-error', 'Could not connect to server.');
    } finally {
        btn.textContent = editingCatId ? 'Save Changes' : 'Add Category';
        btn.disabled = false;
    }
}

async function deleteCategory(catId, catName) {
    if (!confirm(`Delete category "${catName}"? This will fail if any assets use it.`)) return;
    try {
        const res = await fetch(`${BASE_URL}/api/categories/${catId}`, { method: 'DELETE', headers: authHdrs() });
        const data = await res.json();
        if (res.ok) { loadCategories(); }
        else { alert(data.message); }
    } catch (err) { console.log('Delete category error:', err); }
}

// Assets
async function loadAssets() {
    try {
        if (!allCategories.length) await loadCategories();
        const res = await fetch(`${BASE_URL}/api/assets`, { headers: authHdrs() });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        allAssets = Array.isArray(data) ? data : [];
        renderAssets(allAssets);
    } catch (err) { console.log('Assets error:', err); }
}

function renderAssets(assets) {
    const tbody = document.getElementById('assets-table-body');
    if (!assets.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:40px;">
            No assets found. ${currentUser?.role !== 'employee' ? 'Click "+ Add Asset" to get started.' : ''}
        </td></tr>`;
        return;
    }
    tbody.innerHTML = assets.map(a => `
        <tr>
            <td>
                <span style="font-family:monospace; font-size:12px; color:#4f6ef7;
                    background:rgba(79,110,247,0.1); padding:2px 8px; border-radius:4px;">
                    ${a.assetId}
                </span>
            </td>
            <td>
                <div style="font-weight:500;">${a.name}</div>
                ${a.subCategory ? `<div style="font-size:12px; color:#94a3b8;">${a.subCategory}</div>` : ''}
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span>${a.categoryId?.icon || '📦'}</span>
                    <span style="font-size:13px;">${a.categoryName || '—'}</span>
                </div>
            </td>
            <td><span class="badge ${statusColors[a.status] || 'badge-active'}">${a.status}</span></td>
            <td><span class="badge ${conditionColors[a.condition] || 'badge-good'}">${a.condition || 'good'}</span></td>
            <td style="color:#94a3b8; font-size:13px;">${a.location || '—'}</td>
            <td>
                ${a.assignedToName
            ? `<div style="display:flex; align-items:center; gap:6px;">
                         <div style="width:24px; height:24px; border-radius:50%; background:#4f6ef7;
                            display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">
                            ${a.assignedToName[0].toUpperCase()}
                         </div>
                         <span style="font-size:13px;">${a.assignedToName}</span>
                       </div>`
            : '<span style="color:#475569; font-size:13px;">Unassigned</span>'}
            </td>
            <td style="font-size:13px; font-weight:500; color:#22c55e;">${formatCurrency(a.currentValue)}</td>
            <td>
                <div class="asset-actions">
                    <button class="btn btn-outline btn-sm" onclick="openDetailModal('${a._id}')" title="View Details">👁️</button>
                    ${currentUser?.role !== 'employee' ? `
                    <button class="btn btn-outline btn-sm" onclick="openAssignModal('${a._id}')" title="Assign">👤</button>
                    <button class="btn btn-outline btn-sm" onclick="openEditAssetModal('${a._id}')" title="Edit">✏️</button>
                    ` : ''}
                    ${currentUser?.role === 'admin' ? `
                    <button class="btn btn-danger  btn-sm" onclick="deleteAsset('${a._id}', '${a.name.replace(/'/g, "\\'")}')" title="Delete">🗑️</button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function filterAssets() {
    const search = document.getElementById('asset-search').value.toLowerCase();
    const status = document.getElementById('asset-status-filter').value;
    const category = document.getElementById('asset-category-filter').value;
    const type = document.getElementById('asset-type-filter').value;

    const filtered = allAssets.filter(a => {
        const matchSearch = !search ||
            (a.name || '').toLowerCase().includes(search) ||
            (a.assetId || '').toLowerCase().includes(search) ||
            (a.serialNumber || '').toLowerCase().includes(search) ||
            (a.location || '').toLowerCase().includes(search) ||
            (a.assignedToName || '').toLowerCase().includes(search);
        const matchStatus = !status || a.status === status;
        const matchCategory = !category || a.categoryId?._id === category || a.categoryId === category;
        const matchType = !type || a.categoryId?.type === type;
        return matchSearch && matchStatus && matchCategory && matchType;
    });
    renderAssets(filtered);
}

// Asset modal
async function openAssetModal() {
    editingAssetId = null;
    document.getElementById('asset-modal-title').textContent = 'Add New Asset';
    document.getElementById('save-asset-btn').textContent = 'Add Asset';

    ['a-name', 'a-subcategory', 'a-description', 'a-purchase-price',
        'a-current-value', 'a-vendor', 'a-serial', 'a-tag', 'a-location'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    document.getElementById('a-category').value = '';
    document.getElementById('a-status').value = 'active';
    document.getElementById('a-condition').value = 'good';
    document.getElementById('a-purchase-date').value = '';
    document.getElementById('a-warranty').value = '';

    clearMsg('asset-modal-error');
    clearMsg('asset-modal-success');

    if (!allCategories.length) await loadCategories();
    populateCategoryDropdowns();
    await populateUserDropdown('a-assigned-to', '');

    document.getElementById('asset-modal').classList.add('open');
}

async function openEditAssetModal(assetId) {
    const asset = allAssets.find(a => a._id === assetId);
    if (!asset) return;
    editingAssetId = assetId;

    document.getElementById('asset-modal-title').textContent = 'Edit Asset';
    document.getElementById('save-asset-btn').textContent = 'Save Changes';

    document.getElementById('a-name').value = asset.name || '';
    document.getElementById('a-subcategory').value = asset.subCategory || '';
    document.getElementById('a-description').value = asset.description || '';
    document.getElementById('a-status').value = asset.status || 'active';
    document.getElementById('a-condition').value = asset.condition || 'good';
    document.getElementById('a-purchase-price').value = asset.purchasePrice || '';
    document.getElementById('a-current-value').value = asset.currentValue || '';
    document.getElementById('a-vendor').value = asset.vendorName || '';
    document.getElementById('a-serial').value = asset.serialNumber || '';
    document.getElementById('a-tag').value = asset.assetTag || '';
    document.getElementById('a-location').value = asset.location || '';

    if (asset.purchaseDate)
        document.getElementById('a-purchase-date').value = new Date(asset.purchaseDate).toISOString().split('T')[0];
    if (asset.warrantyExpiry)
        document.getElementById('a-warranty').value = new Date(asset.warrantyExpiry).toISOString().split('T')[0];

    if (!allCategories.length) await loadCategories();
    populateCategoryDropdowns();
    document.getElementById('a-category').value = asset.categoryId?._id || asset.categoryId || '';

    await populateUserDropdown('a-assigned-to', asset.assignedTo?._id || asset.assignedTo || '');

    clearMsg('asset-modal-error');
    clearMsg('asset-modal-success');
    document.getElementById('asset-modal').classList.add('open');
}

function closeAssetModal() {
    document.getElementById('asset-modal').classList.remove('open');
    editingAssetId = null;
}

async function saveAsset() {
    const catEl = document.getElementById('a-category');
    const catName = catEl.options[catEl.selectedIndex]?.text?.replace(/^..\s/, '') || '';
    const assignEl = document.getElementById('a-assigned-to');
    const assignedToName = assignEl.options[assignEl.selectedIndex]?.text || '';

    const body = {
        name: document.getElementById('a-name').value.trim(),
        description: document.getElementById('a-description').value.trim(),
        categoryId: document.getElementById('a-category').value,
        categoryName: catName,
        subCategory: document.getElementById('a-subcategory').value.trim(),
        status: document.getElementById('a-status').value,
        condition: document.getElementById('a-condition').value,
        purchaseDate: document.getElementById('a-purchase-date').value,
        purchasePrice: parseFloat(document.getElementById('a-purchase-price').value) || 0,
        currentValue: parseFloat(document.getElementById('a-current-value').value) || 0,
        vendorName: document.getElementById('a-vendor').value.trim(),
        serialNumber: document.getElementById('a-serial').value.trim(),
        assetTag: document.getElementById('a-tag').value.trim(),
        warrantyExpiry: document.getElementById('a-warranty').value,
        location: document.getElementById('a-location').value.trim(),
        assignedTo: assignEl.value || null,
        assignedToName: assignEl.value ? assignedToName : ''
    };

    clearMsg('asset-modal-error');
    clearMsg('asset-modal-success');

    if (!body.name) { showMsg('asset-modal-error', '⚠️ Asset name is required.'); return; }
    if (body.name.length < 2) { showMsg('asset-modal-error', '⚠️ Asset name must be at least 2 characters.'); return; }
    if (body.name.length > 100) { showMsg('asset-modal-error', '⚠️ Asset name must be under 100 characters.'); return; }
    if (!body.categoryId) { showMsg('asset-modal-error', '⚠️ Please select a category.'); return; }
    if (body.purchasePrice < 0) { showMsg('asset-modal-error', '⚠️ Purchase price cannot be negative.'); return; }
    if (body.currentValue < 0) { showMsg('asset-modal-error', '⚠️ Current value cannot be negative.'); return; }
    if (body.purchaseDate && body.warrantyExpiry && new Date(body.warrantyExpiry) < new Date(body.purchaseDate)) {
        showMsg('asset-modal-error', '⚠️ Warranty expiry cannot be before purchase date.'); return;
    }
    if (body.purchaseDate && new Date(body.purchaseDate) > new Date()) {
        showMsg('asset-modal-error', '⚠️ Purchase date cannot be in the future.'); return;
    }

    const btn = document.getElementById('save-asset-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const url = editingAssetId ? `${BASE_URL}/api/assets/${editingAssetId}` : `${BASE_URL}/api/assets`;
        const method = editingAssetId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(body) });
        const data = await res.json();

        if (res.ok) {
            showMsg('asset-modal-success',
                editingAssetId ? `✅ Asset updated!` : `✅ Asset ${data.assetId} created!`, 'success');
            loadAssets();
            loadAssetStats();
            setTimeout(() => closeAssetModal(), 1500);
        } else {
            showMsg('asset-modal-error', data.error || data.message);
        }
    } catch (err) {
        showMsg('asset-modal-error', 'Could not connect to server.');
    } finally {
        btn.textContent = editingAssetId ? 'Save Changes' : 'Add Asset';
        btn.disabled = false;
    }
}

async function deleteAsset(assetId, assetName) {
    if (!confirm(`Permanently delete asset "${assetName}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${BASE_URL}/api/assets/${assetId}`, { method: 'DELETE', headers: authHdrs() });
        if (res.ok) { loadAssets(); loadAssetStats(); }
    } catch (err) { console.log('Delete asset error:', err); }
}

// Asset detail modal
async function openDetailModal(assetId) {
    try {
        const res = await fetch(`${BASE_URL}/api/assets/${assetId}`, { headers: authHdrs() });
        viewingAsset = await res.json();

        document.getElementById('detail-asset-name').textContent = viewingAsset.name;
        document.getElementById('detail-asset-id').textContent = viewingAsset.assetId;

        document.getElementById('detail-badges').innerHTML = `
            <span class="badge ${statusColors[viewingAsset.status]}">${viewingAsset.status}</span>
            <span class="badge ${conditionColors[viewingAsset.condition]}">${viewingAsset.condition}</span>
            ${viewingAsset.categoryName ? `<span class="badge badge-pending">${viewingAsset.categoryName}</span>` : ''}
            ${viewingAsset.subCategory ? `<span class="badge badge-pending">${viewingAsset.subCategory}</span>` : ''}
        `;

        document.getElementById('detail-info-grid').innerHTML = [
            ['Asset ID', viewingAsset.assetId],
            ['Serial No.', viewingAsset.serialNumber || '—'],
            ['Asset Tag', viewingAsset.assetTag || '—'],
            ['Location', viewingAsset.location || '—'],
            ['Vendor', viewingAsset.vendorName || '—'],
            ['Assigned To', viewingAsset.assignedToName || 'Unassigned'],
            ['Assigned Date', formatDate(viewingAsset.assignedDate)],
            ['Warranty', formatDate(viewingAsset.warrantyExpiry)]
        ].map(([label, val]) => `
            <div class="detail-row">
                <div class="detail-row-label">${label}</div>
                <div class="detail-row-value">${val}</div>
            </div>
        `).join('') +
            (viewingAsset.description ? `
            <div class="detail-row" style="grid-column:1/-1;">
                <div class="detail-row-label">Description</div>
                <div class="detail-row-value">${viewingAsset.description}</div>
            </div>
        ` : '');

        document.getElementById('detail-finance-grid').innerHTML = [
            ['Purchase Date', formatDate(viewingAsset.purchaseDate)],
            ['Purchase Price', formatCurrency(viewingAsset.purchasePrice)],
            ['Current Value', formatCurrency(viewingAsset.currentValue)],
            ['Depreciation', formatCurrency((viewingAsset.purchasePrice || 0) - (viewingAsset.currentValue || 0))]
        ].map(([label, val]) => `
            <div class="detail-row">
                <div class="detail-row-label">${label}</div>
                <div class="detail-row-value" style="color:#22c55e;">${val}</div>
            </div>
        `).join('');

        loadAssetHistory(assetId);

        switchDetailTab('info');
        document.getElementById('asset-detail-modal').classList.add('open');
        const editBtn = document.getElementById('edit-asset-btn');
        if (editBtn) {
            editBtn.style.display = currentUser?.role === 'employee' ? 'none' : 'flex';
        }
    } catch (err) { console.log('Detail error:', err); }
}

async function loadAssetHistory(assetId) {
    try {
        const res = await fetch(`${BASE_URL}/api/assets/${assetId}/history`, { headers: authHdrs() });
        const history = await res.json();
        const el = document.getElementById('detail-history-list');

        if (!history.length) {
            el.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:30px; font-size:14px;">No history yet.</p>';
            return;
        }

        el.innerHTML = history.map(h => `
            <div class="history-item">
                <div class="history-icon">${historyIcons[h.action] || '📌'}</div>
                <div>
                    <div class="history-text">
                        <strong>${h.action.charAt(0).toUpperCase() + h.action.slice(1)}</strong>
                        ${h.fromUser && h.toUser ? ` — ${h.fromUser} → ${h.toUser}` : ''}
                    </div>
                    ${h.notes ? `<div class="history-detail">${h.notes}</div>` : ''}
                    <div class="history-detail">By: ${h.performedBy}</div>
                    <div class="history-time">${new Date(h.createdAt).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    } catch (err) { console.log('History error:', err); }
}

function switchDetailTab(tab) {
    ['info', 'finance', 'history'].forEach(t => {
        document.getElementById(`dtab-${t}`).classList.toggle('active', t === tab);
        document.getElementById(`dtab-${t}-content`).style.display = t === tab ? 'block' : 'none';
    });
}
function closeDetailModal() {
    document.getElementById('asset-detail-modal').classList.remove('open');
    viewingAsset = null;
}

function editCurrentAsset() {
    if (!viewingAsset) return;
    const assetId = viewingAsset._id;
    closeDetailModal();
    openEditAssetModal(viewingAsset._id);
}

// Assign modal
async function openAssignModal(assetId) {
    assigningAssetId = assetId;
    const asset = allAssets.find(a => a._id === assetId);
    if (!asset) return;

    document.getElementById('assign-asset-name').textContent =
        `Assigning: ${asset.name} (${asset.assetId})`;
    document.getElementById('assign-location').value = asset.location || '';
    document.getElementById('assign-notes').value = '';
    clearMsg('assign-msg');

    await populateUserDropdown('assign-user-select', asset.assignedTo?._id || asset.assignedTo || '');
    document.getElementById('assign-modal').classList.add('open');
}

function closeAssignModal() {
    document.getElementById('assign-modal').classList.remove('open');
    assigningAssetId = null;
}

async function confirmAssign() {
    const selectEl = document.getElementById('assign-user-select');
    const assignedTo = selectEl.value;
    const assignedToName = selectEl.options[selectEl.selectedIndex]?.text || '';
    const location = document.getElementById('assign-location').value.trim();
    const notes = document.getElementById('assign-notes').value.trim();

    clearMsg('assign-msg');
    if (!assigningAssetId) { showMsg('assign-msg', '⚠️ No asset selected.'); return; }

    try {
        const res = await fetch(`${BASE_URL}/api/assets/${assigningAssetId}/assign`, {
            method: 'PUT',
            headers: authHdrs(),
            body: JSON.stringify({ assignedTo: assignedTo || null, assignedToName, location, notes })
        });

        if (res.ok) {
            showMsg('assign-msg', `✅ Asset assigned to ${assignedToName || 'Unassigned'}!`, 'success');
            loadAssets();
            loadAssetStats();
            setTimeout(() => closeAssignModal(), 1500);
        }
    } catch (err) { console.log('Assign error:', err); }
}

async function populateUserDropdown(selectId, selectedId) {
    try {
        const select = document.getElementById(selectId);
        if (!select) return;

        if (!allUsers.length) {
            const res = await fetch(`${BASE_URL}/api/users`, { headers: authHdrs() });
            allUsers = await res.json();
        }
        select.innerHTML = '<option value="">Unassigned</option>' +
            allUsers.filter(u => u.isActive && u.isApproved).map(u =>
                `<option value="${u._id}" ${u._id === selectedId ? 'selected' : ''}>${u.name} (${u.role})</option>`
            ).join('');
    } catch (err) { console.log('User dropdown error:', err); }
}

// csv import
function importAssetsCSV() {
    const input = document.getElementById('csv-file-input');
    input.value = '';
    input.click();
}
async function handleCSVFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
        alert('Please select a valid .csv file.');
        return;
    }
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length < 2) {
        alert('CSV file is empty or has no data rows.');
        return;
    }
    const headers = lines[0].split(',').map(h =>
        h.replace(/"/g, '').trim().toLowerCase().replace(/\s+/g, '')
    );
    const fieldMap = {
        'name': 'name',
        'assetname': 'name',
        'description': 'description',
        'category': 'category',
        'categoryname': 'category',
        'subcategory': 'subCategory',
        'status': 'status',
        'condition': 'condition',
        'location': 'location',
        'assignedto': 'assignedTo',
        'purchasedate': 'purchaseDate',
        'purchaseprice': 'purchasePrice',
        'currentvalue': 'currentValue',
        'vendor': 'vendor',
        'vendorname': 'vendor',
        'serialnumber': 'serialNumber',
        'serial': 'serialNumber',
        'assettag': 'assetTag',
        'warrantyexpiry': 'warrantyExpiry',
        'warranty': 'warrantyExpiry',
    };

    const assets = [];
    const parseErrors = [];
    for (let i = 1; i < lines.length; i++) {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (const char of lines[i]) {
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else { current += char; }
        }
        values.push(current.trim());
        const row = {};
        headers.forEach((h, idx) => {
            const field = fieldMap[h] || h;
            row[field] = values[idx]?.replace(/"/g, '').trim() || '';
        });
        if (!row.name) {
            parseErrors.push(`Row ${i + 1}: skipped — no name`);
            continue;
        }
        assets.push(row)

    }
    if (!assets.length) {
        alert('No valid rows found in CSV.\n\nMake sure your CSV has a "Name" column.');
        return;
    }

    const confirmMsg = `Found ${assets.length} asset(s) to import${parseErrors.length ? ` (${parseErrors.length} rows skipped)` : ''}.\n\nProceed?`;
    if (!confirm(confirmMsg)) return;

    const btn = document.querySelector('button[onclick="importAssetsCSV()"]');
    if (btn) { btn.textContent = '⏳ Importing...'; btn.disabled = true; }
    try {
        const res = await fetch(`${BASE_URL}/api/assets/bulk-import`, {
            method: 'POST',
            headers: authHdrs(),
            body: JSON.stringify({ assets })
        });
        const data = await res.json();

        if (res.ok) {
            let msg = `✅ ${data.message}`;
            if (data.errors && data.errors.length) {
                msg += `\n\nFailed rows:\n` + data.errors.join('\n');
            }
            alert(msg);
            loadAssets();
        } else {
            alert('❌ Import failed: ' + data.message);
        }
    } catch (err) {
        alert('❌ Could not connect to server.');
    } finally {
        if (btn) { btn.textContent = '📤 Bulk Import'; btn.disabled = false; }
    }
}

// csv export
function exportAssetsCSV() {
    if (!allAssets.length) { alert('No assets to export!'); return; }

    const headers = ['Asset ID', 'Name', 'Category', 'Sub Category', 'Status', 'Condition',
        'Location', 'Assigned To', 'Purchase Date', 'Purchase Price', 'Current Value',
        'Vendor', 'Serial Number', 'Warranty Expiry'];

    const rows = allAssets.map(a => [
        a.assetId, `"${a.name}"`, a.categoryName || '', a.subCategory || '',
        a.status, a.condition || '',
        `"${a.location || ''}"`, a.assignedToName || 'Unassigned',
        a.purchaseDate ? new Date(a.purchaseDate).toLocaleDateString() : '',
        a.purchasePrice || 0, a.currentValue || 0,
        `"${a.vendorName || ''}"`, a.serialNumber || '',
        a.warrantyExpiry ? new Date(a.warrantyExpiry).toLocaleDateString() : ''
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assets_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

const _origLoadDashboard = loadDashboard;
loadDashboard = async function () {
    await _origLoadDashboard();
    try {
        const res = await fetch(`${BASE_URL}/api/dashboard/stats`, { headers: authHdrs() });
        const data = await res.json();
        const tA = document.getElementById('stat-total-assets');
        const aA = document.getElementById('stat-active-assets');
        if (tA) tA.textContent = data.totalAssets || 0;
        if (aA) aA.textContent = data.activeAssets || 0;
    } catch (e) { }
};

window.addEventListener('load', () => {
    setTimeout(async () => {
        if (getToken()) await loadCategories();
    }, 1000);
});

let allMaintenance = [];
let editingMaintId = null;

const maintPriorityColors = {
    critical: 'badge-critical',
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low'
};
const maintStatusColors = {
    'pending': 'badge-pending',
    'in-progress': 'badge-in-progress',
    'completed': 'badge-completed',
    'cancelled': 'badge-cancelled'
};
const maintTypeColors = {
    scheduled: 'badge-scheduled',
    repair: 'badge-repair',
    inspection: 'badge-inspection',
    upgrade: 'badge-upgrade'
};

const _p2ShowPage = showPage;
showPage = function (page) {
    _p2ShowPage(page);
    if (page === 'maintenance') { loadMaintenance(); loadMaintenanceStats(); }
    if (page === 'alerts') { loadAlerts(); }
    if (page === 'reports') { loadReports(); }
};

const _p2ShowApp = showApp;
showApp = function () {
    _p2ShowApp();
    if (currentUser?.role === 'employee') {
        const btn = document.getElementById('add-maint-btn');
        if (btn) btn.style.display = 'none';
    }
    loadAlertBadge();
};

async function loadMaintenanceStats() {
    try {
        const res = await fetch(`${BASE_URL}/api/maintenance/stats`, { headers: authHdrs() });
        const data = await res.json();
        document.getElementById('m-total').textContent = data.total || 0;
        document.getElementById('m-pending').textContent = data.pending || 0;
        document.getElementById('m-inprogress').textContent = data.inProgress || 0;
        document.getElementById('m-overdue').textContent = data.overdue || 0;
        document.getElementById('m-cost').textContent = formatCurrency(data.totalCost);
    } catch (err) { console.log('Maint stats error:', err); }
}

async function loadMaintenance() {
    try {
        const res = await fetch(`${BASE_URL}/api/maintenance`, { headers: authHdrs() });
        allMaintenance = await res.json();
        renderMaintenance(allMaintenance);
    } catch (err) { console.log('Maintenance error:', err); }
}

function renderMaintenance(records) {
    const tbody = document.getElementById('maintenance-table-body');
    if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:40px;">
            No maintenance records. ${currentUser?.role !== 'employee' ? 'Click "+ Schedule Maintenance" to add one.' : ''}
        </td></tr>`;
        return;
    }

    const today = new Date();
    tbody.innerHTML = records.map(r => {
        const isOverdue = ['pending', 'in-progress'].includes(r.status) && new Date(r.scheduledDate) < today;
        return `
        <tr class="${isOverdue ? 'row-overdue' : ''}">
            <td>
                <div style="font-size:13px; font-weight:500;">${r.assetName || '—'}</div>
                <div style="font-size:11px; color:#4f6ef7; font-family:monospace;">${r.assetCode || ''}</div>
            </td>
            <td>
                <div style="font-size:13px; font-weight:500;">${r.title}</div>
                ${r.description ? `<div style="font-size:12px; color:#94a3b8;">${r.description}</div>` : ''}
            </td>
            <td><span class="badge ${maintTypeColors[r.type]}">${r.type}</span></td>
            <td><span class="badge ${maintPriorityColors[r.priority]}">${r.priority}</span></td>
            <td>
                <span class="badge ${maintStatusColors[r.status]}">${r.status}</span>
                ${isOverdue ? '<div style="font-size:10px; color:#ef4444; margin-top:2px;">⚠️ OVERDUE</div>' : ''}
            </td>
            <td style="font-size:13px; color:${isOverdue ? '#ef4444' : '#94a3b8'};">
                ${formatDate(r.scheduledDate)}
            </td>
            <td style="font-size:13px; color:#94a3b8;">${r.vendor || '—'}</td>
            <td style="font-size:13px; font-weight:500; color:#22c55e;">${r.cost ? formatCurrency(r.cost) : '—'}</td>
            <td>
                <div style="display:flex; gap:4px;">
                    ${currentUser?.role !== 'employee' ? `
                    <button class="btn btn-outline btn-sm" onclick="openEditMaintenanceModal('${r._id}')" title="Edit">✏️</button>
                    ${r.status === 'pending' || r.status === 'in-progress' ? `
                    <button class="btn btn-success btn-sm" onclick="markComplete('${r._id}')" title="Mark Complete">✅</button>` : ''}
                    ` : ''}
                    ${currentUser?.role === 'admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="deleteMaintenance('${r._id}')" title="Delete">🗑️</button>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterMaintenance() {
    const status = document.getElementById('maint-status-filter').value;
    const type = document.getElementById('maint-type-filter').value;
    const priority = document.getElementById('maint-priority-filter').value;

    const filtered = allMaintenance.filter(r => {
        const ms = !status || r.status === status;
        const mt = !type || r.type === type;
        const mp = !priority || r.priority === priority;
        return ms && mt && mp;
    });
    renderMaintenance(filtered);
}

async function openMaintenanceModal(assetId = '') {
    editingMaintId = null;
    document.getElementById('maint-modal-title').textContent = 'Schedule Maintenance';
    document.getElementById('save-maint-btn').textContent = 'Schedule';

    ['m-title', 'm-description', 'm-vendor', 'm-notes'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('m-type').value = 'scheduled';
    document.getElementById('m-priority').value = 'medium';
    document.getElementById('m-status').value = 'pending';
    document.getElementById('m-cost').value = '';
    document.getElementById('m-date').value = new Date().toISOString().split('T')[0];

    clearMsg('maint-modal-error');
    clearMsg('maint-modal-success');

    await populateAssetDropdown('m-asset', assetId);
    document.getElementById('maintenance-modal').classList.add('open');
}

async function openEditMaintenanceModal(maintId) {
    const record = allMaintenance.find(r => r._id === maintId);
    if (!record) return;
    editingMaintId = maintId;

    document.getElementById('maint-modal-title').textContent = 'Edit Maintenance';
    document.getElementById('save-maint-btn').textContent = 'Save Changes';

    document.getElementById('m-title').value = record.title || '';
    document.getElementById('m-type').value = record.type || 'scheduled';
    document.getElementById('m-priority').value = record.priority || 'medium';
    document.getElementById('m-status').value = record.status || 'pending';
    document.getElementById('m-description').value = record.description || '';
    document.getElementById('m-vendor').value = record.vendor || '';
    document.getElementById('m-cost').value = record.cost || '';
    document.getElementById('m-notes').value = record.notes || '';
    document.getElementById('m-date').value = record.scheduledDate
        ? new Date(record.scheduledDate).toISOString().split('T')[0] : '';

    clearMsg('maint-modal-error');
    clearMsg('maint-modal-success');

    await populateAssetDropdown('m-asset', record.assetId?._id || record.assetId || '');
    document.getElementById('maintenance-modal').classList.add('open');
}

function closeMaintenanceModal() {
    document.getElementById('maintenance-modal').classList.remove('open');
    editingMaintId = null;
}

async function saveMaintenance() {
    const assetEl = document.getElementById('m-asset');
    const body = {
        assetId: assetEl.value,
        title: document.getElementById('m-title').value.trim(),
        type: document.getElementById('m-type').value,
        priority: document.getElementById('m-priority').value,
        status: document.getElementById('m-status').value,
        description: document.getElementById('m-description').value.trim(),
        scheduledDate: document.getElementById('m-date').value,
        vendor: document.getElementById('m-vendor').value.trim(),
        cost: parseFloat(document.getElementById('m-cost').value) || 0,
        notes: document.getElementById('m-notes').value.trim()
    };

    clearMsg('maint-modal-error');
    clearMsg('maint-modal-success');

    if (!body.assetId) { showMsg('maint-modal-error', 'Please select an asset.'); return; }
    if (!body.title) { showMsg('maint-modal-error', 'Title is required.'); return; }
    if (!body.scheduledDate) { showMsg('maint-modal-error', 'Scheduled date is required.'); return; }

    const btn = document.getElementById('save-maint-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const url = editingMaintId
            ? `${BASE_URL}/api/maintenance/${editingMaintId}`
            : `${BASE_URL}/api/maintenance`;
        const method = editingMaintId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(body) });
        const data = await res.json();

        if (res.ok) {
            showMsg('maint-modal-success',
                editingMaintId ? '✅ Maintenance updated!' : '✅ Maintenance scheduled!', 'success');
            loadMaintenance();
            loadMaintenanceStats();
            loadAlertBadge();
            setTimeout(() => closeMaintenanceModal(), 1500);
        } else {
            showMsg('maint-modal-error', data.message);
        }
    } catch (err) {
        showMsg('maint-modal-error', 'Could not connect to server.');
    } finally {
        btn.textContent = editingMaintId ? 'Save Changes' : 'Schedule';
        btn.disabled = false;
    }
}

async function markComplete(maintId) {
    if (!confirm('Mark this maintenance as completed?')) return;
    try {
        const completedDate = new Date().toISOString();
        await fetch(`${BASE_URL}/api/maintenance/${maintId}`, {
            method: 'PUT', headers: authHdrs(),
            body: JSON.stringify({ status: 'completed', completedDate })
        });
        loadMaintenance();
        loadMaintenanceStats();
        loadAlerts();
        loadAlertBadge();
    } catch (err) { console.log('Complete error:', err); }
}

async function deleteMaintenance(maintId) {
    if (!confirm('Delete this maintenance record?')) return;
    try {
        await fetch(`${BASE_URL}/api/maintenance/${maintId}`, { method: 'DELETE', headers: authHdrs() });
        loadMaintenance();
        loadMaintenanceStats();
    } catch (err) { console.log('Delete maint error:', err); }
}

async function populateAssetDropdown(selectId, selectedId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    if (!allAssets.length) {
        try {
            const res = await fetch(`${BASE_URL}/api/assets`, { headers: authHdrs() });
            allAssets = await res.json();
        } catch (e) { }
    }
    select.innerHTML = '<option value="">Select asset...</option>' +
        allAssets.map(a =>
            `<option value="${a._id}" ${a._id === selectedId ? 'selected' : ''}>
                [${a.assetId}] ${a.name} — ${a.status}
             </option>`
        ).join('');
}

async function loadAlertBadge() {
    try {
        const res = await fetch(`${BASE_URL}/api/maintenance/alerts`, { headers: authHdrs() });
        const data = await res.json();
        const total = (data.overdue?.length || 0) + (data.warranties?.length || 0);
        const badge = document.getElementById('alert-badge');
        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline-block' : 'none';
        }
        const mb = document.getElementById('maint-badge');
        if (mb) {
            mb.textContent = data.overdue?.length || 0;
            mb.style.display = (data.overdue?.length || 0) > 0 ? 'inline-block' : 'none';
        }
    } catch (err) { }
}

async function loadAlerts() {
    try {
        const res = await fetch(`${BASE_URL}/api/maintenance/alerts`, { headers: authHdrs() });
        const data = await res.json();
        renderOverdue(data.overdue || []);
        renderDueSoon(data.dueSoon || []);
        renderWarranties(data.warranties || []);
    } catch (err) { console.log('Alerts error:', err); }
}

function renderOverdue(records) {
    const el = document.getElementById('overdue-list');
    if (!records.length) {
        el.innerHTML = '<div style="text-align:center; padding:30px;"><div style="font-size:2rem;">✅</div><p style="color:#94a3b8; font-size:14px; margin-top:8px;">No overdue maintenance!</p></div>';
        return;
    }
    el.innerHTML = records.map(r => `
        <div class="alert-item overdue">
            <div class="alert-icon">🚨</div>
            <div style="flex:1;">
                <div class="alert-title">${r.title}</div>
                <div class="alert-sub">${r.assetId?.name || r.assetName} · ${r.type}</div>
                <div class="alert-date">Overdue since: ${formatDate(r.scheduledDate)}</div>
            </div>
            ${currentUser?.role !== 'employee' ? `
            <button class="btn btn-success btn-sm" onclick="markComplete('${r._id}')">✅ Done</button>
            ` : ''}
        </div>
    `).join('');
}

function renderDueSoon(records) {
    const el = document.getElementById('duesoon-list');
    if (!records.length) {
        el.innerHTML = '<div style="text-align:center; padding:30px;"><div style="font-size:2rem;">👍</div><p style="color:#94a3b8; font-size:14px; margin-top:8px;">Nothing due in next 7 days.</p></div>';
        return;
    }
    el.innerHTML = records.map(r => `
        <div class="alert-item soon">
            <div class="alert-icon">⏰</div>
            <div style="flex:1;">
                <div class="alert-title">${r.title}</div>
                <div class="alert-sub">${r.assetId?.name || r.assetName} · <span class="badge ${maintPriorityColors[r.priority]}">${r.priority}</span></div>
                <div class="alert-warn">Due: ${formatDate(r.scheduledDate)}</div>
            </div>
        </div>
    `).join('');
}

function renderWarranties(assets) {
    const el = document.getElementById('warranty-list');
    if (!assets.length) {
        el.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px; font-size:14px;">No warranties expiring in the next 30 days.</p>';
        return;
    }
    el.innerHTML = `
        <div style="overflow-x:auto;">
        <table>
            <thead>
                <tr>
                    <th>Asset</th>
                    <th>Asset ID</th>
                    <th>Location</th>
                    <th>Warranty Expiry</th>
                    <th>Days Left</th>
                </tr>
            </thead>
            <tbody>
                ${assets.map(a => {
        const daysLeft = Math.ceil((new Date(a.warrantyExpiry) - new Date()) / (1000 * 60 * 60 * 24));
        return `
                    <tr>
                        <td style="font-weight:500;">${a.name}</td>
                        <td><span style="font-family:monospace; font-size:12px; color:#4f6ef7;">${a.assetId}</span></td>
                        <td style="color:#94a3b8; font-size:13px;">${a.location || '—'}</td>
                        <td style="color:#f59e0b;">${formatDate(a.warrantyExpiry)}</td>
                        <td>
                            <span class="badge ${daysLeft <= 7 ? 'badge-critical' : daysLeft <= 14 ? 'badge-high' : 'badge-medium'}">
                                ${daysLeft} days
                            </span>
                        </td>
                    </tr>`;
    }).join('')}
            </tbody>
        </table>
        </div>`;
}

async function loadReports() {
    try {
        const res = await fetch(`${BASE_URL}/api/reports/summary`, { headers: authHdrs() });
        const data = await res.json();

        document.getElementById('r-purchase').textContent = formatCurrency(data.totalPurchaseValue);
        document.getElementById('r-current').textContent = formatCurrency(data.totalCurrentValue);
        document.getElementById('r-depr').textContent = formatCurrency(data.totalDepreciation);
        document.getElementById('r-maint').textContent = formatCurrency(data.totalMaintenanceCost);

        renderBarChart('report-by-status', data.byStatus, statusColors);

        renderBarChart('report-by-condition', data.byCondition, conditionColors);

        renderCategoryReport(data.byCategory, data.totalCurrentValue);

    } catch (err) { console.log('Reports error:', err); }
}

function renderBarChart(elId, items, colorMap) {
    const el = document.getElementById(elId);
    if (!el || !items.length) { if (el) el.innerHTML = '<p style="color:#94a3b8; font-size:14px;">No data.</p>'; return; }
    const max = Math.max(...items.map(i => i.count));
    el.innerHTML = items.map(i => {
        const pct = max > 0 ? Math.round((i.count / max) * 100) : 0;
        const key = i._id || '';
        const colors = {
            'active': '#22c55e', 'in-repair': '#f59e0b',
            'disposed': '#94a3b8', 'lost': '#ef4444',
            'reserved': '#4f6ef7', 'excellent': '#22c55e',
            'good': '#4f6ef7', 'fair': '#f59e0b', 'poor': '#ef4444'
        };
        const color = colors[key] || '#4f6ef7';
        return `
        <div class="report-bar-row">
            <div class="report-bar-label">${key || 'Unknown'}</div>
            <div class="report-bar-track">
                <div class="report-bar-fill" style="width:${pct}%; background:${color};"></div>
            </div>
            <div class="report-bar-count">${i.count}</div>
        </div>`;
    }).join('');
}

function renderCategoryReport(categories, totalValue) {
    const tbody = document.getElementById('report-by-category');
    if (!categories.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8; padding:20px;">No data.</td></tr>';
        return;
    }
    tbody.innerHTML = categories.map(c => {
        const pct = totalValue > 0 ? Math.round((c.value / totalValue) * 100) : 0;
        return `
        <tr>
            <td style="font-weight:500;">${c._id || 'Uncategorised'}</td>
            <td><span class="badge badge-active">${c.count}</span></td>
            <td style="color:#22c55e; font-weight:500;">${formatCurrency(c.value)}</td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="flex:1; background:var(--bg-secondary); border-radius:20px; height:8px; overflow:hidden;">
                        <div style="background:#4f6ef7; width:${pct}%; height:100%; border-radius:20px;"></div>
                    </div>
                    <span style="font-size:12px; color:#94a3b8; width:35px;">${pct}%</span>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function exportReport() {
    exportAssetsCSV();
}

setInterval(() => {
    if (getToken()) loadAlertBadge();
}, 300000);

let allInventoryItems = [];
let currentTxItemId = null;

async function loadInventory() {
    await loadInventoryStats();
    await loadInventoryItems();
    await loadLowStockAlerts();
}

async function loadInventoryStats() {
    try {
        const res = await fetch(`${BASE_URL}/api/inventory/stats`, { headers: authHdrs() });
        const data = await res.json();
        document.getElementById('inv-total').textContent = data.total || 0;
        document.getElementById('inv-low').textContent = data.lowStock || 0;
        document.getElementById('inv-out').textContent = data.outOfStock || 0;
        document.getElementById('inv-value').textContent = '₹' + (data.totalValue || 0).toLocaleString('en-IN');

        const badge = document.getElementById('low-stock-badge');
        if (data.lowStock > 0) { badge.textContent = data.lowStock; badge.style.display = 'inline-block'; }
        else { badge.style.display = 'none'; }
    } catch (e) { console.log('Inventory stats error', e); }
}

async function loadInventoryItems() {
    try {
        const res = await fetch(`${BASE_URL}/api/inventory`, { headers: authHdrs() });
        allInventoryItems = await res.json();
        renderInventory(allInventoryItems);
    } catch (e) { console.log('Inventory load error', e); }
}

function renderInventory(items) {
    const tbody = document.getElementById('inventory-table-body');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#94a3b8; padding:40px;">No inventory items found. 
        Click "+ Add Item" to get started.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const isLow = item.quantity <= item.reorderLevel && item.quantity > 0;
        const isOut = item.quantity === 0;
        const stockBadge = isOut ? `<span class="badge badge-red">Out of Stock</span>` : isLow ? `<span class="badge badge-yellow">Low Stock</span>`
            : `<span class="badge badge-green">In Stock</span>`;
        const totalValue = (item.quantity * item.purchasePrice).toLocaleString('en-IN');
        return `<tr>
            <td style="font-family:monospace; color:#4f6ef7; font-size:12px;">${item.itemCode}</td>
            <td>
                <div style="font-weight:500; color:#e2e8f0;">${item.name}</div>
                ${item.supplier ? `<div style="font-size:11px; color:#64748b;">${item.supplier}</div>` : ''}
            </td>
            <td style="color:#94a3b8;">${item.category || '—'}</td>
            <td style="font-weight:700; font-size:1.1rem; color:${isOut ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e'};">
                ${item.quantity}
            </td>
            <td style="color:#94a3b8;">${item.unit}</td>
            <td style="color:#94a3b8;">${item.reorderLevel}</td>
            <td style="color:#94a3b8;">₹${item.purchasePrice.toLocaleString('en-IN')}</td>
            <td style="color:#94a3b8;">₹${totalValue}</td>
            <td style="color:#94a3b8;">${item.location || '—'}</td>
            <td>${stockBadge}</td>
            <td>
                <div style="display:flex; gap:4px;">
                    <button class="btn btn-outline btn-sm" title="Stock In" onclick="openStockTx('${item._id}','${item.name.replace(/'/g, "\\'")}','stock-in')">📥</button>
                    <button class="btn btn-outline btn-sm" title="Stock Out" onclick="openStockTx('${item._id}','${item.name.replace(/'/g, "\\'")}','stock-out')">📤</button>
                    <button class="btn btn-outline btn-sm" title="History" onclick="openItemHistory('${item._id}','${item.name.replace(/'/g, "\\'")}')">📋</button>
                    <button class="btn btn-outline btn-sm" title="Edit" onclick="openEditInventoryModal('${item._id}')">✏️</button>
                    <button class="btn btn-sm" style="background:#ef4444; color:white;" title="Delete" onclick="deleteInventoryItem('${item._id}','${item.name.replace(/'/g, "\\'")}')">🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterInventory() {
    const search = document.getElementById('inv-search').value.toLowerCase();
    const stock = document.getElementById('inv-stock-filter').value;

    const filtered = allInventoryItems.filter(item => {
        const matchSearch = !search ||
            item.name.toLowerCase().includes(search) ||
            item.itemCode.toLowerCase().includes(search) ||
            (item.category || '').toLowerCase().includes(search) ||
            (item.location || '').toLowerCase().includes(search);

        const matchStock = !stock ||
            (stock === 'out' && item.quantity === 0) ||
            (stock === 'low' && item.quantity <= item.reorderLevel && item.quantity > 0) ||
            (stock === 'ok' && item.quantity > item.reorderLevel);

        return matchSearch && matchStock;
    });
    renderInventory(filtered);
}

async function loadLowStockAlerts() {
    try {
        const res = await fetch(`${BASE_URL}/api/inventory/alerts/low-stock`, { headers: authHdrs() });
        const items = await res.json();
        const card = document.getElementById('low-stock-alert-card');
        const list = document.getElementById('low-stock-list');

        if (!items.length) { card.style.display = 'none'; return; }

        card.style.display = 'block';
        list.innerHTML = items.map(i =>
            `<span style="background:#1e293b; border:1px solid #ef4444; border-radius:6px; padding:6px 12px; font-size:12px; color:#e2e8f0;">
                ⚠️ <strong>${i.name}</strong> — ${i.quantity} ${i.unit} left (reorder at ${i.reorderLevel})
            </span>`
        ).join('');
    } catch (e) { }
}

let editingInventoryId = null;

function openInventoryModal() {
    editingInventoryId = null;
    document.getElementById('inv-modal-title').textContent = 'Add Inventory Item';
    document.getElementById('save-inv-btn').textContent = 'Add Item';
    ['inv-name', 'inv-category', 'inv-description', 'inv-location', 'inv-supplier'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('inv-quantity').value = '';
    document.getElementById('inv-reorder').value = '5';
    document.getElementById('inv-purchase-price').value = '';
    document.getElementById('inv-selling-price').value = '';
    document.getElementById('inv-unit').value = 'pcs';
    document.getElementById('inv-modal-error').style.display = 'none';
    document.getElementById('inv-modal-success').style.display = 'none';
    document.getElementById('inventory-modal').style.display = 'flex';
}

async function openEditInventoryModal(itemId) {
    try {
        const res = await fetch(`${BASE_URL}/api/inventory/${itemId}`, { headers: authHdrs() });
        const item = await res.json();
        editingInventoryId = itemId;

        document.getElementById('inv-modal-title').textContent = 'Edit Inventory Item';
        document.getElementById('save-inv-btn').textContent = 'Save Changes';
        document.getElementById('inv-name').value = item.name || '';
        document.getElementById('inv-category').value = item.category || '';
        document.getElementById('inv-description').value = item.description || '';
        document.getElementById('inv-unit').value = item.unit || 'pcs';
        document.getElementById('inv-quantity').value = item.quantity || 0;
        document.getElementById('inv-reorder').value = item.reorderLevel || 5;
        document.getElementById('inv-purchase-price').value = item.purchasePrice || 0;
        document.getElementById('inv-selling-price').value = item.sellingPrice || 0;
        document.getElementById('inv-location').value = item.location || '';
        document.getElementById('inv-supplier').value = item.supplier || '';
        document.getElementById('inv-modal-error').style.display = 'none';
        document.getElementById('inv-modal-success').style.display = 'none';
        document.getElementById('inventory-modal').style.display = 'flex';
    } catch (e) { alert('Could not load item.'); }
}

function closeInventoryModal() {
    document.getElementById('inventory-modal').style.display = 'none';
    editingInventoryId = null;
}

async function saveInventoryItem() {
    const name = document.getElementById('inv-name').value.trim();
    const errEl = document.getElementById('inv-modal-error');
    const sucEl = document.getElementById('inv-modal-success');

    if (!name) { errEl.textContent = 'Item name is required.'; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    const body = {
        name,
        description: document.getElementById('inv-description').value.trim(),
        category: document.getElementById('inv-category').value.trim(),
        unit: document.getElementById('inv-unit').value,
        quantity: document.getElementById('inv-quantity').value,
        reorderLevel: document.getElementById('inv-reorder').value,
        purchasePrice: document.getElementById('inv-purchase-price').value,
        sellingPrice: document.getElementById('inv-selling-price').value,
        location: document.getElementById('inv-location').value.trim(),
        supplier: document.getElementById('inv-supplier').value.trim()
    };

    const btn = document.getElementById('save-inv-btn');
    btn.textContent = 'Saving...'; btn.disabled = true;

    try {
        const url = editingInventoryId
            ? `${BASE_URL}/api/inventory/${editingInventoryId}`
            : `${BASE_URL}/api/inventory`;
        const method = editingInventoryId ? 'PUT' : 'POST';

        const res = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(body) });
        const data = await res.json();

        if (res.ok) {
            sucEl.textContent = data.message; sucEl.style.display = 'block';
            setTimeout(() => { closeInventoryModal(); loadInventory(); }, 1000);
        } else {
            errEl.textContent = data.message; errEl.style.display = 'block';
        }
    } catch (e) {
        errEl.textContent = 'Could not connect to server.'; errEl.style.display = 'block';
    }
    btn.textContent = editingInventoryId ? 'Save Changes' : 'Add Item';
    btn.disabled = false;
}

async function deleteInventoryItem(itemId, itemName) {
    if (!confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${BASE_URL}/api/inventory/${itemId}`, { method: 'DELETE', headers: authHdrs() });
        const data = await res.json();
        if (res.ok) { loadInventory(); }
        else { alert(data.message); }
    } catch (e) { alert('Could not connect to server.'); }
}

function openStockTx(itemId, itemName, type = 'stock-in') {
    currentTxItemId = itemId;
    document.getElementById('tx-item-name').textContent = `Item: ${itemName}`;
    document.getElementById('tx-type').value = type;
    document.getElementById('tx-quantity').value = '';
    document.getElementById('tx-reason').value = '';
    document.getElementById('tx-reference').value = '';
    document.getElementById('tx-msg').style.display = 'none';
    document.getElementById('stock-tx-modal').style.display = 'flex';
    updateTxLabel();
}

function updateTxLabel() {
    const type = document.getElementById('tx-type').value;
    const labels = {
        'stock-in': 'Quantity to Receive *',
        'stock-out': 'Quantity to Issue *',
        'adjustment': 'New Absolute Quantity *'
    };
    document.getElementById('tx-qty-label').textContent = labels[type] || 'Quantity *';
    const titles = {
        'stock-in': '📥 Stock In — Receive Goods',
        'stock-out': '📤 Stock Out — Issue Goods',
        'adjustment': '🔧 Stock Adjustment'
    };
    document.getElementById('tx-modal-title').textContent = titles[type] || 'Transaction';
}

function closeStockTxModal() {
    document.getElementById('stock-tx-modal').style.display = 'none';
    currentTxItemId = null;
}

async function confirmStockTx() {
    const type = document.getElementById('tx-type').value;
    const quantity = document.getElementById('tx-quantity').value;
    const reason = document.getElementById('tx-reason').value.trim();
    const reference = document.getElementById('tx-reference').value.trim();
    const msgEl = document.getElementById('tx-msg');

    if (!quantity || parseFloat(quantity) <= 0) {
        msgEl.textContent = 'Please enter a valid quantity.';
        msgEl.style.display = 'block';
        return;
    }
    msgEl.style.display = 'none';

    const btn = document.getElementById('confirm-tx-btn');
    btn.textContent = '⏳ Processing...'; btn.disabled = true;

    try {
        const res = await fetch(`${BASE_URL}/api/inventory/${currentTxItemId}/transaction`, {
            method: 'POST', headers: authHdrs(),
            body: JSON.stringify({ type, quantity, reason, reference })
        });
        const data = await res.json();

        if (res.ok) {
            closeStockTxModal();
            loadInventory();
        } else {
            msgEl.textContent = data.message;
            msgEl.style.display = 'block';
        }
    } catch (e) {
        msgEl.textContent = 'Could not connect to server.';
        msgEl.style.display = 'block';
    }
    btn.textContent = '✅ Confirm'; btn.disabled = false;
}

async function openItemHistory(itemId, itemName) {
    document.getElementById('inv-history-title').textContent = `📋 ${itemName} — Transaction History`;
    document.getElementById('inv-history-list').innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px;">Loading...</p>';
    document.getElementById('inv-history-modal').style.display = 'flex';

    try {
        const res = await fetch(`${BASE_URL}/api/inventory/${itemId}/transactions`, { headers: authHdrs() });
        const txs = await res.json();
        const list = document.getElementById('inv-history-list');

        if (!txs.length) {
            list.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px;">No transactions yet.</p>';
            return;
        }
        list.innerHTML = txs.map(tx => {
            const typeColor = tx.type === 'stock-in' ? '#22c55e' : tx.type === 'stock-out' ? '#ef4444' : '#f59e0b';
            const typeIcon = tx.type === 'stock-in' ? '📥' : tx.type === 'stock-out' ? '📤' : '🔧';
            const typeLabel = tx.type === 'stock-in' ? 'Stock In' : tx.type === 'stock-out' ? 'Stock Out' : 'Adjustment';
            return `<div style="border-bottom:1px solid #1e293b; padding:12px 0; display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <span style="color:${typeColor}; font-weight:600; font-size:13px;">${typeIcon} ${typeLabel}</span>
                    ${tx.reason ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">${tx.reason}</div>` : ''}
                    ${tx.reference ? `<div style="font-size:11px; color:#4f6ef7; margin-top:2px;">Ref: ${tx.reference}</div>` : ''}
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">By ${tx.performedByName} · ${new Date(tx.createdAt).toLocaleString()}</div>
                </div>
                <div style="text-align:right; flex-shrink:0; margin-left:16px;">
                    <div style="font-size:1.1rem; font-weight:700; color:${typeColor};">
                        ${tx.type === 'stock-in' ? '+' : tx.type === 'stock-out' ? '-' : '='}${tx.quantity}
                    </div>
                    <div style="font-size:11px; color:#64748b;">${tx.balanceBefore} → ${tx.balanceAfter}</div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        document.getElementById('inv-history-list').innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Failed to load history.</p>';
    }
}

async function loadInventoryTransactions() {
    document.getElementById('inv-history-title').textContent = '📋 All Inventory Transactions';
    document.getElementById('inv-history-list').innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px;">Loading...</p>';
    document.getElementById('inv-history-modal').style.display = 'flex';

    try {
        const res = await fetch(`${BASE_URL}/api/inventory/transactions/all`, { headers: authHdrs() });
        const txs = await res.json();
        const list = document.getElementById('inv-history-list');

        if (!txs.length) {
            list.innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px;">No transactions yet.</p>';
            return;
        }
        list.innerHTML = txs.map(tx => {
            const typeColor = tx.type === 'stock-in' ? '#22c55e' : tx.type === 'stock-out' ? '#ef4444' : '#f59e0b';
            const typeIcon = tx.type === 'stock-in' ? '📥' : tx.type === 'stock-out' ? '📤' : '🔧';
            const typeLabel = tx.type === 'stock-in' ? 'Stock In' : tx.type === 'stock-out' ? 'Stock Out' : 'Adjustment';
            return `
            <div style="border-bottom:1px solid #1e293b; padding:12px 0; display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <div style="font-weight:500; color:#e2e8f0; font-size:13px;">${tx.itemName} <span style="font-family:monospace; color:#4f6ef7; font-size:11px;">${tx.itemCode}</span></div>
                    <span style="color:${typeColor}; font-weight:600; font-size:12px;">${typeIcon} ${typeLabel}</span>
                    ${tx.reason ? `<span style="font-size:12px; color:#64748b;"> · ${tx.reason}</span>` : ''}
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">By ${tx.performedByName} · ${new Date(tx.createdAt).toLocaleString()}</div>
                </div>
                <div style="text-align:right; flex-shrink:0; margin-left:16px;">
                    <div style="font-size:1.1rem; font-weight:700; color:${typeColor};">
                        ${tx.type === 'stock-in' ? '+' : tx.type === 'stock-out' ? '-' : '='}${tx.quantity}
                    </div>
                    <div style="font-size:11px; color:#64748b;">${tx.balanceBefore} → ${tx.balanceAfter}</div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        document.getElementById('inv-history-list').innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Failed to load transactions.</p>';
    }
}

let allDepreciation = [];
let allInsurance = [];
let editingInsId = null;

const _p3ShowPage = showPage;
showPage = function (page) {
    _p3ShowPage(page);
    if (page === 'depreciation') { loadDepreciation(); loadDepreciationSummary(); }
    if (page === 'insurance') { loadInsurance(); loadInsuranceSummary(); }
    if (page === 'finance') { loadFinanceDashboard(); }
};

const _p3ShowApp = showApp;
showApp = function () {
    _p3ShowApp();
    populateYearDropdowns();
    loadInsuranceBadge();
    if (currentUser?.role === 'employee') {
        const addIns = document.getElementById('add-ins-btn');
        if (addIns) addIns.style.display = 'none';
    }
};

function populateYearDropdowns() {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);
    ['bulk-year', 'sd-year'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = years.map(y =>
            `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
        ).join('');
    });
    const filterEl = document.getElementById('depr-year-filter');
    if (filterEl) {
        filterEl.innerHTML = '<option value="">All Years</option>' +
            years.reverse().map(y => `<option value="${y}">${y}</option>`).join('');
    }
}

async function loadDepreciationSummary() {
    try {
        const res = await fetch(`${BASE_URL}/api/depreciation/summary`, { headers: authHdrs() });
        const data = await res.json();

        document.getElementById('d-total').textContent = formatCurrency(data.totalDepreciation);
        document.getElementById('d-records').textContent = data.totalRecords || 0;

        const retained = data.totalPurchaseValue > 0
            ? Math.round((data.totalCurrentValue / data.totalPurchaseValue) * 100) : 0;
        document.getElementById('d-retention').textContent = retained + '%';

    } catch (err) { console.log('Depr summary error:', err); }
}

async function loadDepreciation() {
    try {
        const year = document.getElementById('depr-year-filter')?.value || '';
        const url = year ? `${BASE_URL}/api/depreciation?year=${year}` : `${BASE_URL}/api/depreciation`;
        const res = await fetch(url, { headers: authHdrs() });
        allDepreciation = await res.json();
        renderDepreciation(allDepreciation);
    } catch (err) { console.log('Depreciation error:', err); }
}

function renderDepreciation(records) {
    const tbody = document.getElementById('depreciation-table-body');
    if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:40px;">
            No depreciation records. Use Bulk Calculate or add individual records.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = records.map(r => `
        <tr>
            <td>
                <div style="font-weight:500; font-size:13px;">${r.assetName || r.assetId?.name || '—'}</div>
                <div style="font-size:11px; color:#4f6ef7; font-family:monospace;">${r.assetCode || r.assetId?.assetId || ''}</div>
            </td>
            <td><span class="badge badge-active" style="font-size:12px;">${r.year}</span></td>
            <td>
                <span class="badge ${r.method === 'straight-line' ? 'badge-straight-line' : 'badge-reducing-balance'}"
                    style="font-size:11px; white-space:nowrap;">
                    ${r.method === 'straight-line' ? 'Straight Line' : 'Reducing Balance'}
                </span>
            </td>
            <td style="color:#94a3b8;">${r.depreciationRate}%</td>
            <td style="color:#4f6ef7; font-weight:500;">${formatCurrency(r.openingValue)}</td>
            <td style="color:#ef4444; font-weight:500;">- ${formatCurrency(r.depreciationAmount)}</td>
            <td style="color:#22c55e; font-weight:600;">${formatCurrency(r.closingValue)}</td>
            <td style="font-size:12px; color:#94a3b8;">${r.calculatedByName || '—'}</td>
            <td>
                ${currentUser?.role === 'admin' ? `
                <button class="btn btn-danger btn-sm" onclick="deleteDepreciation('${r._id}')">🗑️</button>
                ` : '—'}
            </td>
        </tr>
    `).join('');
}

function filterDepreciation() {
    loadDepreciation();
}

async function bulkCalculate() {
    const year = document.getElementById('bulk-year').value;
    const method = document.getElementById('bulk-method').value;
    const rate = document.getElementById('bulk-rate').value;
    const msgEl = document.getElementById('bulk-msg');

    if (!rate || rate <= 0 || rate > 100) {
        msgEl.innerHTML = '<div class="error-msg">Please enter a valid rate between 0 and 100.</div>';
        return;
    }

    if (!confirm(`Calculate ${method} depreciation at ${rate}% for all active assets for year ${year}?`)) return;

    const btn = document.getElementById('bulk-calc-btn');
    btn.textContent = '⏳ Calculating...';
    btn.disabled = true;
    msgEl.innerHTML = '';

    try {
        const res = await fetch(`${BASE_URL}/api/depreciation/bulk`, {
            method: 'POST', headers: authHdrs(),
            body: JSON.stringify({ method, rate: parseFloat(rate), year: parseInt(year) })
        });
        const data = await res.json();

        if (res.ok) {
            msgEl.innerHTML = `<div class="success-msg">✅ ${data.message}</div>`;
            loadDepreciation();
            loadDepreciationSummary();
        } else {
            msgEl.innerHTML = `<div class="error-msg">${data.message}</div>`;
        }
    } catch (err) {
        msgEl.innerHTML = '<div class="error-msg">Could not connect to server.</div>';
    } finally {
        btn.textContent = '⚡ Calculate All';
        btn.disabled = false;
    }
}

async function openSingleDepreciationModal() {
    clearMsg('sd-msg-error');
    clearMsg('sd-msg-success');
    document.getElementById('sd-method').value = 'straight-line';
    document.getElementById('sd-rate').value = '';
    document.getElementById('depr-preview').style.display = 'none';
    await populateAssetDropdown('sd-asset', '');
    populateYearDropdowns();
    document.getElementById('single-depr-modal').classList.add('open');
}

function closeSingleDepreciationModal() {
    document.getElementById('single-depr-modal').classList.remove('open');
}

function previewDepreciation() {
    const assetEl = document.getElementById('sd-asset');
    const rate = parseFloat(document.getElementById('sd-rate').value);
    const method = document.getElementById('sd-method').value;

    if (!assetEl.value || !rate) return;

    const asset = allAssets.find(a => a._id === assetEl.value);
    if (!asset) return;

    const openingValue = asset.currentValue || asset.purchasePrice || 0;
    const deprAmount = method === 'straight-line'
        ? Math.round(openingValue * rate / 100 * 100) / 100
        : Math.round(openingValue * rate / 100 * 100) / 100;
    const closingValue = Math.max(0, openingValue - deprAmount);

    document.getElementById('prev-opening').textContent = formatCurrency(openingValue);
    document.getElementById('prev-depr').textContent = formatCurrency(deprAmount);
    document.getElementById('prev-closing').textContent = formatCurrency(closingValue);
    document.getElementById('depr-preview').style.display = 'block';
}

async function saveSingleDepreciation() {
    const assetId = document.getElementById('sd-asset').value;
    const year = document.getElementById('sd-year').value;
    const method = document.getElementById('sd-method').value;
    const rate = parseFloat(document.getElementById('sd-rate').value);

    clearMsg('sd-msg-error');
    clearMsg('sd-msg-success');

    if (!assetId) { showMsg('sd-msg-error', 'Please select an asset.'); return; }
    if (!rate || rate <= 0) { showMsg('sd-msg-error', 'Please enter a valid rate.'); return; }

    const btn = document.getElementById('save-depr-btn');
    btn.textContent = 'Calculating...';
    btn.disabled = true;

    try {
        const res = await fetch(`${BASE_URL}/api/depreciation/calculate`, {
            method: 'POST', headers: authHdrs(),
            body: JSON.stringify({ assetId, year: parseInt(year), method, rate })
        });
        const data = await res.json();

        if (res.ok) {
            showMsg('sd-msg-success',
                `✅ Depreciation calculated! ${formatCurrency(data.depreciationAmount)} depreciated.`, 'success');
            loadDepreciation();
            loadDepreciationSummary();
            setTimeout(() => closeSingleDepreciationModal(), 1800);
        } else {
            showMsg('sd-msg-error', data.message);
        }
    } catch (err) {
        showMsg('sd-msg-error', 'Could not connect to server.');
    } finally {
        btn.textContent = 'Calculate & Save';
        btn.disabled = false;
    }
}

async function deleteDepreciation(id) {
    if (!confirm('Delete this depreciation record? The asset value will NOT be restored.')) return;
    try {
        await fetch(`${BASE_URL}/api/depreciation/${id}`, { method: 'DELETE', headers: authHdrs() });
        loadDepreciation();
        loadDepreciationSummary();
    } catch (err) { console.log('Delete depr error:', err); }
}

async function loadInsuranceSummary() {
    try {
        const res = await fetch(`${BASE_URL}/api/finance/stats`, { headers: authHdrs() });
        const data = await res.json();
        const activeEl = document.getElementById('ins-active');
        const expiredEl = document.getElementById('ins-expired');
        const premEl = document.getElementById('ins-premium');
        const covEl = document.getElementById('ins-coverage');
        if (activeEl) activeEl.textContent = allInsurance.filter(i => i.status === 'active').length;
        if (expiredEl) expiredEl.textContent = allInsurance.filter(i => i.status === 'expired').length;
        if (premEl) premEl.textContent = formatCurrency(data.insurancePremium);
        if (covEl) covEl.textContent = formatCurrency(data.insuranceCoverage);
    } catch (err) { }
}

async function loadInsuranceBadge() {
    try {
        const res = await fetch(`${BASE_URL}/api/insurance/expiring`, { headers: authHdrs() });
        const data = await res.json();
        const badge = document.getElementById('ins-badge');
        if (badge) {
            badge.textContent = data.length;
            badge.style.display = data.length > 0 ? 'inline-block' : 'none';
        }
    } catch (err) { }
}

async function loadInsurance() {
    try {
        const status = document.getElementById('ins-status-filter')?.value || '';
        const url = status ? `${BASE_URL}/api/insurance?status=${status}` : `${BASE_URL}/api/insurance`;
        const res = await fetch(url, { headers: authHdrs() });
        allInsurance = await res.json();
        renderInsurance(allInsurance);
        loadInsuranceSummary();
    } catch (err) { console.log('Insurance error:', err); }
}

function renderInsurance(records) {
    const tbody = document.getElementById('insurance-table-body');
    if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:40px;">
            No insurance policies. ${currentUser?.role !== 'employee' ? 'Click "+ Add Policy" to add one.' : ''}
        </td></tr>`;
        return;
    }
    const today = new Date();
    tbody.innerHTML = records.map(r => {
        const daysLeft = Math.ceil((new Date(r.expiryDate) - today) / (1000 * 60 * 60 * 24));
        const isExpiring = r.status === 'active' && daysLeft <= 30 && daysLeft > 0;
        return `
        <tr>
            <td>
                <div style="font-weight:500; font-size:13px;">${r.assetName || r.assetId?.name || '—'}</div>
                <div style="font-size:11px; color:#4f6ef7; font-family:monospace;">${r.assetCode || ''}</div>
            </td>
            <td style="font-family:monospace; font-size:13px; color:#94a3b8;">${r.policyNumber}</td>
            <td style="font-size:13px;">${r.provider}</td>
            <td><span class="badge badge-scheduled" style="font-size:11px;">${r.type}</span></td>
            <td style="color:#818cf8; font-weight:500;">${formatCurrency(r.coverageAmount)}</td>
            <td style="color:#f59e0b; font-weight:500;">${formatCurrency(r.premium)}/yr</td>
            <td>
                <div style="font-size:13px; color:${r.status === 'expired' ? '#ef4444' : isExpiring ? '#f59e0b' : '#94a3b8'};">
                    ${formatDate(r.expiryDate)}
                </div>
                ${isExpiring ? `<div style="font-size:10px; color:#f59e0b;">⚠️ ${daysLeft} days left</div>` : ''}
            </td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td>
                <div style="display:flex; gap:4px;">
                    ${currentUser?.role !== 'employee' ? `
                    <button class="btn btn-outline btn-sm" onclick="openEditInsuranceModal('${r._id}')" title="Edit">✏️</button>
                    ` : ''}
                    ${currentUser?.role === 'admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="deleteInsurance('${r._id}')" title="Delete">🗑️</button>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function filterInsurance() { loadInsurance(); }

async function openInsuranceModal() {
    editingInsId = null;
    document.getElementById('ins-modal-title').textContent = 'Add Insurance Policy';
    document.getElementById('save-ins-btn').textContent = 'Add Policy';

    ['ins-policy', 'ins-provider', 'ins-notes'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('ins-type').value = 'comprehensive';
    document.getElementById('ins-status-field').value = 'active';
    document.getElementById('ins-coverage-amt').value = '';
    document.getElementById('ins-premium-amt').value = '';
    document.getElementById('ins-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('ins-expiry').value = '';

    clearMsg('ins-modal-error');
    clearMsg('ins-modal-success');

    await populateAssetDropdown('ins-asset', '');
    document.getElementById('insurance-modal').classList.add('open');
}

async function openEditInsuranceModal(insId) {
    const ins = allInsurance.find(i => i._id === insId);
    if (!ins) return;
    editingInsId = insId;

    document.getElementById('ins-modal-title').textContent = 'Edit Insurance Policy';
    document.getElementById('save-ins-btn').textContent = 'Save Changes';

    document.getElementById('ins-policy').value = ins.policyNumber || '';
    document.getElementById('ins-provider').value = ins.provider || '';
    document.getElementById('ins-type').value = ins.type || 'comprehensive';
    document.getElementById('ins-status-field').value = ins.status || 'active';
    document.getElementById('ins-coverage-amt').value = ins.coverageAmount || '';
    document.getElementById('ins-premium-amt').value = ins.premium || '';
    document.getElementById('ins-notes').value = ins.notes || '';
    document.getElementById('ins-start').value = ins.startDate ? new Date(ins.startDate).toISOString().split('T')[0] : '';
    document.getElementById('ins-expiry').value = ins.expiryDate ? new Date(ins.expiryDate).toISOString().split('T')[0] : '';

    clearMsg('ins-modal-error');
    clearMsg('ins-modal-success');

    await populateAssetDropdown('ins-asset', ins.assetId?._id || ins.assetId || '');
    document.getElementById('insurance-modal').classList.add('open');
}

function closeInsuranceModal() {
    document.getElementById('insurance-modal').classList.remove('open');
    editingInsId = null;
}

async function saveInsurance() {
    const assetEl = document.getElementById('ins-asset');
    const body = {
        assetId: assetEl.value,
        policyNumber: document.getElementById('ins-policy').value.trim(),
        provider: document.getElementById('ins-provider').value.trim(),
        type: document.getElementById('ins-type').value,
        status: document.getElementById('ins-status-field').value,
        coverageAmount: parseFloat(document.getElementById('ins-coverage-amt').value) || 0,
        premium: parseFloat(document.getElementById('ins-premium-amt').value) || 0,
        startDate: document.getElementById('ins-start').value,
        expiryDate: document.getElementById('ins-expiry').value,
        notes: document.getElementById('ins-notes').value.trim()
    };

    clearMsg('ins-modal-error');
    clearMsg('ins-modal-success');

    if (!body.assetId) { showMsg('ins-modal-error', 'Please select an asset.'); return; }
    if (!body.policyNumber) { showMsg('ins-modal-error', 'Policy number is required.'); return; }
    if (!body.provider) { showMsg('ins-modal-error', 'Provider is required.'); return; }
    if (!body.startDate || !body.expiryDate) { showMsg('ins-modal-error', 'Dates are required.'); return; }

    const btn = document.getElementById('save-ins-btn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const url = editingInsId ? `${BASE_URL}/api/insurance/${editingInsId}` : `${BASE_URL}/api/insurance`;
        const method = editingInsId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(body) });
        const data = await res.json();

        if (res.ok) {
            showMsg('ins-modal-success',
                editingInsId ? '✅ Policy updated!' : '✅ Policy added!', 'success');
            loadInsurance();
            loadInsuranceBadge();
            setTimeout(() => closeInsuranceModal(), 1500);
        } else {
            showMsg('ins-modal-error', data.message);
        }
    } catch (err) {
        showMsg('ins-modal-error', 'Could not connect to server.');
    } finally {
        btn.textContent = editingInsId ? 'Save Changes' : 'Add Policy';
        btn.disabled = false;
    }
}

async function deleteInsurance(insId) {
    if (!confirm('Delete this insurance policy?')) return;
    try {
        await fetch(`${BASE_URL}/api/insurance/${insId}`, { method: 'DELETE', headers: authHdrs() });
        loadInsurance();
        loadInsuranceBadge();
    } catch (err) { console.log('Delete insurance error:', err); }
}

async function loadFinanceDashboard() {
    try {
        const res = await fetch(`${BASE_URL}/api/finance/stats`, { headers: authHdrs() });
        const data = await res.json();

        document.getElementById('fin-purchase').textContent = formatCurrency(data.purchaseValue);
        document.getElementById('fin-current').textContent = formatCurrency(data.currentValue);
        document.getElementById('fin-depr').textContent = formatCurrency(data.totalDepreciation);
        document.getElementById('fin-maint').textContent = formatCurrency(data.maintenanceCost);
        document.getElementById('fin-ins-prem').textContent = formatCurrency(data.insurancePremium);
        document.getElementById('fin-ins-cov').textContent = formatCurrency(data.insuranceCoverage);

        renderTCO(data);
        renderFinanceBreakdown(data);
    } catch (err) { console.log('Finance dashboard error:', err); }
}

function renderTCO(data) {
    const el = document.getElementById('finance-tco');
    if (!el) return;
    const total = (data.purchaseValue || 0) + (data.maintenanceCost || 0) + (data.insurancePremium || 0);
    const items = [
        { label: 'Purchase Cost', value: data.purchaseValue || 0, color: '#4f6ef7' },
        { label: 'Maintenance Cost', value: data.maintenanceCost || 0, color: '#f59e0b' },
        { label: 'Insurance Premium', value: data.insurancePremium || 0, color: '#22c55e' },
        { label: 'Total Cost of Ownership', value: total, color: '#ef4444' }
    ];
    el.innerHTML = items.map(i => {
        const pct = total > 0 ? Math.round((i.value / total) * 100) : 0;
        return `
        <div class="tco-item">
            <div class="tco-dot" style="background:${i.color};"></div>
            <div class="tco-label">${i.label}</div>
            <div class="tco-value" style="color:${i.color};">${formatCurrency(i.value)}</div>
            ${i.label !== 'Total Cost of Ownership' ? `<div class="tco-pct">${pct}%</div>` : ''}
        </div>`;
    }).join('');
}

function renderFinanceBreakdown(data) {
    const el = document.getElementById('finance-breakdown');
    if (!el) return;
    const purchase = data.purchaseValue || 0;
    const current = data.currentValue || 0;
    const depr = data.totalDepreciation || 0;
    const retained = purchase > 0 ? Math.round((current / purchase) * 100) : 0;
    const deprPct = purchase > 0 ? Math.round((depr / purchase) * 100) : 0;

    el.innerHTML = `
        <div style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:13px; color:#94a3b8;">Value Retained</span>
                <span style="font-size:13px; font-weight:600; color:#22c55e;">${retained}%</span>
            </div>
            <div style="background:var(--bg-secondary); border-radius:20px; height:12px; overflow:hidden;">
                <div style="background:#22c55e; width:${retained}%; height:100%; border-radius:20px;"></div>
            </div>
        </div>
        <div style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="font-size:13px; color:#94a3b8;">Depreciated</span>
                <span style="font-size:13px; font-weight:600; color:#ef4444;">${deprPct}%</span>
            </div>
            <div style="background:var(--bg-secondary); border-radius:20px; height:12px; overflow:hidden;">
                <div style="background:#ef4444; width:${deprPct}%; height:100%; border-radius:20px;"></div>
            </div>
        </div>
        <div class="finance-row">
            <span class="finance-row-label">Purchase Value</span>
            <span class="finance-row-value" style="color:#4f6ef7;">${formatCurrency(purchase)}</span>
        </div>
        <div class="finance-row">
            <span class="finance-row-label">Current Book Value</span>
            <span class="finance-row-value" style="color:#22c55e;">${formatCurrency(current)}</span>
        </div>
        <div class="finance-row">
            <span class="finance-row-label">Total Depreciation</span>
            <span class="finance-row-value" style="color:#ef4444;">${formatCurrency(depr)}</span>
        </div>
        <div class="finance-row">
            <span class="finance-row-label">Insurance Coverage</span>
            <span class="finance-row-value" style="color:#818cf8;">${formatCurrency(data.insuranceCoverage || 0)}</span>
        </div>
    `;
}

setInterval(() => {
    if (getToken()) loadInsuranceBadge();
}, 300000);

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}
const _mobileNavShowPage = showPage;
showPage = function (page) {
    _mobileNavShowPage(page);
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.remove('open');
    }
};
document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && !e.target.closest('#mobile-menu-btn')) {
            sidebar.classList.remove('open');
        }
    }
});