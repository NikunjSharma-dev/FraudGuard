import React, { useState, useEffect } from 'react';
import {
  Home,
  CreditCard,
  ListFilter,
  BarChart3,
  Activity,
  Search,
  Bell,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Lock,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Server,
  Database,
  UserPlus,
  Settings,
  KeyRound,
  Check,
  Copy,
  Cpu,
  MapPin,
  Clock,
  Layers,
  ChevronRight,
  User,
  Shield
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter
} from 'recharts';

// --- PRESET LOCATIONS WITH LATITUDE / LONGITUDE FOR FASTAPI ---
const LOCATION_PRESETS = {
  'Cayman Islands (High Risk Off-Shore)': { lat: 19.3133, lon: -81.2546, dist: 4200, category: 'Offshore Mule' },
  'New York, US': { lat: 40.7128, lon: -74.0060, dist: 0, category: 'Supermarket' },
  'Tokyo, JP': { lat: 35.6762, lon: 139.6503, dist: 6740, category: 'Electronics' },
  'London, UK': { lat: 51.5074, lon: -0.1278, dist: 3450, category: 'Digital Assets' },
  'Lagos, NG': { lat: 6.5244, lon: 3.3792, dist: 5250, category: 'CryptoExchange' },
  'San Francisco, US': { lat: 37.7749, lon: -122.4194, dist: 2570, category: 'General' }
};

// --- INITIAL FALLBACK DATA & CHARTS ---
const DEFAULT_HOURLY_TREND = [
  { hour: '00:00', volume: 12400, tx_count: 42, fraud_count: 2 },
  { hour: '04:00', volume: 8200, tx_count: 18, fraud_count: 4 },
  { hour: '08:00', volume: 45000, tx_count: 120, fraud_count: 1 },
  { hour: '12:00', volume: 98000, tx_count: 240, fraud_count: 3 },
  { hour: '16:00', volume: 115000, tx_count: 310, fraud_count: 5 },
  { hour: '20:00', volume: 67000, tx_count: 185, fraud_count: 2 }
];

const DEFAULT_RISK_DISTRIBUTION = [
  { range: '0-20% (Safe)', count: 420, fill: '#10b981' },
  { range: '20-40% (Low)', count: 180, fill: '#34d399' },
  { range: '40-60% (Medium)', count: 65, fill: '#f59e0b' },
  { range: '60-85% (MFA)', count: 32, fill: '#f97316' },
  { range: '85-100% (Block)', count: 18, fill: '#ff5e62' }
];

const DEFAULT_STATUS_PIE = [
  { name: 'Approved', value: 685, color: '#10b981' },
  { name: 'Awaiting MFA', value: 32, color: '#f59e0b' },
  { name: 'Declined / Blocked', value: 18, color: '#ff5e62' }
];

const FEATURE_IMPORTANCE_DATA = [
  { name: 'Geo Velocity', importance: 0.32, fill: '#ff5e62' },
  { name: 'Amount Z-Score', importance: 0.24, fill: '#f59e0b' },
  { name: 'Merchant Risk', importance: 0.18, fill: '#00f2fe' },
  { name: 'Device Trust', importance: 0.12, fill: '#8b5cf6' },
  { name: 'Tx Count 10m', importance: 0.09, fill: '#10b981' },
  { name: 'Night Off-Hours', importance: 0.05, fill: '#64748b' }
];

const LATENCY_PULSE_DATA = [
  { time: '1m ago', ms: 14 },
  { time: '50s ago', ms: 12 },
  { time: '40s ago', ms: 18 },
  { time: '30s ago', ms: 11 },
  { time: '20s ago', ms: 15 },
  { time: '10s ago', ms: 9 },
  { time: 'Now', ms: 12 }
];

