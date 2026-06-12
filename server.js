const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({ origin: '*' }));

const isTesting = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
if (!isTesting) {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (MONGO_URI) {
        mongoose.connect(MONGO_URI, { family: 4 })
            .then(() => console.log('MongoDB connected'))
            .catch(err => console.log('MongoDB error:', err.message));
    }
}

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'employee'], default: 'employee' },
    department: { type: String, default: '' },
    phone: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});
const User = mongoose.model('User', userSchema);

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['tangible', 'non-tangible'], required: true },
    mobility: { type: String, enum: ['moveable', 'non-moveable'], required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '📦' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
const Category = mongoose.model('Category', categorySchema);

const assetSchema = new mongoose.Schema({
    assetId: { type: String, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    categoryName: { type: String, default: '' },
    subCategory: { type: String, default: '' },
    status: { type: String, enum: ['active', 'in-repair', 'disposed', 'lost', 'reserved'], default: 'active' },
    condition: { type: String, enum: ['excellent', 'good', 'fair', 'poor'], default: 'good' },

    purchaseDate: { type: Date },
    purchasePrice: { type: Number, default: 0 },
    currentValue: { type: Number, default: 0 },

    vendorName: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    assetTag: { type: String, default: '' },
    warrantyExpiry: { type: Date },
    location: { type: String, default: '' },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedToName: { type: String, default: '' },
    assignedDate: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Asset = mongoose.model('Asset', assetSchema);

const assetHistorySchema = new mongoose.Schema({
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    assetName: { type: String },
    action: { type: String },
    fromUser: { type: String },
    toUser: { type: String },
    fromLocation: { type: String },
    toLocation: { type: String },
    notes: { type: String, default: '' },
    performedBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const AssetHistory = mongoose.model('AssetHistory', assetHistorySchema);

async function generateAssetId(categoryCode, productCode) {
    const cat = (categoryCode || 'AST').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    const prod = (productCode || 'GEN').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    const prefix = `${cat}-${prod}-`;
    const escapedPrefix = prefix.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    const matchingAssets = await Asset.find(
        { assetId: new RegExp('^' + escapedPrefix) },
        'assetId'
    );

    let highestNum = 0;
    for (const a of matchingAssets) {
        if (a.assetId) {
            const parts = a.assetId.split('-');
            if (parts.length === 3) {
                const num = parseInt(parts[2], 10);
                if (!isNaN(num) && num > highestNum) highestNum = num;
            }
        }
    }

    return `${prefix}${String(highestNum + 1).padStart(4, '0')}`;
}

const activitySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    action: { type: String },
    detail: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const Activity = mongoose.model('Activity', activitySchema);

async function logActivity(userId, userName, action, detail = '') {
    try {
        await new Activity({ userId, userName, action, detail }).save();
    } catch (err) {
        console.log('Activity log error:', err.message);
    }
}

const maintenanceSchema = new mongoose.Schema({
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    assetName: { type: String },
    assetCode: { type: String },
    type: { type: String, enum: ['scheduled', 'repair', 'inspection', 'upgrade'], required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'in-progress', 'completed', 'cancelled'], default: 'pending' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    scheduledDate: { type: Date, required: true },
    completedDate: { type: Date },
    vendor: { type: String, default: '' },
    cost: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Maintenance = mongoose.model('Maintenance', maintenanceSchema);

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePhone(phone) {
    if (!phone) return true;
    return /^[0-9+\-\s()]{10}$/.test(phone);
}

const inventorySchema = new mongoose.Schema({
    itemCode: { type: String, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'General' },
    unit: { type: String, default: 'pcs' },
    quantity: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 5 },
    purchasePrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    location: { type: String, default: '' },
    supplier: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
const InventoryItem = mongoose.model('InventoryItem', inventorySchema);

const inventoryTxSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    itemName: { type: String },
    itemCode: { type: String },
    type: { type: String, enum: ['stock-in', 'stock-out', 'adjustment'], required: true },
    quantity: { type: Number, required: true },
    balanceBefore: { type: Number },
    balanceAfter: { type: Number },
    reason: { type: String, default: '' },
    reference: { type: String, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const InventoryTx = mongoose.model('InventoryTx', inventoryTxSchema);

const depreciationSchema = new mongoose.Schema({
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    assetName: { type: String },
    assetCode: { type: String },
    year: { type: Number, required: true },
    method: { type: String, enum: ['straight-line', 'reducing-balance'], required: true },
    openingValue: { type: Number, required: true },
    depreciationRate: { type: Number, required: true },
    depreciationAmount: { type: Number, required: true },
    closingValue: { type: Number, required: true },
    calculatedAt: { type: Date, default: Date.now },
    calculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    calculatedByName: { type: String }
});
const Depreciation = mongoose.model('Depreciation', depreciationSchema);

const insuranceSchema = new mongoose.Schema({
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    assetName: { type: String },
    assetCode: { type: String },
    policyNumber: { type: String, required: true },
    provider: { type: String, required: true },
    type: { type: String, default: 'comprehensive' },
    coverageAmount: { type: Number, default: 0 },
    premium: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
const Insurance = mongoose.model('Insurance', insuranceSchema);

const requestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    itemRequested: String,
    reason: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    managerNotes: { type: String, default: '' },
    linkedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
    createdAt: { type: Date, default: Date.now }
});
const AssetRequest = mongoose.model('AssetRequest', requestSchema);

const auditSchema = new mongoose.Schema({
    title: String,
    status: { type: String, enum: ['open', 'completed'], default: 'open' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
const Audit = mongoose.model('Audit', auditSchema);

const auditItemSchema = new mongoose.Schema({
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Audit' },
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    assetName: String,
    assetCode: String,
    status: { type: String, enum: ['pending', 'verified', 'missing', 'damaged'], default: 'pending' },
    notes: String,
    auditedAt: Date
});
const AuditItem = mongoose.model('AuditItem', auditItemSchema);

const equipmentMasterSchema = new mongoose.Schema({
    manufacturer: { type: String, required: true },
    productCode: { type: String, required: true }
}, { timestamps: true });
const EquipmentMaster = mongoose.model('EquipmentMaster', equipmentMasterSchema);

const deviceTypeSchema = new mongoose.Schema({
    shortCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    depreciationRate: { type: Number, default: null }
}, { timestamps: true });
const DeviceType = mongoose.model('DeviceType', deviceTypeSchema);

const locationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String }
}, { timestamps: true });
const Location = mongoose.model('Location', locationSchema);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendNotification(to, subject, text) {
    if (!process.env.EMAIL_USER) return;
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
    } catch (err) { console.log('Email Error:', err.message); }
}

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.userRole))
            return res.status(403).json({ message: 'Access denied' });
        next();
    };
}

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, department, phone } = req.body;
    if (!name) return res.status(400).json({ message: 'Full name is required' });
    if (!email) return res.status(400).json({ message: 'Email address is required' });
    if (!password) return res.status(400).json({ message: 'Password is required' });
    if (!validateEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address' });
    if (name.trim().length < 3) return res.status(400).json({ message: 'Name must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (!validatePhone(req.body.phone)) return res.status(400).json({ message: 'Please enter a valid phone number' });

    try {
        const existing = await User.findOne({ email });
        if (existing) return res.status(409).json({ message: 'Email already registered' });

        const userCount = await User.countDocuments();
        const isFirstUser = userCount === 0;

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name, email,
            password: hashedPassword,
            role: isFirstUser ? 'admin' : 'employee',
            department: department || '',
            phone: phone || '',
            isApproved: isFirstUser
        });
        await user.save();

        if (isFirstUser) {
            return res.status(201).json({
                message: 'First account created! You are the Admin. Please login.',
                isFirstUser: true
            });
        }

        res.status(201).json({
            message: 'Registration successful! Please wait for admin approval before logging in.',
            isFirstUser: false
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ message: 'Email address is required' });
    if (!password) return res.status(400).json({ message: 'Password is required' });
    if (!validateEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address' });
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'Email not found' });
        if (!user.isActive) return res.status(403).json({ message: 'Account is deactivated. Contact admin.' });
        if (!user.isApproved) return res.status(403).json({ message: 'Account pending approval. Contact admin.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Wrong password' });

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        await logActivity(user._id, user.name, 'login', `Logged in as ${user.role}`);

        res.json({
            message: 'Login successful!',
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                department: user.department
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.get('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const { name, department, phone } = req.body;
        const user = await User.findByIdAndUpdate(
            req.userId,
            { name, department, phone },
            { returnDocument: 'after' }
        ).select('-password');
        res.json({ message: 'Profile updated!', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/users', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/users/pending', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const users = await User.find({ isApproved: false }).select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/users/:id/approve', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { role } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isApproved: true, role: role || 'employee' },
            { returnDocument: 'after' }
        ).select('-password');

        const approver = await User.findById(req.userId);
        await logActivity(req.userId, approver.name, 'user_approved',
            `Approved ${user.name} as ${user.role}`);

        res.json({ message: 'User approved!', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/users/:id/reject', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        await User.findByIdAndDelete(req.params.id);

        const rejecter = await User.findById(req.userId);
        await logActivity(req.userId, rejecter.name, 'user_rejected',
            `Rejected registration of ${user.name}`);

        res.json({ message: 'User rejected and removed.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/users', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name, email, password, role, department, phone } = req.body;
    if (!name) return res.status(400).json({ message: 'Full name is required' });
    if (!email) return res.status(400).json({ message: 'Email address is required' });
    if (!password) return res.status(400).json({ message: 'Password is required' });
    if (!validateEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address' });
    if (name.trim().length < 3) return res.status(400).json({ message: 'Name must be at least 3 characters' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (!['admin', 'manager', 'employee'].includes(role)) return res.status(400).json({ message: 'Invalid role specified' });

    try {
        const existing = await User.findOne({ email });
        if (existing) return res.status(409).json({ message: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name, email,
            password: hashedPassword,
            role: role || 'employee',
            department: department || '',
            phone: phone || '',
            isApproved: true
        });
        await user.save();

        const creator = await User.findById(req.userId);
        await logActivity(req.userId, creator.name, 'user_created',
            `Created ${name} as ${role}`);

        res.status(201).json({ message: 'User created!', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.put('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { name, role, department, phone, isActive } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { name, role, department, phone, isActive },
            { returnDocument: 'after' }
        ).select('-password');

        const updater = await User.findById(req.userId);
        await logActivity(req.userId, updater.name, 'user_updated',
            `Updated ${user.name}`);

        res.json({ message: 'User updated!', user });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        await User.findByIdAndDelete(req.params.id);

        const deleter = await User.findById(req.userId);
        await logActivity(req.userId, deleter.name, 'user_deleted',
            `Deleted user ${user.name}`);

        res.json({ message: 'User deleted!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ isApproved: true });
        const activeUsers = await User.countDocuments({ isApproved: true, isActive: true });
        const pendingUsers = await User.countDocuments({ isApproved: false });
        const adminCount = await User.countDocuments({ role: 'admin', isApproved: true });
        const managerCount = await User.countDocuments({ role: 'manager', isApproved: true });
        const employeeCount = await User.countDocuments({ role: 'employee', isApproved: true });

        const recentActivities = await Activity.find()
            .sort({ createdAt: -1 })
            .limit(10);

        const totalAssets = await Asset.countDocuments();
        const activeAssets = await Asset.countDocuments({ status: { $in: ['active', 'assigned'] } });

        res.json({
            totalUsers, activeUsers, pendingUsers,
            adminCount, managerCount, employeeCount,
            totalAssets, activeAssets,
            recentActivities
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/activity', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const activities = await Activity.find()
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(activities);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/categories', authMiddleware, async (req, res) => {
    try {
        const categories = await Category.find({}).sort({ name: 1 });

        const categoriesWithCount = await Promise.all(categories.map(async (cat) => {
            const count = await Asset.countDocuments({ categoryName: { $regex: cat.name, $options: 'i' } });
            return { ...cat.toObject(), assetCount: count };
        }));
        res.json(categoriesWithCount);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/categories', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { name, type, mobility, description, icon } = req.body;
        if (!name) return res.status(400).json({ message: 'Category name is required' });
        if (!type) return res.status(400).json({ message: 'Category type is required' });
        if (!mobility) return res.status(400).json({ message: 'Category mobility is required' });
        if (name.trim().length < 3) return res.status(400).json({ message: 'Name must be at least 3 characters' });
        if (name.trim().length > 50) return res.status(400).json({ message: 'Name must be under 50 characters' });
        if (!['tangible', 'non-tangible'].includes(type)) return res.status(400).json({ message: 'Type must be tangible or non-tangible' });
        if (!['moveable', 'non-moveable'].includes(mobility)) return res.status(400).json({ message: 'Mobility must be moveable or non-moveable' });

        const existing = await Category.findOne({ name });
        if (existing) return res.status(409).json({ message: 'Category already exists' });

        const category = new Category({ name, type, mobility, description, icon, createdBy: req.userId });
        await category.save();

        const user = await User.findById(req.userId);
        await logActivity(req.userId, user.name, 'category_created', `Created category: ${name}`);

        res.status(201).json(category);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.put('/api/categories/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { name, type, mobility, description, icon } = req.body;
        const category = await Category.findByIdAndUpdate(
            req.params.id,
            { name, type, mobility, description, icon },
            { returnDocument: 'after' }
        );
        res.json({ message: 'Category updated!', category });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/categories/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const assetsInCategory = await Asset.countDocuments({ categoryId: req.params.id });
        if (assetsInCategory > 0)
            return res.status(400).json({ message: `Cannot delete — ${assetsInCategory} assets use this category` });

        await Category.findByIdAndDelete(req.params.id);
        res.json({ message: 'Category deleted!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/locations', authMiddleware, async (req, res) => {
    try {
        const locs = await Location.find().sort({ name: 1 });
        res.json(locs);
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/locations', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const loc = new Location(req.body);
        await loc.save();
        res.status(201).json(loc);
    } catch (err) { res.status(500).json({ message: 'Failed to save location' }); }
});

app.delete('/api/locations/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        await Location.findByIdAndDelete(req.params.id);
        res.json({ message: 'Location deleted' });
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/assets', authMiddleware, async (req, res) => {
    try {
        const { status, category, assignedTo, search } = req.query;
        let query = {};

        if (req.userRole === 'employee') {
            const approvedReqs = await AssetRequest.find({
                userId: req.userId,
                status: 'approved',
                linkedAssetId: { $ne: null }
            }, 'linkedAssetId');
            const linkedIds = approvedReqs.map(r => r.linkedAssetId);
            query.$or = [
                { assignedTo: new mongoose.Types.ObjectId(req.userId) },
                { _id: { $in: linkedIds } }
            ];
        } else {
            if (assignedTo) query.assignedTo = assignedTo;
        }

        if (status) query.status = status;
        if (category) query.categoryId = category;
        if (search) query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { assetId: { $regex: search, $options: 'i' } },
            { serialNumber: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
        ];

        const assets = await Asset.find(query)
            .populate('categoryId', 'name type mobility icon')
            .populate('assignedTo', 'name email')
            .sort({ createdAt: -1 });
        res.json(assets);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/assets/:id', authMiddleware, async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id)
            .populate('categoryId', 'name type mobility icon')
            .populate('assignedTo', 'name email department');
        if (!asset) return res.status(404).json({ message: 'Asset not found' });
        res.json(asset);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/assets/:id/history', authMiddleware, async (req, res) => {
    try {
        const history = await AssetHistory.find({ assetId: req.params.id })
            .sort({ createdAt: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/assets/check-duplicate', authMiddleware, async (req, res) => {
    try {
        const { serialNumber, name, categoryId, excludeId } = req.body;
        const results = {};

        if (serialNumber && serialNumber.trim()) {
            const query = {
                serialNumber: { $regex: `^${serialNumber.trim()}$`, $options: 'i' },
                status: { $ne: 'disposed' }
            };
            if (excludeId) query._id = { $ne: excludeId };
            const found = await Asset.findOne(query).select('name assetId');
            if (found) results.serialNumber = { duplicate: true, asset: found };
        }

        if (name && categoryId) {
            const query = {
                name: { $regex: `^${name.trim()}$`, $options: 'i' },
                status: { $ne: 'disposed' }
            };
            if (excludeId) query._id = { $ne: excludeId };
            const found = await Asset.findOne(query).select('name assetId categoryName');
            if (found) results.name = { duplicate: true, asset: found };
        }

        res.json({ hasDuplicate: Object.keys(results).length > 0, results });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/assets', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'Current authenticated user not found' });

        const {
            name, description, categoryId, categoryName, subCategory,
            status, condition, purchaseDate, purchasePrice, currentValue,
            vendorName, serialNumber, assetTag, warrantyExpiry,
            location, assignedTo, assignedToName
        } = req.body;

        if (!name) return res.status(400).json({ message: 'Asset name is required' });
        if (name.trim().length < 2) return res.status(400).json({ message: 'Asset name must be at least 2 characters' });
        if (name.trim().length > 100) return res.status(400).json({ message: 'Asset name must be under 100 characters' });
        if (purchasePrice !== undefined && purchasePrice < 0) return res.status(400).json({ message: 'Purchase price cannot be negative' });
        if (currentValue !== undefined && currentValue < 0) return res.status(400).json({ message: 'Current value cannot be negative' });
        if (purchaseDate && warrantyExpiry && new Date(warrantyExpiry) < new Date(purchaseDate)) {
            return res.status(400).json({ message: 'Warranty expiry cannot be before purchase date' });
        }

        let safeCategoryId = null;
        if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
            safeCategoryId = new mongoose.Types.ObjectId(categoryId);
        }

        const nameUpper = name.trim().toUpperCase();
        let deviceTypeDoc = await DeviceType.findOne({ shortCode: nameUpper });
        let catCode;
        let finalDeviceName = name.trim();
        if (deviceTypeDoc) {
            catCode = deviceTypeDoc.shortCode;
            finalDeviceName = deviceTypeDoc.fullName;
        } else {
            deviceTypeDoc = await DeviceType.findOne({ fullName: { $regex: `^${name.trim()}$`, $options: 'i' } });
            if (deviceTypeDoc) {
                catCode = deviceTypeDoc.shortCode;
                finalDeviceName = deviceTypeDoc.fullName;
            } else {
                catCode = name.trim().substring(0, 3).toUpperCase();
                finalDeviceName = name.trim();
            }
        }

        if (serialNumber && serialNumber.trim()) {
            const existingSerial = await Asset.findOne({
                serialNumber: { $regex: `^${serialNumber.trim()}$`, $options: 'i' },
                status: { $ne: 'disposed' }
            });
            if (existingSerial) {
                return res.status(409).json({
                    message: `Duplicate serial number — asset "${existingSerial.name}" (${existingSerial.assetId}) already has serial number "${serialNumber.trim()}".`,
                    duplicateType: 'serialNumber',
                    existingAsset: { id: existingSerial._id, name: existingSerial.name, assetId: existingSerial.assetId }
                });
            }
        }

        if (finalDeviceName && categoryId) {
            const existingName = await Asset.findOne({
                name: { $regex: `^${finalDeviceName.trim()}$`, $options: 'i' },
                subCategory: { $regex: `^${(subCategory || '').trim()}$`, $options: 'i' },
                categoryId: safeCategoryId,
                status: { $ne: 'disposed' }
            });
            if (existingName && !req.body.forceCreate) {
                return res.status(409).json({
                    message: `An asset named "${finalDeviceName.trim()}" with manufacturer "${subCategory || 'Same'}" already exists in this category (${existingName.assetId}). Click "Save Anyway" to create it as a separate asset.`,
                    duplicateType: 'name',
                    existingAsset: { id: existingName._id, name: existingName.name, assetId: existingName.assetId },
                    canForce: true
                });
            }
        }

        let prodCode = req.body.productCode || '';
        if (!prodCode && req.body.equipmentMasterId) {
            const eq = await EquipmentMaster.findById(req.body.equipmentMasterId);
            if (eq) prodCode = eq.productCode.toUpperCase();
        }
        if (!prodCode && vendorName) {
            prodCode = vendorName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
        }
        if (!prodCode) prodCode = 'GEN';


        const assetId = await generateAssetId(catCode, prodCode);

        const asset = new Asset({
            assetId,
            name: finalDeviceName,
            description, categoryId, categoryName, subCategory,
            status: status || 'active',
            condition: condition || 'good',
            purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
            purchasePrice: purchasePrice || 0,
            currentValue: currentValue || purchasePrice || 0,
            vendorName, serialNumber, assetTag,
            warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
            location,
            assignedTo: assignedTo || null,
            assignedToName: assignedToName || '',
            assignedDate: assignedTo ? new Date() : null,
            createdBy: req.userId
        });

        await asset.save();

        if (assignedTo) {
            await new AssetHistory({
                assetId: asset._id,
                assetName: finalDeviceName,
                action: 'assigned',
                fromUser: 'None',
                toUser: assignedToName,
                toLocation: location || '',
                notes: 'Assigned at creation',
                performedBy: user.name
            }).save();
        }

        await logActivity(req.userId, user.name, 'asset_created',
            `Created asset ${assetId}: ${finalDeviceName}`);

        res.status(201).json(asset);
    } catch (err) {
        console.log('Asset creation error:', err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.put('/api/assets/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const oldAsset = await Asset.findById(req.params.id);
        const user = await User.findById(req.userId);

        const { serialNumber, assetTag } = req.body;

        if (serialNumber && serialNumber.trim()) {
            const existingSerial = await Asset.findOne({
                serialNumber: { $regex: `^${serialNumber.trim()}$`, $options: 'i' },
                status: { $ne: 'disposed' },
                _id: { $ne: req.params.id }
            });
            if (existingSerial) {
                return res.status(409).json({
                    message: `Duplicate serial number — asset "${existingSerial.name}" (${existingSerial.assetId}) already has this serial number.`,
                    duplicateType: 'serialNumber'
                });
            }
        }

        const updateBody = { ...req.body, updatedAt: new Date() };
        if (updateBody.categoryId && mongoose.Types.ObjectId.isValid(updateBody.categoryId)) {
            updateBody.categoryId = new mongoose.Types.ObjectId(updateBody.categoryId);
        } else if (updateBody.categoryId === '') {
            updateBody.categoryId = null;
        }

        const updated = await Asset.findByIdAndUpdate(
            req.params.id,
            updateBody,
            // { ...req.body, updatedAt: new Date() },
            { returnDocument: 'after' }
        );
        if (req.body.assignedTo && req.body.assignedTo !== oldAsset.assignedTo?.toString()) {
            await new AssetHistory({
                assetId: updated._id,
                assetName: updated.name,
                action: 'transferred',
                fromUser: oldAsset.assignedToName || 'Unassigned',
                toUser: req.body.assignedToName || 'Unassigned',
                fromLocation: oldAsset.location || '',
                toLocation: req.body.location || '',
                notes: 'Reassigned via edit',
                performedBy: user.name
            }).save();
        }
        if (req.body.status && req.body.status !== oldAsset.status) {
            await new AssetHistory({
                assetId: updated._id,
                assetName: updated.name,
                action: req.body.status,
                fromUser: oldAsset.assignedToName || '',
                notes: `Status changed: ${oldAsset.status} → ${req.body.status}`,
                performedBy: user.name
            }).save();
        }

        await logActivity(req.userId, user.name, 'asset_updated', `Updated asset: ${updated.name}`);
        res.json({ message: 'Asset updated!', asset: updated });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.delete('/api/assets/truncate', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        await Asset.deleteMany({});
        res.json({ message: 'All assets truncated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/assets/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id);
        const user = await User.findById(req.userId);
        await Asset.findByIdAndDelete(req.params.id);
        await AssetHistory.deleteMany({ assetId: req.params.id });
        await logActivity(req.userId, user.name, 'asset_deleted', `Deleted asset: ${asset.name}`);
        res.json({ message: 'Asset deleted!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/assets/:id/assign', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { assignedTo, assignedToName, location, notes } = req.body;
        const oldAsset = await Asset.findById(req.params.id);
        const user = await User.findById(req.userId);

        const asset = await Asset.findByIdAndUpdate(
            req.params.id,
            { assignedTo, assignedToName, location, assignedDate: new Date(), updatedAt: new Date(), status: assignedTo ? 'assigned' : 'active' },
            { returnDocument: 'after' }
        );

        await new AssetHistory({
            assetId: asset._id,
            assetName: asset.name,
            action: assignedTo ? 'assigned' : 'unassigned',
            fromUser: oldAsset.assignedToName || 'Unassigned',
            toUser: assignedToName || 'Unassigned',
            fromLocation: oldAsset.location || '',
            toLocation: location || '',
            notes: notes || '',
            performedBy: user.name
        }).save();

        await logActivity(req.userId, user.name, 'asset_assigned',
            `${assignedTo ? 'Assigned' : 'Unassigned'} ${asset.name} ${assignedTo ? 'to ' + assignedToName : ''}`);

        if (assignedTo) {
            const assignedUser = await User.findById(assignedTo);
            if (assignedUser && assignedUser.email) {
                const subject = 'AssetMS: New Asset Assigned to You 📦';
                const message = `Hello ${assignedUser.name},\n\nA new asset has been assigned to you by your manager.\n\nAsset Details:\n- Name: ${asset.name}\n- Asset Code: ${asset.assetId || 'N/A'}\n- Category: ${asset.categoryName || 'N/A'}\n\nPlease log in to the Asset Management System dashboard to view your current assets.\n\nThank you,\nAssetMS Admin Team`;

                await sendNotification(assignedUser.email, subject, message);
            }
        }
        res.json({ message: 'Asset assignment updated!', asset });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/assets/stats/summary', authMiddleware, async (req, res) => {
    try {
        const baseFilter = req.userRole === 'employee'
            ? { assignedTo: new mongoose.Types.ObjectId(req.userId) }
            : {};

        const [total, active, inRepair, disposed, lost, assigned, valueAgg, byCategory] = await Promise.all([
            Asset.countDocuments(baseFilter),
            Asset.countDocuments({ ...baseFilter, status: { $in: ['active', 'assigned'] } }),
            Asset.countDocuments({ ...baseFilter, status: 'in-repair' }),
            Asset.countDocuments({ ...baseFilter, status: 'disposed' }),
            Asset.countDocuments({ ...baseFilter, status: 'lost' }),
            Asset.countDocuments({ ...baseFilter, assignedTo: { $ne: null } }),
            Asset.aggregate([
                { $match: baseFilter },
                { $group: { _id: null, total: { $sum: '$currentValue' } } }
            ]),
            Asset.aggregate([
                { $match: baseFilter },
                { $group: { _id: '$categoryName', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ])
        ]);

        res.json({
            total, active, inRepair, disposed, lost, assigned,
            totalValue: valueAgg[0]?.total || 0,
            byCategory
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/assets/bulk-delete', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { assetIds } = req.body;
        await Asset.deleteMany({ _id: { $in: assetIds } });
        res.json({ message: 'Selected assets deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/maintenance', authMiddleware, async (req, res) => {
    try {
        const { status, type, assetId } = req.query;
        let query = {};
        if (status) query.status = status;
        if (type) query.type = type;
        if (assetId) query.assetId = assetId;

        const requestingUser = await User.findById(req.userId).select('role');
        if (req.userRole === 'employee') {
            const myAssets = await Asset.find({ assignedTo: req.userId }, '_id');
            query.assetId = { $in: myAssets.map(a => a._id) };
        }

        const records = await Maintenance.find(query)
            .populate('assetId', 'name assetId location')
            .sort({ scheduledDate: 1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/maintenance/stats', authMiddleware, async (req, res) => {
    try {
        const requestingUser = await User.findById(req.userId).select('role');
        let baseFilter = {};
        if (req.userRole === 'employee') {
            const myAssets = await Asset.find({ assignedTo: req.userId }, '_id');
            baseFilter = { assetId: { $in: myAssets.map(a => a._id) } };
        }

        const total = await Maintenance.countDocuments(baseFilter);
        const pending = await Maintenance.countDocuments({ ...baseFilter, status: 'pending' });
        const inProgress = await Maintenance.countDocuments({ ...baseFilter, status: 'in-progress' });
        const completed = await Maintenance.countDocuments({ ...baseFilter, status: 'completed' });
        const overdue = await Maintenance.countDocuments({
            ...baseFilter,
            status: { $in: ['pending', 'in-progress'] },
            scheduledDate: { $lt: new Date() }
        });

        const costAgg = await Maintenance.aggregate([
            { $match: { ...baseFilter, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$cost' } } }
        ]);

        const next7 = new Date();
        next7.setDate(next7.getDate() + 7);
        const upcoming = await Maintenance.countDocuments({
            ...baseFilter,
            status: 'pending',
            scheduledDate: { $gte: new Date(), $lte: next7 }
        });

        res.json({ total, pending, inProgress, completed, overdue, upcoming, totalCost: costAgg[0]?.total || 0 });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/maintenance/asset/:assetId', authMiddleware, async (req, res) => {
    try {
        const records = await Maintenance.find({ assetId: req.params.assetId })
            .sort({ scheduledDate: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/maintenance', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { assetId, type, title, description, priority, scheduledDate, vendor, cost, notes } = req.body;
        if (!assetId || !title || !scheduledDate)
            return res.status(400).json({ message: 'Asset, title and scheduled date are required' });

        const asset = await Asset.findById(assetId);
        if (!asset) return res.status(404).json({ message: 'Asset not found' });

        const user = await User.findById(req.userId);
        const record = new Maintenance({
            assetId,
            assetName: asset.name,
            assetCode: asset.assetId,
            type, title, description, priority,
            scheduledDate: new Date(scheduledDate),
            vendor, cost: cost || 0, notes,
            createdBy: req.userId,
            createdByName: user.name
        });
        await record.save();

        if (type === 'repair') {
            await Asset.findByIdAndUpdate(assetId, { status: 'in-repair', updatedAt: new Date() });
            await new AssetHistory({
                assetId: assetId,
                assetName: asset.name,
                action: 'in-repair',
                notes: `Maintenance scheduled: ${title}`,
                performedBy: user.name
            }).save();
        }

        await logActivity(req.userId, user.name, 'maintenance_created',
            `Scheduled ${type} for ${asset.name}`);

        res.status(201).json(record);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.put('/api/maintenance/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { status, completedDate, cost, notes, vendor } = req.body;
        const record = await Maintenance.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { returnDocument: 'after' }
        );

        if (status === 'completed') {
            const asset = await Asset.findById(record.assetId);
            if (asset && asset.status === 'in-repair') {
                await Asset.findByIdAndUpdate(record.assetId, { status: 'active', updatedAt: new Date() });
                const user = await User.findById(req.userId);
                await new AssetHistory({
                    assetId: record.assetId,
                    assetName: record.assetName,
                    action: 'active',
                    notes: `Maintenance completed: ${record.title}. Cost: ₹${cost || 0}`,
                    performedBy: user.name
                }).save();
            }
        }

        const user = await User.findById(req.userId);
        await logActivity(req.userId, user.name, 'maintenance_updated',
            `Updated maintenance: ${record.title} → ${status}`);

        res.json({ message: 'Maintenance updated!', record });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.delete('/api/maintenance/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        await Maintenance.findByIdAndDelete(req.params.id);
        res.json({ message: 'Maintenance record deleted!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/maintenance/alerts', authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        const next7 = new Date(); next7.setDate(today.getDate() + 7);
        const next30 = new Date(); next30.setDate(today.getDate() + 30);

        const requestingUser = await User.findById(req.userId).select('role');
        let assetFilter = {};
        let maintAssetFilter = {};
        if (req.userRole === 'employee') {
            const myAssets = await Asset.find({ assignedTo: req.userId }, '_id');
            const myAssetIds = myAssets.map(a => a._id);
            maintAssetFilter = { assetId: { $in: myAssetIds } };
            assetFilter = { _id: { $in: myAssetIds } };
        }

        const overdue = await Maintenance.find({
            ...maintAssetFilter,
            status: { $in: ['pending', 'in-progress'] },
            scheduledDate: { $lt: today }
        }).populate('assetId', 'name assetId').sort({ scheduledDate: 1 });

        const dueSoon = await Maintenance.find({
            ...maintAssetFilter,
            status: 'pending',
            scheduledDate: { $gte: today, $lte: next7 }
        }).populate('assetId', 'name assetId').sort({ scheduledDate: 1 });

        const warranties = await Asset.find({
            ...assetFilter,
            warrantyExpiry: { $gte: today, $lte: next30 }
        }).select('name assetId warrantyExpiry location');

        res.json({ overdue, dueSoon, warranties });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/reports/summary', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const byStatus = await Asset.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$currentValue' } } }
        ]);
        const byCategory = await Asset.aggregate([
            { $group: { _id: '$categoryName', count: { $sum: 1 }, value: { $sum: '$currentValue' } } },
            { $sort: { count: -1 } }
        ]);
        const byCondition = await Asset.aggregate([
            { $group: { _id: '$condition', count: { $sum: 1 } } }
        ]);
        const totalValue = await Asset.aggregate([
            { $group: { _id: null, purchase: { $sum: '$purchasePrice' }, current: { $sum: '$currentValue' } } }
        ]);
        const deprTotal = await Depreciation.aggregate([
            { $group: { _id: null, total: { $sum: '$depreciationAmount' } } }
        ]);
        const maintCosts = await Maintenance.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$cost' } } }
        ]);

        res.json({
            byStatus, byCategory, byCondition,
            totalPurchaseValue: totalValue[0]?.purchase || 0,
            totalCurrentValue: totalValue[0]?.current || 0,
            totalDepreciation: deprTotal[0]?.total || 0,
            totalMaintenanceCost: maintCosts[0]?.total || 0
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/assets/bulk-import', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { assets } = req.body;
        if (!assets || !Array.isArray(assets) || assets.length === 0)
            return res.status(400).json({ message: 'No assets provided' });

        const user = await User.findById(req.userId);
        const results = { success: 0, failed: 0, errors: [] };

        const [allDeviceTypes, allEquipment, existingAssetIds] = await Promise.all([
            DeviceType.find({}, 'shortCode fullName'),
            EquipmentMaster.find({}, 'manufacturer productCode'),
            Asset.find({}, 'assetId')
        ]);

        const dtByShort = {};
        const dtByFull = {};
        for (const dt of allDeviceTypes) {
            dtByShort[dt.shortCode.toUpperCase()] = dt.fullName;
            dtByFull[dt.fullName.toLowerCase()] = dt.shortCode.toUpperCase();
        }

        const mfrMap = {};
        for (const eq of allEquipment) {
            mfrMap[eq.manufacturer.toLowerCase()] = eq.productCode.toUpperCase();
            mfrMap[eq.productCode.toLowerCase()] = eq.productCode.toUpperCase();
        }

        const prefixCounters = {};
        for (const a of existingAssetIds) {
            if (!a.assetId) continue;
            const parts = a.assetId.split('-');
            if (parts.length === 3) {
                const prefix = `${parts[0]}-${parts[1]}-`;
                const num = parseInt(parts[2], 10);
                if (!isNaN(num)) {
                    prefixCounters[prefix] = Math.max(prefixCounters[prefix] || 0, num);
                }
            }
        }

        function nextAssetId(catCode, prodCode) {
            const cat = (catCode || 'AST').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const prod = (prodCode || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const prefix = `${cat}-${prod}-`;
            const next = (prefixCounters[prefix] || 0) + 1;
            prefixCounters[prefix] = next;
            return `${prefix}${String(next).padStart(4, '0')}`;
        }

        const existingSerials = new Set(
            (await Asset.find({ serialNumber: { $ne: '' }, status: { $ne: 'disposed' } }, 'serialNumber'))
                .map(a => a.serialNumber.trim().toLowerCase())
        );
        const batchSerials = new Set();

        const toInsert = [];

        for (const row of assets) {
            try {
                if (!row.name || !row.name.trim()) {
                    results.failed++;
                    results.errors.push('Row skipped — missing name/device type');
                    continue;
                }

                const rowName = row.name.trim();
                const rowSerial = (row.serialNumber || '').trim();
                const serialKey = rowSerial.toLowerCase();

                if (rowSerial) {
                    if (existingSerials.has(serialKey)) {
                        results.failed++;
                        results.errors.push(`"${rowName}" skipped — Duplicate Serial (${rowSerial}) already in database`);
                        continue;
                    }
                    if (batchSerials.has(serialKey)) {
                        results.failed++;
                        results.errors.push(`"${rowName}" skipped — Duplicate Serial (${rowSerial}) in import file`);
                        continue;
                    }
                }

                const codeUpper = rowName.toUpperCase();
                let catCode, finalDeviceName;
                if (dtByShort[codeUpper]) {
                    catCode = codeUpper;
                    finalDeviceName = dtByShort[codeUpper];
                } else if (dtByFull[rowName.toLowerCase()]) {
                    catCode = dtByFull[rowName.toLowerCase()];
                    finalDeviceName = rowName;
                } else {
                    catCode = rowName.substring(0, 3).toUpperCase();
                    finalDeviceName = rowName;
                }

                let rowVendorRaw = (row.vendor || '').trim();
                if (!rowVendorRaw || rowVendorRaw.includes('/')) {
                    rowVendorRaw = (row.subCategory || '').trim();
                }
                const rowVendor = rowVendorRaw;
                let prodCode = '';
                if (rowVendor) {
                    prodCode = mfrMap[rowVendor.toLowerCase()]
                        || rowVendor.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
                }
                if (!prodCode) prodCode = 'GEN';

                const assetId = nextAssetId(catCode, prodCode);

                toInsert.push({
                    assetId,
                    name: finalDeviceName,
                    description: row.description || '',
                    categoryName: row.category || '',
                    subCategory: row.subCategory || '',
                    status: ['active', 'in-repair', 'disposed', 'lost', 'reserved'].includes(row.status?.toLowerCase())
                        ? row.status.toLowerCase() : 'active',
                    condition: ['excellent', 'good', 'fair', 'poor'].includes(row.condition?.toLowerCase())
                        ? row.condition.toLowerCase() : 'good',
                    purchaseDate: row.purchaseDate ? new Date(row.purchaseDate) : null,
                    purchasePrice: parseFloat(row.purchasePrice) || 0,
                    currentValue: parseFloat(row.currentValue) || parseFloat(row.purchasePrice) || 0,
                    vendorName: rowVendor,
                    serialNumber: rowSerial,
                    assetTag: row.assetTag || '',
                    warrantyExpiry: row.warrantyExpiry ? new Date(row.warrantyExpiry) : null,
                    location: row.location || '',
                    assignedToName: row.assignedTo || '',
                    createdBy: req.userId
                });

                if (rowSerial) {
                    batchSerials.add(serialKey);
                    existingSerials.add(serialKey);
                }
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`"${row.name || 'unknown'}" - ${err.message}`);
            }
        }

        if (toInsert.length > 0) {
            try {
                await Asset.insertMany(toInsert, { ordered: false });
            } catch (bulkErr) {
                if (bulkErr.writeErrors) {
                    for (const we of bulkErr.writeErrors) {
                        results.success--;
                        results.failed++;
                        results.errors.push(`Insert error at index ${we.index}: ${we.errmsg}`);
                    }
                } else {
                    throw bulkErr;
                }
            }
        }

        await logActivity(req.userId, user.name, 'bulk_import',
            `Imported ${results.success} assets (${results.failed} failed)`);

        res.json({
            message: `Import complete: ${results.success} added, ${results.failed} failed.`,
            ...results
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

async function generateItemCode() {
    const count = await InventoryItem.countDocuments();
    return `ITM-${String(count + 1).padStart(4, '0')}`;
}

app.get('/api/inventory/stats', authMiddleware, async (req, res) => {
    try {
        const total = await InventoryItem.countDocuments({ isActive: true });
        const lowStock = await InventoryItem.countDocuments({ isActive: true, $expr: { $lte: ['$quantity', '$reorderLevel'] } });
        const outOfStock = await InventoryItem.countDocuments({ isActive: true, quantity: 0 });
        const items = await InventoryItem.find({ isActive: true });
        const totalValue = items.reduce((sum, i) => sum + (i.quantity + i.purchasePrice), 0);
        res.json({ total, lowStock, outOfStock, totalValue });
    }
    catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/inventory', authMiddleware, async (req, res) => {
    try {
        const items = await InventoryItem.find({ isActive: true }).sort({ createdAt: -1 });
        res.json(items);
    }
    catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/inventory/:id', authMiddleware, async (req, res) => {
    try {
        const item = await InventoryItem.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        res.json(item);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/inventory/:id/transactions', authMiddleware, async (req, res) => {
    try {
        const txs = await InventoryTx.find({ itemId: req.params.id }).sort({ createdAt: -1 }).limit(50);
        res.json(txs);
    }
    catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/inventory/transactions/all', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const txs = await InventoryTx.find({}).sort({ createdAt: -1 }).limit(100);
        res.json(txs);
    }
    catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/inventory', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { name, description, category, unit, quantity, reorderLevel, purchasePrice, sellingPrice, location, supplier } = req.body;
        if (!name) return res.status(400).json({ message: 'Item name is required' });

        const itemCode = await generateItemCode();
        const item = new InventoryItem({
            itemCode, name, description, category,
            unit: unit || 'pcs',
            quantity: parseFloat(quantity) || 0,
            reorderLevel: parseFloat(reorderLevel) || 5,
            purchasePrice: parseFloat(purchasePrice) || 0,
            sellingPrice: parseFloat(sellingPrice) || 0,
            location, supplier,
            createdBy: req.userId
        });
        await item.save();

        if (item.quantity > 0) {
            const user = await User.findById(req.userId);
            await new InventoryTx({
                itemId: item._id, itemName: item.name, itemCode: item.itemCode,
                type: 'stock-in', quantity: item.quantity,
                balanceBefore: 0, balanceAfter: item.quantity,
                reason: 'Opening stock', performedBy: req.userId,
                performedByName: user.name
            }).save();
        }
        const user = await User.findById(req.userId);
        await logActivity(req.userId, user.name, 'inventory-created', `Added item: ${name}`);
        res.status(201).json({ message: 'Item added!', item });
    }
    catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.put('/api/inventory/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { name, description, category, unit, reorderLevel, sellingPrice, purchasePrice, supplier, location } = req.body;
        const item = await InventoryItem.findByIdAndUpdate(req.params.id,
            {
                name, description, category, unit, reorderLevel: parseFloat(reorderLevel) || 5,
                purchasePrice: parseFloat(purchasePrice) || 0,
                sellingPrice: parseFloat(sellingPrice) || 0,
                location, supplier
            },
            { returnDocument: 'after' }
        );
        const user = await User.findById(req.userId);
        await logActivity(req.userId, user.name, 'inventory_updated', `Updated item: ${item.name}`);
        res.json({ message: 'Item updated!', item });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/inventory/:id/transaction', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { type, quantity, reason, reference } = req.body;
        if (!type || !quantity) return res.status(400).json({ message: 'Type and quantity required' });

        const item = await InventoryItem.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        const qty = parseFloat(quantity);
        const balanceBefore = item.quantity;
        let balanceAfter;

        if (type === 'stock-in') {
            balanceAfter = balanceBefore + qty;
        } else if (type === 'stock-out') {
            if (qty > balanceBefore) return res.status(400).json({ message: `Insufficient stock. Available: ${balanceBefore}` });
            balanceAfter = balanceBefore - qty;
        } else if (type === 'adjustment') {
            balanceAfter = qty;
        } else {
            return res.status(400).json({ message: 'Invalid transaction type' });
        }

        item.quantity = balanceAfter;
        await item.save();

        const user = await User.findById(req.userId);
        const tx = new InventoryTx({
            itemId: item._id, itemName: item.name, itemCode: item.itemCode,
            type, quantity: qty, balanceBefore, balanceAfter,
            reason: reason || '', reference: reference || '',
            performedBy: req.userId, performedByName: user.name
        });
        await tx.save();

        await logActivity(req.userId, user.name, `inventory_${type}`,
            `${type} of ${qty} ${item.unit} for ${item.name}`);

        res.json({ message: 'Transaction recorded!', item, transaction: tx });
    }
    catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.delete('/api/inventory/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const item = await InventoryItem.findByIdAndUpdate(req.params.id, { isActive: false });
        const user = await User.findById(req.userId);
        await logActivity(req.userId, user.name, 'inventory_deleted', `Deleted item: ${item.name}`);
        res.json({ message: 'Item deleted!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/inventory/alerts/low-stock', authMiddleware, async (req, res) => {
    try {
        const items = await InventoryItem.find({
            isActive: true,
            $expr: { $lte: ['$quantity', '$reorderLevel'] }
        }).sort({ quantity: 1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

function calculateDepreciation(method, openingValue, rate) {
    if (method === 'straight-line') {
        const amount = Math.round((openingValue * rate) / 100 * 100) / 100;
        return { amount, closingValue: Math.max(0, openingValue - amount) };
    } else {
        const amount = Math.round((openingValue * rate) / 100 * 100) / 100;
        return { amount, closingValue: Math.max(0, openingValue - amount) };
    }
}

app.post('/api/depreciation/calculate', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { assetId, method, rate, year } = req.body;
        if (!assetId || !method || !rate || !year)
            return res.status(400).json({ message: 'Asset, method, rate and year are required' });

        const asset = await Asset.findById(assetId);
        if (!asset) return res.status(404).json({ message: 'Asset not found' });

        const existing = await Depreciation.findOne({ assetId, year });
        if (existing) return res.status(409).json({ message: `Depreciation already calculated for ${year}` });

        const openingValue = asset.currentValue || asset.purchasePrice || 0;
        const { amount, closingValue } = calculateDepreciation(method, openingValue, parseFloat(rate));

        const user = await User.findById(req.userId);
        const record = new Depreciation({
            assetId, assetName: asset.name, assetCode: asset.assetId,
            year: parseInt(year), method,
            openingValue, depreciationRate: parseFloat(rate),
            depreciationAmount: amount, closingValue,
            calculatedBy: req.userId, calculatedByName: user.name
        });
        await record.save();

        await Asset.findByIdAndUpdate(assetId, { currentValue: closingValue, updatedAt: new Date() });

        await logActivity(req.userId, user.name, 'depreciation_calculated',
            `${asset.name} — Year ${year}: ₹${amount} depreciated`);

        res.status(201).json(record);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.post('/api/depreciation/bulk', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { method, rate, year } = req.body;
        if (!method || !year)
            return res.status(400).json({ message: 'Method and year are required' });

        const parsedYear = parseInt(year);
        const fallbackRate = (rate !== '' && rate != null) ? parseFloat(rate) : null;
        const user = await User.findById(req.userId);

        const [assets, deviceTypes, existingRecords] = await Promise.all([
            Asset.find(
                { status: { $in: ['active', 'in-repair', 'assigned'] } },
                'name assetId currentValue purchasePrice'
            ).lean(),
            DeviceType.find({}, 'shortCode fullName depreciationRate').lean(),
            Depreciation.find({ year: parsedYear }, 'assetId').lean()
        ]);

        const dtByFull = {};
        const dtByShort = {};
        deviceTypes.forEach(dt => {
            dtByFull[dt.fullName.toLowerCase()] = dt;
            dtByShort[dt.shortCode.toUpperCase()] = dt;
        });

        const alreadyDone = new Set(existingRecords.map(r => r.assetId.toString()));

        const toInsert = [];
        const assetUpdates = [];
        let skipped = 0;

        for (const asset of assets) {
            if (alreadyDone.has(asset._id.toString())) { skipped++; continue; }

            const openingValue = asset.currentValue || asset.purchasePrice || 0;
            if (openingValue <= 0) { skipped++; continue; }

            const assetName = (asset.name || '').trim();
            const dtMatch = dtByFull[assetName.toLowerCase()]
                || dtByShort[assetName.toUpperCase()];

            const dtRate = (dtMatch && dtMatch.depreciationRate != null) ? dtMatch.depreciationRate : null;
            const effectiveRate = dtRate !== null ? dtRate : fallbackRate;

            if (effectiveRate == null) { skipped++; continue; }

            const { amount, closingValue } = calculateDepreciation(method, openingValue, effectiveRate);
            toInsert.push({
                assetId: asset._id,
                assetName: asset.name,
                assetCode: asset.assetId,
                year: parsedYear,
                method,
                openingValue,
                depreciationRate: effectiveRate,
                depreciationAmount: amount,
                closingValue,
                calculatedBy: req.userId,
                calculatedByName: user.name
            });

            assetUpdates.push({
                updateOne: {
                    filter: { _id: asset._id },
                    update: { $set: { currentValue: closingValue, updatedAt: new Date() } }
                }
            });
        }

        if (toInsert.length > 0) {
            await Depreciation.insertMany(toInsert, { ordered: false });
            await Asset.bulkWrite(assetUpdates, { ordered: false });
        }

        await logActivity(req.userId, user.name, 'bulk_depreciation',
            `Bulk depreciation Year ${year}: ${toInsert.length} assets processed, ${skipped} skipped`);

        res.json({
            message: `Depreciation calculated for ${toInsert.length} assets. ${skipped} skipped.`,
            count: toInsert.length,
            skipped
        });
    } catch (err) {
        console.error('Bulk depreciation error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.get('/api/depreciation', authMiddleware, async (req, res) => {
    try {
        const { assetId, year } = req.query;
        let query = {};
        if (assetId) query.assetId = assetId;
        if (year) query.year = parseInt(year);

        const records = await Depreciation.find(query)
            .populate('assetId', 'name assetId categoryName')
            .sort({ year: -1, calculatedAt: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/depreciation/summary', authMiddleware, async (req, res) => {
    try {
        const { year } = req.query;
        const match = year ? { year: parseInt(year) } : {};

        const totalDepr = await Depreciation.aggregate([
            { $match: match },
            { $group: { _id: null, total: { $sum: '$depreciationAmount' }, count: { $sum: 1 } } }
        ]);

        const byYear = await Depreciation.aggregate([
            { $group: { _id: '$year', total: { $sum: '$depreciationAmount' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const retentionData = await Depreciation.aggregate([
            { $sort: { year: -1, createdAt: -1 } },
            { $group: { _id: '$assetId', openingValue: { $first: '$openingValue' }, closingValue: { $first: '$closingValue' } } },
            { $group: { _id: null, totalOpening: { $sum: '$openingValue' }, totalClosing: { $sum: '$closingValue' } } }
        ]);

        res.json({
            totalDepreciation: totalDepr[0]?.total || 0,
            totalRecords: totalDepr[0]?.count || 0,
            byYear,
            totalPurchaseValue: retentionData[0]?.totalOpening || 0,
            totalCurrentValue: retentionData[0]?.totalClosing || 0
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/depreciation/truncate', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const result = await Depreciation.deleteMany({});
        res.json({ message: `All ${result.deletedCount} depreciation records deleted.` });
        try {
            const user = await User.findById(req.userId);
            await logActivity(req.userId, user?.name || 'Admin', 'truncate_depreciation',
                `Truncated all depreciation records (${result.deletedCount} deleted)`);
        } catch (logErr) { console.error('Log error:', logErr); }
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/depreciation/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        await Depreciation.findByIdAndDelete(req.params.id);
        res.json({ message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/insurance', authMiddleware, async (req, res) => {
    try {
        const { status } = req.query;
        const query = status ? { status } : {};

        await Insurance.updateMany(
            { expiryDate: { $lt: new Date() }, status: 'active' },
            { status: 'expired' }
        );

        const records = await Insurance.find(query)
            .populate('assetId', 'name assetId location')
            .sort({ expiryDate: 1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/insurance', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { assetId, policyNumber, provider, type, coverageAmount, premium, startDate, expiryDate, notes } = req.body;
        if (!assetId || !policyNumber || !provider || !startDate || !expiryDate)
            return res.status(400).json({ message: 'Asset, policy number, provider and dates are required' });

        const asset = await Asset.findById(assetId);
        if (!asset) return res.status(404).json({ message: 'Asset not found' });

        const user = await User.findById(req.userId);
        const record = new Insurance({
            assetId, assetName: asset.name, assetCode: asset.assetId,
            policyNumber, provider, type: type || 'comprehensive',
            coverageAmount: coverageAmount || 0, premium: premium || 0,
            startDate: new Date(startDate), expiryDate: new Date(expiryDate),
            notes, createdBy: req.userId
        });
        await record.save();

        await logActivity(req.userId, user.name, 'insurance_added',
            `Insurance added for ${asset.name}: Policy ${policyNumber}`);

        res.status(201).json(record);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

app.put('/api/insurance/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const record = await Insurance.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        res.json({ message: 'Insurance updated!', record });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/insurance/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        await Insurance.findByIdAndDelete(req.params.id);
        res.json({ message: 'Insurance deleted!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/insurance/expiring', authMiddleware, async (req, res) => {
    try {
        const next30 = new Date(); next30.setDate(next30.getDate() + 30);
        const records = await Insurance.find({
            status: 'active', expiryDate: { $gte: new Date(), $lte: next30 }
        }).populate('assetId', 'name assetId').sort({ expiryDate: 1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/finance/stats', authMiddleware, async (req, res) => {
    try {
        const assetValues = await Asset.aggregate([
            { $group: { _id: null, purchase: { $sum: '$purchasePrice' }, current: { $sum: '$currentValue' } } }
        ]);
        const totalMaint = await Maintenance.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$cost' } } }
        ]);
        const totalDepr = await Depreciation.aggregate([
            { $group: { _id: null, total: { $sum: '$depreciationAmount' } } }
        ]);
        const totalInsurance = await Insurance.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: null, premium: { $sum: '$premium' }, coverage: { $sum: '$coverageAmount' } } }
        ]);
        const expiringInsurance = await Insurance.countDocuments({
            status: 'active',
            expiryDate: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        });

        res.json({
            purchaseValue: assetValues[0]?.purchase || 0,
            currentValue: assetValues[0]?.current || 0,
            totalDepreciation: totalDepr[0]?.total || 0,
            maintenanceCost: totalMaint[0]?.total || 0,
            insurancePremium: totalInsurance[0]?.premium || 0,
            insuranceCoverage: totalInsurance[0]?.coverage || 0,
            expiringInsurance
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/requests', authMiddleware, async (req, res) => {
    try {
        const query = req.userRole === 'employee' ? { userId: req.userId } : {};
        const requests = await AssetRequest.find(query).sort({ createdAt: -1 });
        res.json(requests);
    }
    catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/requests', authMiddleware, async (req, res) => {
    try {
        const { itemRequested, reason } = req.body;
        const user = await User.findById(req.userId);
        const newReq = new AssetRequest({ userId: req.userId, userName: user.name, itemRequested, reason });
        await newReq.save();
        res.status(201).json({ message: 'Request submitted successfully!', request: newReq });
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.put('/api/requests/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { status, managerNotes, linkedAssetId } = req.body;
        const request = await AssetRequest.findByIdAndUpdate(
            req.params.id,
            { status, managerNotes, linkedAssetId: linkedAssetId || null },
            { new: true }
        );

        if (status === 'approved' && linkedAssetId) {
            const emp = await User.findById(request.userId).select('name');
            await Asset.findByIdAndUpdate(linkedAssetId, {
                assignedTo: request.userId,
                assignedToName: emp?.name || request.userName,
                status: 'assigned',
                assignedDate: new Date(),
                updatedAt: new Date()
            });
        }

        const emp = await User.findById(request.userId);
        if (emp) sendNotification(emp.email,
            `Asset Request ${status.toUpperCase()}`,
            `Your request for ${request.itemRequested} was ${status}. Notes: ${managerNotes}`
        );
        res.json({ message: `Request ${status}!`, request });
    }
    catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/audits', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const audits = await Audit.find().sort({ createdAt: -1 });
        res.json(audits);
    }
    catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/audits', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const audit = new Audit({ title: req.body.title, createdBy: req.userId });
        await audit.save();

        const assets = await Asset.find({ status: { $ne: 'disposed' } });
        const auditItems = assets.map(a => ({
            auditId: audit._id, assetId: a._id, assetName: a.name, assetCode: a.assetId
        }));
        await AuditItem.insertMany(auditItems);
        res.status(201).json({ message: 'Audit started!', audit });
    }
    catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/audits/:id/items', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const items = await AuditItem.find({ auditId: req.params.id });
        res.json(items);
    }
    catch (err) { res.status(500).json({ message: 'server error' }); }
});

app.put('/api/audits/items/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { status, notes } = req.body;
        const item = await AuditItem.findByIdAndUpdate(req.params.id, { status, notes, auditedAt: new Date() }, { new: true });
        res.json(item);
    }
    catch (err) { res.status(500).json({ message: 'Server error' }); }
});

if (!isTesting) {
    cron.schedule('0 8 * * *', async () => {
        console.log('Running daily notification checks...');
        const today = new Date();
        const next7Days = new Date(); next7Days.setDate(today.getDate() + 7);

        const dueMaint = await Maintenance.find({ status: 'pending', scheduledDate: { $gte: today, $lte: next7Days } });
        const admins = await User.find({ role: 'admin' });
        const adminEmails = admins.map(a => a.email).join(',');

        if (dueMaint.length > 0 && adminEmails) {
            sendNotification(adminEmails, 'AssetMS: Upcoming Maintenance', `You have ${dueMaint.length} maintenance task due in the next 7 days.`);
        }
    });
}

app.get('/api/equipment-master', authMiddleware, async (req, res) => {
    try {
        const equipment = await EquipmentMaster.find().sort({ manufacturer: 1, productCode: 1 });
        res.json(equipment);
    } catch (err) {
        res.status(500).json({ message: 'Server error fetching equipment master' });
    }
});

app.post('/api/equipment-master', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const eq = new EquipmentMaster(req.body);
        await eq.save();
        res.status(201).json({ message: 'Equipment added to master catalog', equipment: eq });
    } catch (err) {
        res.status(500).json({ message: 'Failed to save equipment' });
    }
});

app.put('/api/equipment-master/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const eq = await EquipmentMaster.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Equipment updated successfully', equipment: eq });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update equipment' });
    }
});

app.delete('/api/equipment-master/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        await EquipmentMaster.findByIdAndDelete(req.params.id);
        res.json({ message: 'Equipment removed from master catalog' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete equipment' });
    }
});

app.get('/api/device-types', authMiddleware, async (req, res) => {
    try {
        const types = await DeviceType.find().sort({ shortCode: 1 });
        res.json(types);
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/device-types', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { shortCode, fullName, depreciationRate } = req.body;
        if (!shortCode || !fullName)
            return res.status(400).json({ message: 'Short code and full name are required' });
        const exists = await DeviceType.findOne({ shortCode: shortCode.toUpperCase() });
        if (exists) return res.status(409).json({ message: `Short code "${shortCode.toUpperCase()}" already exists` });
        const dt = new DeviceType({
            shortCode: shortCode.toUpperCase(), fullName,
            depreciationRate: depreciationRate != null ? parseFloat(depreciationRate) : null
        })
        await dt.save();
        res.status(201).json({ message: 'Device type added', deviceType: dt });
    } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
});

app.put('/api/device-types/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { shortCode, fullName, depreciationRate } = req.body;
        const updateBody = { shortCode: shortCode?.toUpperCase(), fullName };
        if (depreciationRate != null) updateBody.depreciationRate = parseFloat(depreciationRate);
        else updateBody.depreciationRate = null;
        const dt = await DeviceType.findByIdAndUpdate(req.params.id, updateBody, { new: true });
        res.json({ message: 'Device type updated', deviceType: dt });
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/device-types/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        await DeviceType.findByIdAndDelete(req.params.id);
        res.json({ message: 'Device type deleted' });
    } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/admin/renumber-asset-ids', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const [allDeviceTypes, allEquipment, allAssets] = await Promise.all([
            DeviceType.find({}, 'shortCode fullName'),
            EquipmentMaster.find({}, 'manufacturer productCode'),
            Asset.find({}, 'assetId name vendorName createdAt').sort({ createdAt: 1 })
        ]);

        const dtByShort = {};
        const dtByFull = {};
        for (const dt of allDeviceTypes) {
            dtByShort[dt.shortCode.toUpperCase()] = dt.shortCode.toUpperCase();
            dtByFull[dt.fullName.toLowerCase()] = dt.shortCode.toUpperCase();
        }

        const mfrMap = {};
        for (const eq of allEquipment) {
            mfrMap[eq.manufacturer.toLowerCase()] = eq.productCode.toUpperCase();
            mfrMap[eq.productCode.toLowerCase()] = eq.productCode.toUpperCase();
        }

        const prefixGroups = {};
        for (const asset of allAssets) {
            const nameUpper = (asset.name || '').toUpperCase();
            const catCode = dtByShort[nameUpper]
                || dtByFull[(asset.name || '').toLowerCase()]
                || (asset.name || '').substring(0, 3).toUpperCase();

            const vendor = (asset.vendorName || '').trim();
            const prodCode = vendor
                ? (mfrMap[vendor.toLowerCase()] || vendor.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase())
                : 'GEN';

            const cat = catCode.replace(/[^A-Z0-9]/g, '');
            const prod = prodCode.replace(/[^A-Z0-9]/g, '');
            const prefix = `${cat}-${prod}-`;

            if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
            prefixGroups[prefix].push(asset);
        }

        const bulkOps = [];
        for (const [prefix, assets] of Object.entries(prefixGroups)) {
            assets.forEach((asset, idx) => {
                const newId = `${prefix}${String(idx + 1).padStart(4, '0')}`;
                if (asset.assetId !== newId) {
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: asset._id },
                            update: { $set: { assetId: newId } }
                        }
                    });
                }
            });
        }

        if (bulkOps.length > 0) await Asset.bulkWrite(bulkOps);

        res.json({
            message: `Re-numbering complete. ${bulkOps.length} asset IDs updated.`,
            updated: bulkOps.length
        });
    } catch (err) {
        console.error('Renumber error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
if (!isTesting) {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
module.exports = app;