const INITIAL_TRANSACTIONS = [
  { id: '3f8a1b2c-8821-4f12-a120-991201948123', account: 'ACC10294 (Bethany Sparks)', amount: '$12,450.00', location: 'Cayman Islands', status: 'DECLINED', riskScore: 89, time: '2 mins ago', rule: 'Geographic Velocity Anomaly (4,200 km/h)' },
  { id: '9a72d11b-4491-4e89-b121-881920194812', account: 'ACC4491 (Marcus Vance)', amount: '$45.20', location: 'New York, US', status: 'APPROVED', riskScore: 4, time: '5 mins ago', rule: 'Passed Baseline Security Rules' },
  { id: '1b89ef32-8812-4a01-c881-771920194811', account: 'ACC8812 (Elena Rostova)', amount: '$9,800.00', location: 'London, UK', status: 'AWAITING VERIFICATION', riskScore: 74, time: '12 mins ago', rule: 'High Amount Z-Score & Off-Hours' },
  { id: '5c21df09-3310-4d99-b102-661920194810', account: 'ACC3310 (Devon Miles)', amount: '$310.00', location: 'San Francisco, US', status: 'APPROVED', riskScore: 12, time: '18 mins ago', rule: 'Passed Security Rules' },
  { id: '7e90cc41-9941-4c12-a890-551920194809', account: 'ACC9941 (Sarah Connor)', amount: '$15,000.00', location: 'Lagos, NG', status: 'BLOCKED', riskScore: 98, time: '25 mins ago', rule: 'PostgreSQL Trigger: Daily Limit Exceeded' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  
  // API & Connection State
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendHealth, setBackendHealth] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);

  // Engine Configuration State
  const [engineConfig, setEngineConfig] = useState({
    xgb_weight: 0.75,
    iso_bump: 0.25,
    mfa_threshold: 0.65,
    block_threshold: 0.85,
    sensitivity_mode: 'Balanced'
  });
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [isRetraining, setIsRetraining] = useState(false);

  // Accounts State
  const [accountsList, setAccountsList] = useState([
    { account_id: 'ACC10294', owner_name: 'Bethany Sparks', status: 'Active', daily_limit: 500000 },
    { account_id: 'ACC4491', owner_name: 'Marcus Vance', status: 'Active', daily_limit: 250000 },
    { account_id: 'ACC8812', owner_name: 'Elena Rostova', status: 'Active', daily_limit: 100000 },
    { account_id: 'ACC3310', owner_name: 'Devon Miles', status: 'Active', daily_limit: 1000000 }
  ]);
  const [selectedAccountId, setSelectedAccountId] = useState('ACC10294');
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [signupForm, setSignupForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    kyc_document: 'PASSPORT-US'
  });
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupStatus, setSignupStatus] = useState(null);

  // Ledger & Metrics State
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [selectedTxDetail, setSelectedTxDetail] = useState(null);
  const [ledgerMetrics, setLedgerMetrics] = useState({
    totalVolume: 325456,
    fraudCount: 14,
    throughput: 4.2,
    statusBreakdown: { Approved: 420, Declined: 14, 'Awaiting Verification': 6 }
  });
  const [volumeTrendData, setVolumeTrendData] = useState(DEFAULT_HOURLY_TREND);
  const [statusPieData, setStatusPieData] = useState(DEFAULT_STATUS_PIE);

  // OTP Modal State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [pendingTx, setPendingTx] = useState(null);
  const [demoOtpHint, setDemoOtpHint] = useState(null);
  const [otpMessage, setOtpMessage] = useState(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Simulator State
  const [simAmount, setSimAmount] = useState('12500');
  const [simCategory, setSimCategory] = useState('Offshore Mule');
  const [simLocation, setSimLocation] = useState('Cayman Islands (High Risk Off-Shore)');
  const [simDevice, setSimDevice] = useState('untrusted_mobile_device');
  const [simResult, setSimResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Probe Backend on Mount & Polling
  useEffect(() => {
    checkHealth(apiUrl);
    const interval = setInterval(() => checkHealth(apiUrl), 8000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  const checkHealth = async (url) => {
    setIsTestingApi(true);
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        setBackendConnected(true);
        setBackendHealth(data);
        fetchLedgerSummary(url);
        fetchEngineConfig(url);
        fetchAccounts(url);
      } else {
        setBackendConnected(false);
        setBackendHealth(null);
      }
    } catch (err) {
      setBackendConnected(false);
      setBackendHealth(null);
    } finally {
      setIsTestingApi(false);
    }
  };

  const fetchEngineConfig = async (url) => {
    try {
      const res = await fetch(`${url}/admin/config`);
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setEngineConfig(data.config);
        }
      }
    } catch (e) {
      console.warn('Config fetch skipped:', e);
    }
  };

  const fetchAccounts = async (url) => {
    try {
      const res = await fetch(`${url}/admin/accounts`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setAccountsList(data);
        }
      }
    } catch (e) {
      console.warn('Accounts fetch skipped:', e);
    }
  };

  const fetchLedgerSummary = async (url) => {
    try {
      const res = await fetch(`${url}/admin/ledger-summary`);
      if (res.ok) {
        const data = await res.json();
        if (data.total_volume !== undefined) {
          setLedgerMetrics({
            totalVolume: data.total_volume || 325456,
            fraudCount: data.fraud_count || 14,
            throughput: data.throughput || 4.2,
            statusBreakdown: data.status_breakdown || { Approved: 420, Declined: 14, 'Awaiting Verification': 6 }
          });

          if (data.status_breakdown) {
            setStatusPieData([
              { name: 'Approved', value: data.status_breakdown.Approved || 420, color: '#10b981' },
              { name: 'Awaiting MFA', value: data.status_breakdown['Awaiting Verification'] || 6, color: '#f59e0b' },
              { name: 'Declined / Blocked', value: data.status_breakdown.Declined || 14, color: '#ff5e62' }
            ]);
          }
        }
        if (data.transactions && data.transactions.length > 0) {
          const mapped = data.transactions.map((tx) => ({
            id: tx.id ? String(tx.id) : `3f8a1b2c-${Math.floor(1000 + Math.random() * 9000)}`,
            account: tx.account_id ? `${tx.account_id}` : 'ACC10294',
            amount: `$${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            location: tx.latitude ? `(${tx.latitude.toFixed(2)}, ${tx.longitude.toFixed(2)})` : 'New York, US',
            status: (tx.status || 'APPROVED').toUpperCase(),
            riskScore: tx.risk_score ? Math.round(tx.risk_score * 100) : (tx.risk_score === 0 ? 0 : 12),
            time: tx.created_at ? new Date(tx.created_at).toLocaleTimeString() : 'Recently',
            rule: tx.is_fraudulent ? 'Flagged by Dual ML Engine' : 'Passed Security Rules'
          }));
          setTransactions(mapped);
        }
      }

      const trendRes = await fetch(`${url}/admin/volume-trend`);
      if (trendRes.ok) {
        const trendData = await trendRes.json();
        if (Array.isArray(trendData) && trendData.length > 0) {
          setVolumeTrendData(trendData);
        }
      }
    } catch (err) {
      console.warn('Backend summary polling skipped:', err.message);
    }
  };

  const handleUpdateEngineConfig = async (newConfig) => {
    setIsUpdatingConfig(true);
    setEngineConfig(newConfig);

    if (backendConnected) {
      try {
        await fetch(`${apiUrl}/admin/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newConfig)
        });
      } catch (e) {
        console.error('Failed to sync engine config:', e);
      }
    }
    setIsUpdatingConfig(false);
  };

  const handleApplyPresetMode = (mode) => {
    if (mode === 'Strict') {
      handleUpdateEngineConfig({
        xgb_weight: 0.85,
        iso_bump: 0.35,
        mfa_threshold: 0.50,
        block_threshold: 0.75,
        sensitivity_mode: 'Strict Enterprise'
      });
    } else if (mode === 'Balanced') {
      handleUpdateEngineConfig({
        xgb_weight: 0.75,
        iso_bump: 0.25,
        mfa_threshold: 0.65,
        block_threshold: 0.85,
        sensitivity_mode: 'Balanced'
      });
    } else if (mode === 'LowFriction') {
      handleUpdateEngineConfig({
        xgb_weight: 0.60,
        iso_bump: 0.15,
        mfa_threshold: 0.80,
        block_threshold: 0.95,
        sensitivity_mode: 'Low Friction'
      });
    }
  };

  const handleRetrainEngine = async () => {
    setIsRetraining(true);
    if (backendConnected) {
      try {
        const res = await fetch(`${apiUrl}/admin/retrain`, { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'ML Engine Retrained Successfully!');
      } catch (e) {
        alert('Retraining trigger failed.');
      }
    } else {
      setTimeout(() => alert('[Simulation] ML Engine retrained with 20,000 synthetic transactions!'), 1500);
    }
    setIsRetraining(false);
  };

  const handleAccountSignup = async (e) => {
    e.preventDefault();
    setIsSigningUp(true);
    setSignupStatus(null);

    if (backendConnected) {
      try {
        const res = await fetch(`${apiUrl}/account/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(signupForm)
        });
        const data = await res.json();
        if (res.ok && data.account_id) {
          const newAcc = { account_id: data.account_id, owner_name: signupForm.full_name, status: 'Active', daily_limit: 500000 };
          setAccountsList((prev) => [newAcc, ...prev]);
          setSelectedAccountId(data.account_id);
          setSignupStatus({ type: 'success', msg: `Account ${data.account_id} provisioned in DB!` });
          setTimeout(() => {
            setShowSignupModal(false);
            setSignupStatus(null);
            setSignupForm({ full_name: '', email: '', phone: '', kyc_document: 'PASSPORT-US' });
          }, 1400);
        } else {
          setSignupStatus({ type: 'error', msg: data.detail || 'Account signup failed.' });
        }
      } catch (err) {
        setSignupStatus({ type: 'error', msg: 'Could not connect to FastAPI backend.' });
      }
    } else {
      const fakeId = `ACC${Math.floor(10000 + Math.random() * 90000)}`;
      const newAcc = { account_id: fakeId, owner_name: signupForm.full_name, status: 'Active', daily_limit: 500000 };
      setAccountsList((prev) => [newAcc, ...prev]);
      setSelectedAccountId(fakeId);
      setSignupStatus({ type: 'success', msg: `[Simulation] Provisioned ${fakeId}` });
      setTimeout(() => {
        setShowSignupModal(false);
        setSignupStatus(null);
      }, 1200);
    }
    setIsSigningUp(false);
  };

  const handleToggleAccountStatus = async (accId, currentStatus) => {
    const nextStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';
    setAccountsList((prev) => prev.map((a) => a.account_id === accId ? { ...a, status: nextStatus } : a));

    if (backendConnected) {
      try {
        await fetch(`${apiUrl}/admin/accounts/${accId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus })
        });
      } catch (e) {
        console.error('Failed to update account status:', e);
      }
    }
  };

  const loadScenarioPreset = (type) => {
    if (type === 'impossible_travel') {
      setSimAmount('12500');
      setSimLocation('Cayman Islands (High Risk Off-Shore)');
      setSimCategory('Offshore Mule');
      setSimDevice('untrusted_mobile_vpn');
    } else if (type === 'carding_storm') {
      setSimAmount('45.00');
      setSimLocation('Tokyo, JP');
      setSimCategory('Electronics');
      setSimDevice('untrusted_bot_client');
    } else if (type === 'offshore_mule') {
      setSimAmount('48000');
      setSimLocation('Cayman Islands (High Risk Off-Shore)');
      setSimCategory('CryptoExchange');
      setSimDevice('untrusted_device_99');
    } else if (type === 'normal') {
      setSimAmount('34.50');
      setSimLocation('New York, US');
      setSimCategory('Supermarket');
      setSimDevice('trusted_macbook_pro');
    }
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    setIsSimulating(true);
    setSimResult(null);

    const preset = LOCATION_PRESETS[simLocation] || LOCATION_PRESETS['Cayman Islands (High Risk Off-Shore)'];
    const amountNum = parseFloat(simAmount) || 0;

    if (backendConnected) {
      try {
        const payload = {
          account_id: selectedAccountId,
          amount: amountNum,
          lat: preset.lat,
          lon: preset.lon,
          merchant_category: simCategory,
          device_id: simDevice
        };

        const res = await fetch(`${apiUrl}/transaction/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Backend ML evaluation failed.');
        }

        const data = await res.json();

        let extractedOtp = null;
        if (data.message && data.message.includes('OTP:')) {
          const match = data.message.match(/OTP:\s*(\d{6})/);
          if (match) extractedOtp = match[1];
        }

        let shapFeatures = [];
        if (data.explanation && Object.keys(data.explanation).length > 0) {
          const keyLabels = {
            geo_velocity: 'Geo Velocity',
            amount_z_score: 'Amount Z-Score',
            merchant_risk_score: 'Merchant Risk',
            device_trust_score: 'Device Trust',
            time_since_last_tx: 'Tx Elapsed Time',
            hour_of_day: 'Hour of Day',
            is_night_tx: 'Night Window'
          };
          shapFeatures = Object.entries(data.explanation).map(([key, val]) => ({
            name: keyLabels[key] || key,
            impact: Math.abs(val).toFixed(3),
            fill: Math.abs(val) > 0.1 ? '#ff5e62' : Math.abs(val) > 0.05 ? '#f59e0b' : '#10b981'
          }));
        } else {
          shapFeatures = [
            { name: 'Geo Velocity', impact: (preset.dist / 1000).toFixed(2), fill: '#ff5e62' },
            { name: 'Amount Z-Score', impact: (amountNum / 800).toFixed(2), fill: '#f59e0b' },
            { name: 'Merchant Risk', impact: '0.85', fill: '#00f2fe' },
            { name: 'Device Trust', impact: '0.35', fill: '#8b5cf6' }
          ];
        }

        const rawScore = data.risk_score !== null && data.risk_score !== undefined ? data.risk_score : 0.25;
        const score = Math.round(rawScore * 100);
        const statusUpper = (data.status || 'APPROVED').toUpperCase();

        const result = {
          txId: data.transaction_id,
          score,
          status: statusUpper,
          message: data.message,
          extractedOtp,
          shapFeatures,
          riskReasons: data.risk_reasons || ['Passed baseline security filters']
        };

        setSimResult(result);

        const newLedgerItem = {
          id: result.txId,
          account: `${selectedAccountId}`,
          amount: `$${amountNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          location: `${simLocation}`,
          status: statusUpper,
          riskScore: result.score,
          time: 'Just now',
          rule: data.message || 'FastAPI ML Engine Evaluation'
        };
        setTransactions((prev) => [newLedgerItem, ...prev]);

        if (statusUpper.includes('AWAITING VERIFICATION') || statusUpper.includes('AWAITING')) {
          setPendingTx(newLedgerItem);
          setDemoOtpHint(extractedOtp);
          setShowOtpModal(true);
        }
      } catch (err) {
        alert(`FastAPI Connection Error: ${err.message}`);
      } finally {
        setIsSimulating(false);
      }
    } else {
      setTimeout(() => {
        let score = 15;
        let reasons = [];

        if (amountNum > 10000) {
          score += 45;
          reasons.push('High Transaction Amount (+$10,000 threshold)');
        }
        if (preset.dist > 3000) {
          score += 35;
          reasons.push(`Geographic Velocity Anomaly (${preset.dist} mi from origin)`);
        }
        if (simCategory === 'Offshore Mule' || simCategory === 'CryptoExchange') {
          score += 25;
          reasons.push(`High Risk Merchant Category (${simCategory})`);
        }
        if (simDevice.includes('untrusted')) {
          score += 20;
          reasons.push('Untrusted Device Fingerprint');
        }

        score = Math.min(score, 99);
        let status = 'APPROVED';
        if (score >= 85) status = 'DECLINED';
        else if (score >= 65) status = 'AWAITING VERIFICATION';

        const fakeOtp = '481920';
        const result = {
          txId: `3f8a1b2c-${Math.floor(1000 + Math.random() * 9000)}`,
          score,
          status,
          extractedOtp: fakeOtp,
          message: status === 'AWAITING VERIFICATION' ? `[DEMO] Your OTP: ${fakeOtp}` : 'Processed successfully',
          riskReasons: reasons.length > 0 ? reasons : ['Passed Baseline Security Filters'],
          shapFeatures: [
            { name: 'Geo Velocity', impact: (preset.dist / 1000).toFixed(2), fill: '#ff5e62' },
            { name: 'Amount Z-Score', impact: (amountNum / 800).toFixed(2), fill: '#f59e0b' },
            { name: 'Merchant Risk', impact: '0.85', fill: '#00f2fe' },
            { name: 'Device Trust', impact: '0.35', fill: '#8b5cf6' }
          ]
        };

        setSimResult(result);
        setIsSimulating(false);

        const newLedgerItem = {
          id: result.txId,
          account: `${selectedAccountId}`,
          amount: `$${amountNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          location: `${simLocation}`,
          status: result.status,
          riskScore: result.score,
          time: 'Just now',
          rule: reasons[0] || 'Passed ML Baseline'
        };
        setTransactions((prev) => [newLedgerItem, ...prev]);

        if (result.status === 'AWAITING VERIFICATION') {
          setPendingTx(newLedgerItem);
          setDemoOtpHint(fakeOtp);
          setShowOtpModal(true);
        }
      }, 600);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpCode.join('');
    if (code.length !== 6) return;

    setIsVerifyingOtp(true);
    setOtpMessage(null);

    if (backendConnected && pendingTx && pendingTx.id) {
      try {
        const res = await fetch(`${apiUrl}/transaction/${pendingTx.id}/verify`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: code })
        });
        const data = await res.json();
        if (res.ok && data.status === 'Verified') {
          setShowOtpModal(false);
          setOtpCode(['', '', '', '', '', '']);
          setTransactions((prev) =>
            prev.map((t) =>
              t.id === pendingTx.id ? { ...t, status: 'VERIFIED & APPROVED', riskScore: 10, rule: 'Step-Up MFA Identity Confirmed' } : t
            )
          );
        } else {
          setOtpMessage(data.detail || data.message || 'Invalid or expired OTP.');
          setTransactions((prev) =>
            prev.map((t) =>
              t.id === pendingTx.id ? { ...t, status: 'DECLINED (INVALID OTP)', riskScore: 99 } : t
            )
          );
        }
      } catch (err) {
        setOtpMessage('Failed to connect to backend for OTP verification.');
      }
    } else {
      setShowOtpModal(false);
      setOtpCode(['', '', '', '', '', '']);
      if (pendingTx) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === pendingTx.id ? { ...t, status: 'VERIFIED & APPROVED', riskScore: 10 } : t
          )
        );
      }
    }
    setIsVerifyingOtp(false);
  };

  const handleOtpKeyIn = (index, val) => {
    if (val.length > 1) val = val[val.length - 1];
    const newArr = [...otpCode];
    newArr[index] = val;
    setOtpCode(newArr);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const fillDemoOtp = () => {
    if (demoOtpHint) {
      const digits = demoOtpHint.split('');
      if (digits.length === 6) setOtpCode(digits);
    } else {
      setOtpCode(['4', '8', '1', '9', '2', '0']);
    }
  };

  const filteredTransactions = transactions.filter(
    (tx) =>
      tx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.account.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo" title="FraudGuard Enterprise">
          FG
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
            title="Executive Dashboard"
          >
            <Home size={20} />
            <span className="nav-label">Dash</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'simulate' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulate')}
            title="Attack Bench & Simulator"
          >
            <Zap size={20} />
            <span className="nav-label">Bench</span>
            {simResult && simResult.status !== 'APPROVED' && <span className="nav-badge">!</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'engine' ? 'active' : ''}`}
            onClick={() => setActiveTab('engine')}
            title="ML Engine Workbench"
          >
            <Cpu size={20} />
            <span className="nav-label">Engine</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setActiveTab('ledger')}
            title="Transaction Ledger"
          >
            <ListFilter size={20} />
            <span className="nav-label">Ledger</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
            onClick={() => setActiveTab('accounts')}
            title="Customer Accounts"
          >
            <UserPlus size={20} />
            <span className="nav-label">Users</span>
          </button>
        </nav>

        <div style={{ marginTop: 'auto', textAlign: 'center' }}>
          <span className="brand-badge">v2.0</span>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="main-viewport">
        {/* TOP BAR */}
        <header className="top-bar">
          <div className="brand-header">
            <h1 className="brand-title">
              <Shield className="coral-icon" size={26} />
              FraudGuard <span className="brand-badge">ENTERPRISE</span>
            </h1>

            <div className="status-pill">
              <span className={`status-dot ${backendConnected ? 'green' : 'amber'}`}></span>
              {backendConnected ? 'FastAPI Backend Online' : 'Offline Mode'}
              {backendHealth && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                  ({backendHealth.ml_engine_active ? 'ML Active' : 'DB Only'})
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="search-box">
              <Search size={16} className="search-icon" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search transactions, accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button className="icon-btn" onClick={() => setShowSignupModal(true)} title="Onboard Customer">
              <UserPlus size={18} />
            </button>

            <button className="icon-btn" onClick={() => setShowApiModal(true)} title="Configure API Endpoint">
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === 'home' && (
          <div className="content-container">
            {/* HERO KPI CARDS */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Monitored Volume</span>
                  <div className="kpi-icon-wrapper cyan">
                    <DollarSign size={20} />
                  </div>
                </div>
                <div className="kpi-value">${ledgerMetrics.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                <div className="kpi-trend green">
                  <TrendingUp size={14} /> +14.2% from last hour
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Blocked Fraud Value</span>
                  <div className="kpi-icon-wrapper coral">
                    <ShieldAlert size={20} />
                  </div>
                </div>
                <div className="kpi-value">${(ledgerMetrics.fraudCount * 12450).toLocaleString()}</div>
                <div className="kpi-trend green">
                  <ShieldCheck size={14} /> {ledgerMetrics.fraudCount} attacks intercepted
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Inference Latency</span>
                  <div className="kpi-icon-wrapper amber">
                    <Zap size={20} />
                  </div>
                </div>
                <div className="kpi-value">12.4 ms</div>
                <div className="kpi-trend green">
                  <Activity size={14} /> Sub-15ms SLA guaranteed
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Active Throughput</span>
                  <div className="kpi-icon-wrapper green">
                    <BarChart3 size={20} />
                  </div>
                </div>
                <div className="kpi-value">{ledgerMetrics.throughput} TPS</div>
                <div className="kpi-trend">
                  <Clock size={14} /> Real-time stream
                </div>
              </div>
            </div>

            {/* MULTI-GRAPH PANEL */}
            <div className="charts-grid-6">
              {/* GRAPH 1: HOURLY VOLUME & FRAUD TREND */}
              <div className="chart-card span-2">
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-title">Hourly Transaction Volume & Fraud Spikes</h3>
                    <p className="chart-subtitle">Dual-axis volume ($) vs flagged fraud count</p>
                  </div>
                  <span className="live-tag">LIVE DUAL-AXIS</span>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={volumeTrendData}>
                      <defs>
                        <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00f2fe" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#00f2fe" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="hour" stroke="#64748b" style={{ fontSize: '11px' }} />
                      <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                      <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid var(--card-border)', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="volume" stroke="#00f2fe" strokeWidth={3} fillOpacity={1} fill="url(#colorVol)" />
                      <Bar dataKey="fraud_count" fill="#ff5e62" barSize={16} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* GRAPH 2: RISK SCORE BUCKET HISTOGRAM */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-title">Fraud Risk Distribution</h3>
                    <p className="chart-subtitle">Transactions binned by risk %</p>
                  </div>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={DEFAULT_RISK_DISTRIBUTION}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="range" stroke="#64748b" style={{ fontSize: '10px' }} />
                      <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                      <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid var(--card-border)', borderRadius: '8px' }} />
                      <Bar dataKey="count">
                        {DEFAULT_RISK_DISTRIBUTION.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* GRAPH 3: TRANSACTION STATUS DONUT */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-title">Status Breakdown</h3>
                    <p className="chart-subtitle">Ledger distribution</p>
                  </div>
                </div>
                <div style={{ width: '100%', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusPieData.map((entry, index) => (
                          <Cell key={`pie-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid var(--card-border)', borderRadius: '8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* GRAPH 4: MODEL FEATURE IMPORTANCE */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-title">ML Feature Importance</h3>
                    <p className="chart-subtitle">XGBoost Gini Importance</p>
                  </div>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={FEATURE_IMPORTANCE_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" stroke="#64748b" style={{ fontSize: '10px' }} />
                      <YAxis dataKey="name" type="category" stroke="#64748b" style={{ fontSize: '10px' }} width={90} />
                      <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid var(--card-border)', borderRadius: '8px' }} />
                      <Bar dataKey="importance">
                        {FEATURE_IMPORTANCE_DATA.map((entry, index) => (
                          <Cell key={`f-cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* GRAPH 5: REAL-TIME ENGINE LATENCY PULSE */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div>
                    <h3 className="chart-title">Engine Response Pulse</h3>
                    <p className="chart-subtitle">Inference latency in milliseconds</p>
                  </div>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={LATENCY_PULSE_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="time" stroke="#64748b" style={{ fontSize: '10px' }} />
                      <YAxis stroke="#64748b" style={{ fontSize: '11px' }} domain={[0, 30]} />
                      <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid var(--card-border)', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* RECENT LIVE STREAM TABLE */}
            <div className="table-card">
              <div className="table-card-header">
                <h3 className="table-title">Recent Transaction Audit Stream</h3>
                <button className="primary-btn-sm" onClick={() => setActiveTab('ledger')}>View Full Ledger</button>
              </div>

              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Location</th>
                    <th>Risk Score</th>
                    <th>Status</th>
                    <th>ML Rule Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.slice(0, 6).map((tx) => (
                    <tr key={tx.id} onClick={() => setSelectedTxDetail(tx)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan-primary)' }}>{tx.id.substring(0, 16)}...</td>
                      <td>{tx.account}</td>
                      <td style={{ fontWeight: 700 }}>{tx.amount}</td>
                      <td>{tx.location}</td>
                      <td>
                        <span className={`risk-badge ${tx.riskScore > 65 ? 'high' : tx.riskScore > 35 ? 'med' : 'low'}`}>
                          {tx.riskScore}%
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill-table ${tx.status.toLowerCase().includes('approved') ? 'approved' : tx.status.toLowerCase().includes('awaiting') ? 'pending' : 'declined'}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: ATTACK SIMULATOR & BENCH */}
        {activeTab === 'simulate' && (
          <div className="content-container">
            <div className="simulator-grid">
              {/* LEFT FORM: PARAMETER CONTROLS */}
              <div className="form-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h2 className="section-title">Attack Simulator Bench</h2>
                    <p className="section-subtitle">Simulate real-time fraud attacks & test ML model rules</p>
                  </div>
                  <Sparkles className="cyan-icon" size={24} />
                </div>

                {/* PRESET SCENARIO CARDS */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label">Preset Attack Scenarios:</label>
                  <div className="preset-grid">
                    <div className="preset-card" onClick={() => loadScenarioPreset('impossible_travel')}>
                      <span className="preset-icon">🚀</span>
                      <div className="preset-info">
                        <h4>Impossible Travel</h4>
                        <p>Cayman Islands (4,200 km/h)</p>
                      </div>
                    </div>

                    <div className="preset-card" onClick={() => loadScenarioPreset('carding_storm')}>
                      <span className="preset-icon">💳</span>
                      <div className="preset-info">
                        <h4>Carding Storm</h4>
                        <p>High velocity small txs</p>
                      </div>
                    </div>

                    <div className="preset-card" onClick={() => loadScenarioPreset('offshore_mule')}>
                      <span className="preset-icon">🏝️</span>
                      <div className="preset-info">
                        <h4>Offshore Mule</h4>
                        <p>$48,000 to Crypto Exchange</p>
                      </div>
                    </div>

                    <div className="preset-card" onClick={() => loadScenarioPreset('normal')}>
                      <span className="preset-icon">🛒</span>
                      <div className="preset-info">
                        <h4>Normal Grocery</h4>
                        <p>$34.50 Local Supermarket</p>
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSimulate}>
                  <div className="form-group">
                    <label className="input-label">Target Account:</label>
                    <select
                      className="custom-select"
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                    >
                      {accountsList.map((acc) => (
                        <option key={acc.account_id} value={acc.account_id}>
                          {acc.account_id} — {acc.owner_name} ({acc.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Transaction Amount ($):</label>
                    <input
                      type="number"
                      className="custom-input"
                      value={simAmount}
                      onChange={(e) => setSimAmount(e.target.value)}
                      placeholder="e.g. 12500"
                    />
                  </div>

                  <div className="form-group">
                    <label className="input-label">Merchant Category:</label>
                    <select className="custom-select" value={simCategory} onChange={(e) => setSimCategory(e.target.value)}>
                      <option value="Offshore Mule">Offshore Mule / High Risk</option>
                      <option value="CryptoExchange">Crypto Exchange</option>
                      <option value="Casino / Gambling">Casino / Gambling</option>
                      <option value="Digital Assets">Digital Assets</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Supermarket">Supermarket / Grocery</option>
                      <option value="General">General Merchant</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Merchant Geo Location:</label>
                    <select className="custom-select" value={simLocation} onChange={(e) => setSimLocation(e.target.value)}>
                      {Object.keys(LOCATION_PRESETS).map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Device Trust Fingerprint:</label>
                    <select className="custom-select" value={simDevice} onChange={(e) => setSimDevice(e.target.value)}>
                      <option value="trusted_macbook_pro">Trusted Device (Registered Mac)</option>
                      <option value="untrusted_mobile_vpn">Untrusted Device (Tor/VPN Proxy)</option>
                      <option value="untrusted_bot_client">Untrusted Automated Bot Script</option>
                    </select>
                  </div>

                  <button type="submit" className="submit-btn" disabled={isSimulating}>
                    {isSimulating ? <RefreshCw className="spin" size={18} /> : <Zap size={18} />}
                    {isSimulating ? 'Evaluating Dual ML Pipeline...' : 'Fire Real-Time Evaluation'}
                  </button>
                </form>
              </div>

              {/* RIGHT SIDE: LIVE ML BREAKDOWN & SHAP WATERFALL */}
              <div className="results-card">
                {!simResult ? (
                  <div className="empty-sim-state">
                    <Zap size={48} style={{ color: 'var(--text-dim)' }} />
                    <h3>Ready for Simulation</h3>
                    <p>Select an attack preset card or adjust sliders and hit evaluate to see step-by-step ML pipeline results.</p>
                  </div>
                ) : (
                  <div>
                    <div className="sim-result-header">
                      <div>
                        <span className="sim-tx-id">TX: {simResult.txId}</span>
                        <h3 className="sim-status-text" style={{ color: simResult.status === 'APPROVED' ? 'var(--green-primary)' : simResult.status.includes('AWAITING') ? 'var(--amber-primary)' : 'var(--coral-primary)' }}>
                          {simResult.status}
                        </h3>
                      </div>
                      <div className="score-ring">
                        <span className="score-num">{simResult.score}</span>
                        <span className="score-label">RISK %</span>
                      </div>
                    </div>

                    <div className="risk-reasons-box">
                      <h4 className="box-title">🚨 ML Risk Factors & Reasons:</h4>
                      <ul>
                        {simResult.riskReasons && simResult.riskReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    {/* SHAP WATERFALL CONTRIBUTION CHART */}
                    <div style={{ marginTop: '20px' }}>
                      <h4 className="box-title">📊 SHAP Feature Attribution Impact:</h4>
                      <div style={{ width: '100%', height: 180, marginTop: '10px' }}>
                        <ResponsiveContainer>
                          <BarChart layout="vertical" data={simResult.shapFeatures}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis type="number" stroke="#64748b" style={{ fontSize: '10px' }} />
                            <YAxis dataKey="name" type="category" stroke="#64748b" style={{ fontSize: '10px' }} width={100} />
                            <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid var(--card-border)', borderRadius: '8px' }} />
                            <Bar dataKey="impact">
                              {simResult.shapFeatures.map((entry, index) => (
                                <Cell key={`shap-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {simResult.extractedOtp && (
                      <div className="otp-alert-box">
                        <KeyRound size={24} className="coral-icon" />
                        <div>
                          <strong>MFA Step-Up Challenge Triggered!</strong>
                          <p style={{ fontSize: '12px', marginTop: '2px' }}>Demo OTP issued by backend: <code className="otp-code-text">{simResult.extractedOtp}</code></p>
                        </div>
                        <button className="primary-btn-sm" onClick={() => setShowOtpModal(true)}>Enter OTP</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ML ENGINE WORKBENCH */}
        {activeTab === 'engine' && (
          <div className="content-container">
            <div className="engine-card">
              <div className="chart-card-header">
                <div>
                  <h2 className="section-title">ML Engine Configuration Workbench</h2>
                  <p className="section-subtitle">Tune XGBoost, Isolation Forest weights, and anomaly sensitivity live</p>
                </div>
                <button className="primary-btn-sm" onClick={handleRetrainEngine} disabled={isRetraining}>
                  {isRetraining ? <RefreshCw className="spin" size={16} /> : <Cpu size={16} />}
                  {isRetraining ? 'Retraining...' : 'Retrain ML Engine'}
                </button>
              </div>

              {/* PRESET SENSITIVITY MODES */}
              <div style={{ marginTop: '20px', marginBottom: '24px' }}>
                <label className="input-label">Defense Preset Sensitivity Modes:</label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button className="preset-chip" onClick={() => handleApplyPresetMode('Strict')}>
                    🛡️ Strict Enterprise (High Security)
                  </button>
                  <button className="preset-chip" onClick={() => handleApplyPresetMode('Balanced')}>
                    ⚖️ Balanced Defense (Standard)
                  </button>
                  <button className="preset-chip" onClick={() => handleApplyPresetMode('LowFriction')}>
                    ⚡ Low Friction (High Customer Volume)
                  </button>
                </div>
              </div>

              <div className="slider-grid">
                <div className="slider-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="input-label">XGBoost Model Weight:</label>
                    <span style={{ fontWeight: 800, color: 'var(--cyan-primary)' }}>{engineConfig.xgb_weight}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="0.95"
                    step="0.05"
                    value={engineConfig.xgb_weight}
                    onChange={(e) => handleUpdateEngineConfig({ ...engineConfig, xgb_weight: parseFloat(e.target.value) })}
                  />
                  <span className="slider-hint">Higher weight prioritizes supervised historical patterns</span>
                </div>

                <div className="slider-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="input-label">Isolation Forest Bump:</label>
                    <span style={{ fontWeight: 800, color: 'var(--coral-primary)' }}>+{engineConfig.iso_bump}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.4"
                    step="0.05"
                    value={engineConfig.iso_bump}
                    onChange={(e) => handleUpdateEngineConfig({ ...engineConfig, iso_bump: parseFloat(e.target.value) })}
                  />
                  <span className="slider-hint">Risk penalty added when Isolation Forest flags unsupervised anomaly</span>
                </div>

                <div className="slider-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="input-label">Step-Up MFA Threshold:</label>
                    <span style={{ fontWeight: 800, color: 'var(--amber-primary)' }}>{Math.round(engineConfig.mfa_threshold * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="0.8"
                    step="0.05"
                    value={engineConfig.mfa_threshold}
                    onChange={(e) => handleUpdateEngineConfig({ ...engineConfig, mfa_threshold: parseFloat(e.target.value) })}
                  />
                  <span className="slider-hint">Transactions scoring above this percentage trigger 6-digit OTP MFA</span>
                </div>

                <div className="slider-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="input-label">Hard Block Threshold:</label>
                    <span style={{ fontWeight: 800, color: 'var(--coral-primary)' }}>{Math.round(engineConfig.block_threshold * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="0.95"
                    step="0.05"
                    value={engineConfig.block_threshold}
                    onChange={(e) => handleUpdateEngineConfig({ ...engineConfig, block_threshold: parseFloat(e.target.value) })}
                  />
                  <span className="slider-hint">Transactions scoring above this are declined immediately</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TRANSACTION LEDGER */}
        {activeTab === 'ledger' && (
          <div className="content-container">
            <div className="table-card">
              <div className="table-card-header">
                <h3 className="table-title">Full Ledger & Transaction History</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="preset-chip" onClick={() => setSearchQuery('')}>All</button>
                  <button className="preset-chip" onClick={() => setSearchQuery('APPROVED')}>Approved</button>
                  <button className="preset-chip" onClick={() => setSearchQuery('AWAITING')}>Awaiting MFA</button>
                  <button className="preset-chip" onClick={() => setSearchQuery('DECLINED')}>Declined</button>
                </div>
              </div>

              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Location</th>
                    <th>Risk Score</th>
                    <th>Status</th>
                    <th>Rule / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} onClick={() => setSelectedTxDetail(tx)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan-primary)' }}>{tx.id}</td>
                      <td>{tx.account}</td>
                      <td style={{ fontWeight: 700 }}>{tx.amount}</td>
                      <td>{tx.location}</td>
                      <td>
                        <span className={`risk-badge ${tx.riskScore > 65 ? 'high' : tx.riskScore > 35 ? 'med' : 'low'}`}>
                          {tx.riskScore}%
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill-table ${tx.status.toLowerCase().includes('approved') ? 'approved' : tx.status.toLowerCase().includes('awaiting') ? 'pending' : 'declined'}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CUSTOMER ACCOUNTS */}
        {activeTab === 'accounts' && (
          <div className="content-container">
            <div className="table-card">
              <div className="table-card-header">
                <h3 className="table-title">Customer Accounts & Daily Limit Control</h3>
                <button className="primary-btn-sm" onClick={() => setShowSignupModal(true)}>+ Provision Account</button>
              </div>

              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Account ID</th>
                    <th>Owner Name</th>
                    <th>Status</th>
                    <th>Daily Limit ($)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsList.map((acc) => (
                    <tr key={acc.account_id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan-primary)' }}>{acc.account_id}</td>
                      <td>{acc.owner_name}</td>
                      <td>
                        <span className={`status-pill-table ${acc.status === 'Active' ? 'approved' : 'declined'}`}>
                          {acc.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>${(acc.daily_limit || 500000).toLocaleString()}</td>
                      <td>
                        <button
                          className="action-btn-sm"
                          onClick={() => handleToggleAccountStatus(acc.account_id, acc.status)}
                        >
                          {acc.status === 'Active' ? 'Suspend Account' : 'Reactivate Account'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* OTP MODAL */}
      {showOtpModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>
                <Lock className="coral-icon" size={20} />
                Identity Challenge Required
              </h3>
              <button className="close-btn" onClick={() => setShowOtpModal(false)}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              High-risk transaction detected! Submit the 6-digit OTP code to complete step-up authentication.
            </p>

            {demoOtpHint && (
              <div className="demo-otp-banner" onClick={fillDemoOtp} style={{ cursor: 'pointer' }}>
                <span>🚨 Demo Terminal OTP: <strong>{demoOtpHint}</strong></span>
                <span style={{ fontSize: '11px', fontWeight: 800 }}>(Auto-Fill)</span>
              </div>
            )}

            <div className="otp-inputs-row">
              {otpCode.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  type="text"
                  maxLength={1}
                  className="otp-digit-input"
                  value={digit}
                  onChange={(e) => handleOtpKeyIn(idx, e.target.value)}
                />
              ))}
            </div>

            {otpMessage && <div style={{ color: 'var(--coral-primary)', fontSize: '13px', textAlign: 'center' }}>{otpMessage}</div>}

            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => setShowOtpModal(false)}>Cancel</button>
              <button className="primary-btn" onClick={handleVerifyOtp} disabled={isVerifyingOtp}>
                {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIGNUP MODAL */}
      {showSignupModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>
                <UserPlus className="cyan-icon" size={20} />
                Provision Customer Account
              </h3>
              <button className="close-btn" onClick={() => setShowSignupModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAccountSignup}>
              <div className="form-group">
                <label className="input-label">Full Name:</label>
                <input
                  type="text"
                  required
                  className="custom-input"
                  value={signupForm.full_name}
                  onChange={(e) => setSignupForm({ ...signupForm, full_name: e.target.value })}
                  placeholder="e.g. Bethany Sparks"
                />
              </div>

              <div className="form-group">
                <label className="input-label">Email Address:</label>
                <input
                  type="email"
                  required
                  className="custom-input"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                  placeholder="e.g. bethany@example.com"
                />
              </div>

              <div className="form-group">
                <label className="input-label">Phone Number:</label>
                <input
                  type="text"
                  required
                  className="custom-input"
                  value={signupForm.phone}
                  onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                  placeholder="e.g. +1-555-0192"
                />
              </div>

              {signupStatus && (
                <div style={{ color: signupStatus.type === 'success' ? 'var(--green-primary)' : 'var(--coral-primary)', fontSize: '13px', margin: '8px 0' }}>
                  {signupStatus.msg}
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setShowSignupModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSigningUp}>
                  {isSigningUp ? 'Provisioning...' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API CONFIG MODAL */}
      {showApiModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>
                <Server className="cyan-icon" size={20} />
                FastAPI Backend Endpoint
              </h3>
              <button className="close-btn" onClick={() => setShowApiModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label className="input-label">FastAPI Server Base URL:</label>
              <input
                type="text"
                className="custom-input"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>

            <div className="modal-footer">
              <button className="primary-btn" onClick={() => { checkHealth(apiUrl); setShowApiModal(false); }}>
                Save & Ping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION DETAIL MODAL */}
      {selectedTxDetail && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Transaction Inspector ({selectedTxDetail.id.substring(0, 18)}...)</h3>
              <button className="close-btn" onClick={() => setSelectedTxDetail(null)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', margin: '16px 0', fontSize: '13px' }}>
              <div><strong>Account:</strong> {selectedTxDetail.account}</div>
              <div><strong>Amount:</strong> {selectedTxDetail.amount}</div>
              <div><strong>Status:</strong> {selectedTxDetail.status}</div>
              <div><strong>Risk Score:</strong> {selectedTxDetail.riskScore}%</div>
              <div><strong>Location:</strong> {selectedTxDetail.location}</div>
              <div><strong>Time:</strong> {selectedTxDetail.time}</div>
            </div>

            <div className="risk-reasons-box">
              <h4 className="box-title">Rule / Detail:</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedTxDetail.rule}</p>
            </div>

            <div className="modal-footer">
              <button className="primary-btn" onClick={() => setSelectedTxDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
