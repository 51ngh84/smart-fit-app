
import React, { useState, useEffect, useMemo, Component, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, addDoc, deleteDoc } from 'firebase/firestore';
import { Loader2, Zap, Target, ScrollText, User, X, Dumbbell, AlertTriangle, Wifi, WifiOff, Utensils, Trash2, TrendingUp, ChevronRight, Pencil, Camera, Check, LogOut, Lock, Mail, Sparkles, Mic } from 'lucide-react';

// --- Safety Utilities ---
const safeStorage = {
  getItem: (key) => {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  setItem: (key, value) => {
    try { localStorage.setItem(key, value); } catch (e) { }
  },
  removeItem: (key) => {
    try { localStorage.removeItem(key); } catch (e) { }
  }
};

const safeDate = (val) => {
  try {
    if (!val) return new Date();
    if (val.seconds) return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch (e) {
    return new Date();
  }
};

// --- Error Boundary ---
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  
  handleReset = () => {
      safeStorage.removeItem('smartfit_profile');
      safeStorage.removeItem('smartfit_logs');
      window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center font-sans">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-red-100 max-w-sm w-full">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">App Crash Detected</h1>
            <p className="text-slate-500 text-sm mb-8">We encountered an unexpected issue. Don't worry, your data is safe.</p>
            <div className="space-y-3">
                <button onClick={() => window.location.reload()} className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95">
                    Restart App
                </button>
                <button onClick={this.handleReset} className="w-full py-3.5 bg-white border border-slate-200 text-red-600 rounded-2xl font-bold hover:bg-red-50 transition-all flex items-center justify-center">
                    <Trash2 className="w-4 h-4 mr-2"/> Reset Local Data
                </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Configuration ---
// Your provided keys are embedded here
const firebaseConfig = {
  apiKey: "AIzaSyCxcr_GEi46-0dr--xUOFAPdLAc7I5or3s",
  authDomain: "smartfit-app-bb195.firebaseapp.com",
  projectId: "smartfit-app-bb195",
  storageBucket: "smartfit-app-bb195.firebasestorage.app",
  messagingSenderId: "280213405028",
  appId: "1:280213405028:web:8176ffe7082ee1c52d0e71",
  measurementId: "G-69J3B5HRPJ"
};

const GEMINI_API_KEY = "AIzaSyCNP-dD1FNeoY1CmaFeyqyVlqbkba9ccdk";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

// --- Helpers ---
const KG_TO_LBS = 2.20462;

const toDisplayWeight = (kg, unit) => {
  if (!kg || isNaN(kg)) return 0;
  return unit === 'lbs' ? (kg * KG_TO_LBS).toFixed(1) : kg.toFixed(1);
};

const toStorageWeight = (value, unit) => {
  if (!value) return 0;
  const floatVal = parseFloat(value);
  if (isNaN(floatVal)) return 0;
  return unit === 'lbs' ? floatVal / KG_TO_LBS : floatVal;
};

const calculateTargets = (profile) => {
  let baseCalories = 2000;
  if (profile && profile.currentWeight > 0) {
    const weightKg = parseFloat(profile.currentWeight) || 70;
    const activityMultipliers = { low: 1.2, moderate: 1.55, high: 1.9 };
    const activity = activityMultipliers[profile.activityLevel] || 1.2;
    const age = parseInt(profile?.age, 10) || 30; 
    let tdee = (10 * weightKg + 6.25 * 170 - 5 * age + 5) * activity; 
    const goalWeight = parseFloat(profile.goalWeight) || weightKg;
    if (goalWeight < weightKg) tdee -= 500; 
    else if (goalWeight > weightKg) tdee += 300; 
    baseCalories = Math.max(1200, Math.round(tdee));
  }
  const autoCalc = profile?.autoCalcCalories !== false; 
  const manualCalories = parseInt(profile?.targetCalories, 10);
  const calories = (!autoCalc && manualCalories > 0) ? manualCalories : baseCalories;
  return { 
      calories, 
      protein: Math.round((calories * 0.3) / 4), 
      fats: Math.round((calories * 0.35) / 9), 
      carbs: Math.round((calories * 0.35) / 4) 
  };
};

// --- Data Service ---
const useFitnessData = () => {
  const [status, setStatus] = useState('loading'); 
  const [mode, setMode] = useState('initializing'); 
  const [userProfile, setUserProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      // 1. Try connecting to Firebase
      try {
        const app = initializeApp(firebaseConfig);
        const fauth = getAuth(app);
        const firestore = getFirestore(app);
        
        if (mounted) {
            setDb(firestore);
            setAuth(fauth);
        }

        onAuthStateChanged(fauth, async (user) => {
          if (!mounted) return;
          if (user) {
              setUserId(user.uid);
              setMode('firebase');
              setStatus('ready');
          } else {
              setUserId(null);
              setStatus('auth');
          }
        });
        return; 
      } catch (e) { 
        console.warn("Firebase failed to initialize", e);
        // Fallback to local storage if Firebase fails
        if (mounted) {
            setMode('local');
            setUserId('local-user');
            try {
                const p = safeStorage.getItem('smartfit_profile');
                if (p) setUserProfile(JSON.parse(p));
                const l = safeStorage.getItem('smartfit_logs');
                if (l) {
                    const parsedLogs = JSON.parse(l);
                    if (Array.isArray(parsedLogs)) setLogs(parsedLogs);
                }
            } catch(e){}
            setStatus('ready');
        }
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (mode !== 'firebase' || !db || !userId) return;
    
    // Path: users/{userId}/data/profile
    const unsubP = onSnapshot(doc(db, 'users', userId, 'data', 'profile'), d => {
      if (d.exists()) setUserProfile(d.data());
      else setUserProfile(null);
    });

    // Path: users/{userId}/logs
    const unsubL = onSnapshot(query(collection(db, 'users', userId, 'logs')), s => {
      const l = s.docs.map(d => ({ id: d.id, ...d.data() }));
      l.sort((a, b) => safeDate(b.date).getTime() - safeDate(a.date).getTime());
      setLogs(l);
    });
    return () => { unsubP(); unsubL(); };
  }, [mode, db, userId]);

  const handleLogin = async (email, password) => { if (!auth) return; await signInWithEmailAndPassword(auth, email, password); };
  const handleSignup = async (email, password) => { if (!auth) return; await createUserWithEmailAndPassword(auth, email, password); };
  const handleGuestLogin = async () => { if (!auth) return; await signInAnonymously(auth); };
  const handleLogout = async () => { if (!auth) return; await signOut(auth); setUserProfile(null); setLogs([]); };

  const saveProfileData = async (newProfile) => {
    if (!newProfile.unit) newProfile.unit = 'kg';
    setUserProfile(newProfile); 
    if (mode === 'firebase' && db && userId) {
      // Use setDoc with merge: true
      await setDoc(doc(db, 'users', userId, 'data', 'profile'), newProfile, { merge: true });
    } else {
      safeStorage.setItem('smartfit_profile', JSON.stringify(newProfile));
    }
  };

  const addLogEntry = async (entry) => {
    const newEntry = { ...entry, id: Date.now().toString() };
    if (mode === 'firebase' && db && userId) {
      await addDoc(collection(db, 'users', userId, 'logs'), entry);
    } else {
      const uLogs = [newEntry, ...logs];
      setLogs(uLogs);
      safeStorage.setItem('smartfit_logs', JSON.stringify(uLogs));
    }
    if (entry.type === 'weight' && entry.value > 0) {
       const updatedProfile = { ...(userProfile || {}), currentWeight: entry.value };
       saveProfileData(updatedProfile);
    }
  };

  const updateLogEntry = async (updatedLog) => {
    if (!updatedLog.id) return;
    if (mode === 'firebase' && db && userId) {
        try {
            await setDoc(doc(db, 'users', userId, 'logs', updatedLog.id), updatedLog);
        } catch (e) { console.error("Error updating doc:", e); }
    } else {
        const uLogs = logs.map(l => l.id === updatedLog.id ? updatedLog : l);
        setLogs(uLogs);
        safeStorage.setItem('smartfit_logs', JSON.stringify(uLogs));
    }
  };

  const deleteLogEntry = async (logId) => {
    if (!logId) return;
    if (mode === 'firebase' && db && userId) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'logs', logId));
      } catch (e) { console.error("Error deleting doc: ", e); }
    } else {
      const uLogs = logs.filter(log => log.id !== logId);
      setLogs(uLogs);
      safeStorage.setItem('smartfit_logs', JSON.stringify(uLogs));
    }
  };

  return { status, mode, userProfile, logs, saveProfileData, addLogEntry, updateLogEntry, deleteLogEntry, handleLogin, handleSignup, handleGuestLogin, handleLogout };
};

// --- Auth Component ---
const AuthScreen = ({ onLogin, onSignup, onGuest }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isLogin) await onLogin(email, password);
            else await onSignup(email, password);
        } catch (err) {
            console.error(err);
            let msg = "Authentication failed.";
            if (err.code === 'auth/invalid-credential') msg = "Invalid email or password.";
            else if (err.code === 'auth/email-already-in-use') msg = "Email already in use.";
            else if (err.code === 'auth/weak-password') msg = "Password too weak.";
            else msg = err.message;
            setError(msg);
        } finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
            <div className="w-full max-w-sm relative z-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-emerald-400 to-indigo-500 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
                        <Dumbbell className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Smart Fit</h1>
                    <p className="text-slate-400 mt-2">Your personal AI fitness journey</p>
                </div>
                <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl">
                    <div className="flex bg-slate-800/50 p-1 rounded-xl mb-6">
                        <button onClick={() => setIsLogin(true)} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${isLogin ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>Sign In</button>
                        <button onClick={() => setIsLogin(false)} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${!isLogin ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>Sign Up</button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all" placeholder="hello@example.com" required />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all" placeholder="••••••••" required />
                            </div>
                        </div>
                        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center space-x-2 text-red-400 text-sm"><AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}
                        <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex justify-center items-center">
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (isLogin ? 'Sign In' : 'Create Account')}
                        </button>
                    </form>
                </div>
                <button onClick={onGuest} disabled={loading} className="w-full mt-6 py-3 text-slate-400 hover:text-white font-medium text-sm transition-colors flex items-center justify-center group">
                    Continue as Guest <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"/>
                </button>
            </div>
        </div>
    );
};

// --- Main Components ---

const SmartFitContent = () => {
  const { status, mode, userProfile, logs, saveProfileData, addLogEntry, updateLogEntry, deleteLogEntry, handleLogin, handleSignup, handleGuestLogin, handleLogout } = useFitnessData();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);

  useEffect(() => {
    if (status === 'ready' && (!userProfile || !userProfile.name)) setShowProfileModal(true);
  }, [status, userProfile]);

  if (status === 'loading') return <div className="flex justify-center items-center h-screen bg-slate-50"><Loader2 className="animate-spin text-emerald-500 w-10 h-10" /></div>;
  if (status === 'auth') return <AuthScreen onLogin={handleLogin} onSignup={handleSignup} onGuest={handleGuestLogin} />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 max-w-md mx-auto shadow-2xl relative flex flex-col overflow-hidden">
        <div className={`w-full py-1 px-4 text-[10px] font-bold text-center text-white flex justify-center items-center space-x-2 shadow-sm z-20 ${mode === 'firebase' ? 'bg-emerald-500' : 'bg-orange-400'}`}>
           {mode === 'firebase' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
           <span>{mode === 'firebase' ? 'ONLINE SYNC' : 'OFFLINE MODE'}</span>
        </div>

        <div className="flex-grow overflow-y-auto overflow-x-hidden scrollbar-hide">
          {activeTab === 'dashboard' && <Dashboard userProfile={userProfile} logs={logs || []} openProfile={() => setShowProfileModal(true)} deleteLogEntry={deleteLogEntry} editLogEntry={setEditingLog} />}
          {activeTab === 'coach' && <AICoach userProfile={userProfile} />}
          {activeTab === 'log' && <LogTab addLogEntry={addLogEntry} logs={logs || []} userProfile={userProfile} deleteLogEntry={deleteLogEntry} editLogEntry={setEditingLog} />}
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto">
          <div className="absolute inset-0 bg-white/90 backdrop-blur-lg border-t border-slate-200"></div>
          <div className="relative flex justify-around items-center h-20 pb-2">
            <NavButton icon={User} label="Dash" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <div className="relative -top-5">
                <button onClick={() => setActiveTab('log')} className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg shadow-emerald-200 transition-all transform active:scale-95 ${activeTab === 'log' ? 'bg-emerald-600 text-white scale-110' : 'bg-slate-900 text-white'}`}>
                    <Utensils className="w-6 h-6" />
                </button>
            </div>
            <NavButton icon={Zap} label="Coach" active={activeTab === 'coach'} onClick={() => setActiveTab('coach')} />
          </div>
        </nav>

        {showProfileModal && <ProfileModal currentProfile={userProfile} onSave={(d) => { saveProfileData(d); setShowProfileModal(false); }} onClose={() => setShowProfileModal(false)} onLogout={handleLogout} />}
        {editingLog && <EditLogModal log={editingLog} onSave={(l) => { updateLogEntry(l); setEditingLog(null); }} onClose={() => setEditingLog(null)} />}
    </div>
  );
};

const App = () => <ErrorBoundary><SmartFitContent /></ErrorBoundary>;

// --- Dashboard & Charts ---

const WeightChart = ({ logs, unit }) => {
  const weightLogs = useMemo(() => {
    return logs.filter(l => l.type === 'weight').slice(0, 10).reverse();
  }, [logs]);

  if (weightLogs.length < 2) return (
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6 flex flex-col items-center justify-center text-center h-48">
          <div className="bg-slate-50 p-3 rounded-full mb-3"><TrendingUp className="w-6 h-6 text-slate-300" /></div>
          <p className="text-slate-400 text-sm font-medium">Log at least 2 weight entries<br/>to see your trend chart.</p>
      </div>
  );

  const weights = weightLogs.map(l => parseFloat(toDisplayWeight(l.value, unit)));
  const minW = Math.min(...weights) - 1;
  const maxW = Math.max(...weights) + 1;
  const range = maxW - minW || 1;
  
  const points = weights.map((w, i) => {
    const x = (i / (weights.length - 1)) * 100;
    const y = 100 - ((w - minW) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const fillPath = `0,100 ${points} 100,100`;

  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 mb-6 overflow-hidden relative">
        <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Weight Trend</h3>
            <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded-full">{unit}</span>
        </div>
        <div className="h-32 w-full relative z-10">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={fillPath} fill="url(#gradient)" />
                <polyline fill="none" stroke="#10b981" strokeWidth="3" points={points} strokeLinecap="round" strokeLinejoin="round" />
                {weights.map((w, i) => {
                   const x = (i / (weights.length - 1)) * 100;
                   const y = 100 - ((w - minW) / range) * 100;
                   return <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke="#10b981" strokeWidth="2" />
                })}
            </svg>
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium">
            <span>{new Date(weightLogs[0].date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
            <span>{new Date(weightLogs[weightLogs.length-1].date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
        </div>
    </div>
  );
};

const Dashboard = ({ userProfile, logs, openProfile, deleteLogEntry, editLogEntry }) => {
  const targets = useMemo(() => calculateTargets(userProfile), [userProfile]);
  const unit = userProfile?.unit || 'kg';
  const displayWeight = toDisplayWeight(userProfile?.currentWeight, unit);
  const displayGoal = toDisplayWeight(userProfile?.goalWeight, unit);
  
  const dailyTotals = useMemo(() => {
      const today = new Date().toDateString();
      return (logs || []).filter(l => {
          try { return safeDate(l.date).toDateString() === today && l.type === 'food'; } catch { return false; }
      }).reduce((acc, log) => ({
        calories: acc.calories + (log.nutrition?.calories || 0),
        protein: acc.protein + (log.nutrition?.protein || 0),
        carbs: acc.carbs + (log.nutrition?.carbs || 0),
        fats: acc.fats + (log.nutrition?.fats || 0),
      }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
  }, [logs]);

  const remainingCals = Math.max(0, targets.calories - dailyTotals.calories);
  const calPercent = Math.min((dailyTotals.calories/targets.calories)*100, 100);

  return (
    <div className="p-5 space-y-6 animate-fade-in pb-20">
      <div className="flex justify-between items-center pt-2">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Hello,</h1>
          <h2 className="text-xl text-emerald-600 font-bold">{userProfile?.name || 'Friend'}</h2>
        </div>
        <button onClick={openProfile} className="w-10 h-10 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-emerald-600 transition-colors">
            <User className="w-5 h-5" />
        </button>
      </div>

      <WeightChart logs={logs} unit={unit} />

      <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center space-x-2 mb-2">
                  <div className="p-1.5 bg-blue-50 rounded-lg"><User className="w-4 h-4 text-blue-500" /></div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Current</span>
              </div>
              <p className="text-2xl font-black text-slate-800">{displayWeight} <span className="text-sm font-medium text-slate-400">{unit}</span></p>
          </div>
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center space-x-2 mb-2">
                  <div className="p-1.5 bg-emerald-50 rounded-lg"><Target className="w-4 h-4 text-emerald-500" /></div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Goal</span>
              </div>
              <p className="text-2xl font-black text-slate-800">{displayGoal} <span className="text-sm font-medium text-slate-400">{unit}</span></p>
          </div>
      </div>

      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl transform translate-x-10 -translate-y-10"></div>
        
        <div className="flex justify-between items-center mb-6 relative z-10">
            <div>
                <span className="text-xs font-medium text-slate-400 block mb-1">Calories Remaining</span>
                <span className="text-3xl font-black text-white tracking-tight">{remainingCals}</span>
            </div>
            <div className="text-right">
                <span className="text-xs font-medium text-slate-400 block mb-1">Target</span>
                <span className="text-lg font-bold text-emerald-400">{targets.calories}</span>
            </div>
        </div>
        
        <div className="w-full bg-slate-800 rounded-full h-3 mb-6 relative z-10 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${calPercent}%`}}></div>
        </div>

        <div className="grid grid-cols-3 gap-2 relative z-10">
            <MacroPill label="Protein" current={dailyTotals.protein} target={targets.protein} color="bg-blue-500" />
            <MacroPill label="Carbs" current={dailyTotals.carbs} target={targets.carbs} color="bg-orange-500" />
            <MacroPill label="Fats" current={dailyTotals.fats} target={targets.fats} color="bg-purple-500" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Recent Activity</h3>
            <button onClick={() => document.getElementById('log-nav-btn')?.click()} className="text-xs text-emerald-600 font-bold hover:underline">View All</button>
        </div>
        <div className="space-y-3">
          {logs.slice(0, 3).map(log => <LogItem key={log.id} log={log} onDelete={deleteLogEntry} onEdit={editLogEntry} />)}
          {logs.length === 0 && (
              <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-200">
                  <p className="text-slate-400 text-sm">No logs yet today.</p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MacroPill = ({ label, current, target, color }) => (
    <div className="bg-slate-800/50 rounded-2xl p-3 text-center backdrop-blur-sm border border-white/5">
        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">{label}</p>
        <p className="text-lg font-bold text-white leading-none">{current}g</p>
        <p className="text-[10px] text-slate-500 mt-1">/ {target}g</p>
    </div>
);

const AICoach = ({ userProfile }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const context = `Profile: ${userProfile?.currentWeight}kg, Goal: ${userProfile?.goalWeight}kg, Age: ${userProfile?.age}`;
    const fullPrompt = `You are FitBot. Context: ${context}. User asks: "${query}". Keep it motivating, short, and use markdown.`;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
      });
      const data = await res.json();
      setResponse(data.candidates?.[0]?.content?.parts?.[0]?.text || "Connection error.");
    } catch (e) { setResponse("Error connecting to AI."); } 
    finally { setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col p-5 pb-24">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-yellow-100 rounded-xl"><Sparkles className="w-6 h-6 text-yellow-600" /></div>
        <h1 className="text-2xl font-bold text-slate-900">Coach</h1>
      </div>
      
      <div className="flex-grow space-y-4 overflow-y-auto mb-4 scrollbar-hide" ref={scrollRef}>
        <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-sm text-slate-600">
                <p>Hi! I'm FitBot. I know your goals and stats. Ask me anything about your diet or workout!</p>
            </div>
        </div>

        {loading && (
             <div className="flex items-start space-x-3 justify-end">
                <div className="bg-emerald-600 p-4 rounded-2xl rounded-tr-none shadow-md text-sm text-white">
                    <p>{query}</p>
                </div>
            </div>
        )}

        {response && !loading && (
            <div className="flex items-start space-x-3 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-yellow-600" />
                </div>
                <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-sm text-slate-700">
                    <div className="prose prose-sm prose-emerald" dangerouslySetInnerHTML={{ __html: response.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') }} />
                </div>
            </div>
        )}
        
        {loading && (
            <div className="flex items-center space-x-2 text-slate-400 text-xs ml-12">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Thinking...</span>
            </div>
        )}
      </div>

      <div className="relative">
        <textarea 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            placeholder="Ask FitBot..." 
            className="w-full p-4 pr-14 bg-white border border-slate-200 rounded-3xl shadow-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none text-sm" 
            rows="1" 
        />
        <button onClick={handleAsk} disabled={loading || !query} className="absolute right-2 top-2 p-2 bg-emerald-600 text-white rounded-full shadow-md hover:bg-emerald-700 disabled:opacity-50 transition-all">
            <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

const LogTab = ({ addLogEntry, logs, userProfile, deleteLogEntry, editLogEntry }) => {
  const [type, setType] = useState('food');
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [foodOptions, setFoodOptions] = useState(null); 
  const [selectedFood, setSelectedFood] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  
  const [isListening, setIsListening] = useState(false); // New State

  const safeLogs = Array.isArray(logs) ? logs : [];

  const handleImageUpload = (event) => {
      const file = event.target.files[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => { setImagePreview(reader.result); setInputVal(''); };
          reader.readAsDataURL(file);
      }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputVal(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.start();
  };

  const handleAnalyzeFood = async () => {
      if (!inputVal && !imagePreview) return;
      setLoading(true);
      setFoodOptions(null);
      setSelectedFood(null);
      try {
          const parts = [];
          const textPrompt = `Identify 3-5 distinct matches for this food. 
          ${inputVal ? `User description: "${inputVal}".` : ''}
          Prioritize Canadian data/brands (e.g. PC, Kirkland).
          Include at least one "Generic" option.
          Return a valid JSON ARRAY of objects. Each object must have:
          - "name": string
          - "calories": number
          - "protein": number
          - "carbs": number
          - "fats": number
          Do not add markdown.`;
          
          parts.push({ text: textPrompt });
          if (imagePreview) {
              const base64Data = imagePreview.split(',')[1];
              parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Data } });
          }
          const payload = { contents: [{ parts: parts }], tools: [{ "google_search": {} }] };
          const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const data = await res.json();
          let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
              text = text.replace(/```json|```/g, '').trim();
              const result = JSON.parse(text);
              if (Array.isArray(result)) setFoodOptions(result); else if (typeof result === 'object') setFoodOptions([result]); 
          }
      } catch (e) { alert("Could not analyze food."); } finally { setLoading(false); }
  };

  const handleSubmit = () => {
      if (type === 'food') {
          if (!selectedFood) return;
          addLogEntry({ type: 'food', description: selectedFood.name, nutrition: selectedFood, date: new Date().toISOString() });
          handleCancel();
      } else if (type === 'weight') {
          const val = parseFloat(inputVal);
          if (!val) return;
          const unit = userProfile?.unit || 'kg';
          const weightInKg = unit === 'lbs' ? val / KG_TO_LBS : val;
          addLogEntry({ type: 'weight', value: weightInKg, date: new Date().toISOString() });
          setInputVal('');
      } else {
          addLogEntry({ type: 'workout', value: inputVal, date: new Date().toISOString() });
          setInputVal('');
      }
  };

  const handleCancel = () => {
      setFoodOptions(null);
      setSelectedFood(null);
      setInputVal('');
      setImagePreview(null);
      if(fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-5 pb-24 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center">
          <div className="p-2 bg-purple-100 rounded-xl mr-3"><ScrollText className="w-6 h-6 text-purple-600" /></div>
          Log Activity
      </h1>
      
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-5">
        <div className="flex bg-slate-100 p-1.5 rounded-2xl relative">
            {['food', 'weight', 'workout'].map(t => (
                <button key={t} onClick={() => { setType(t); handleCancel(); }} className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide rounded-xl transition-all duration-300 z-10 ${type === t ? 'bg-white text-slate-900 shadow-sm scale-100' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
            ))}
        </div>

        {type === 'food' && (
            <div className="space-y-4">
                {!foodOptions && (
                    <>
                         <div className="relative">
                             <textarea value={inputVal} onChange={e => setInputVal(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all pr-24 text-sm" placeholder={imagePreview ? "Add description..." : "e.g. 100g salmon..."} rows="3" />
                             
                             <div className="absolute right-3 bottom-3 flex space-x-2">
                                <button 
                                    onClick={startListening} 
                                    className={`p-2 rounded-xl shadow-sm border border-slate-100 transition-colors ${isListening ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-white text-slate-400 hover:text-indigo-600'}`}
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-indigo-600 transition-colors"><Camera className="w-5 h-5" /></button>
                             </div>
                             
                             <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" capture="environment" className="hidden" />
                         </div>
                         {imagePreview && (
                             <div className="relative w-full h-48 bg-slate-100 rounded-2xl overflow-hidden shadow-inner">
                                 <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                 <button onClick={handleCancel} className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70 backdrop-blur-sm"><X className="w-4 h-4" /></button>
                             </div>
                         )}
                    </>
                )}

                {foodOptions && !selectedFood && (
                    <div className="space-y-2 animate-fade-in">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Select Best Match</p>
                        {foodOptions.map((opt, idx) => (
                            <button key={idx} onClick={() => setSelectedFood(opt)} className="w-full p-4 text-left bg-white border border-slate-200 rounded-2xl hover:border-emerald-500 hover:shadow-md hover:shadow-emerald-500/5 transition-all group">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm mb-1">{opt.name}</p>
                                        <div className="flex space-x-2">
                                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{opt.calories} kcal</span>
                                            <span className="text-[10px] text-slate-400">{opt.protein}p • {opt.carbs}c • {opt.fats}f</span>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors"><ChevronRight className="w-4 h-4"/></div>
                                </div>
                            </button>
                        ))}
                        <button onClick={handleCancel} className="w-full py-3 text-slate-400 text-xs font-bold hover:text-red-500 transition-colors">Cancel Search</button>
                    </div>
                )}

                {selectedFood && (
                    <div className="bg-emerald-50/50 p-5 rounded-3xl border border-emerald-100 animate-fade-in">
                        <div className="flex justify-between items-start mb-4">
                            <div><p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Selected Food</p><p className="font-bold text-emerald-900 text-lg leading-tight">{selectedFood.name}</p></div>
                            <button onClick={() => setSelectedFood(null)} className="text-emerald-400 hover:text-emerald-700 bg-white p-1 rounded-full"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            <MacroBox label="Cals" val={selectedFood.calories} />
                            <MacroBox label="Prot" val={selectedFood.protein} />
                            <MacroBox label="Carb" val={selectedFood.carbs} />
                            <MacroBox label="Fat" val={selectedFood.fats} />
                        </div>
                    </div>
                )}

                {!foodOptions && (
                    <button onClick={handleAnalyzeFood} disabled={loading || (!inputVal && !imagePreview)} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl flex justify-center items-center shadow-lg shadow-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95">
                        {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (imagePreview ? <span className="flex items-center"><Sparkles className="w-4 h-4 mr-2 text-yellow-400"/>Analyze Photo</span> : 'Search Food')}
                    </button>
                )}
                
                {selectedFood && (
                    <button onClick={handleSubmit} className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl flex justify-center items-center shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all active:scale-95">
                        <Check className="w-5 h-5 mr-2"/> Confirm Log
                    </button>
                )}
            </div>
        )}

        {type === 'weight' && (
            <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-2">New Weight ({userProfile?.unit || 'kg'})</label>
                    <input type="number" value={inputVal} onChange={e => setInputVal(e.target.value)} className="w-full bg-transparent text-3xl font-black text-slate-900 outline-none placeholder-slate-200" placeholder="0.0" />
                </div>
                <button onClick={handleSubmit} className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">Save Weight</button>
            </div>
        )}

        {type === 'workout' && (
             <div className="space-y-4">
                <textarea value={inputVal} onChange={e => setInputVal(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border-transparent focus:bg-white focus:ring-2 focus:ring-teal-500 transition-all text-sm" placeholder="Workout details..." rows="4"/>
                <button onClick={handleSubmit} className="w-full py-4 bg-teal-600 text-white font-bold rounded-2xl shadow-lg shadow-teal-200 hover:bg-teal-700 transition-all">Save Workout</button>
             </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">History</h3>
        {(logs || []).map(log => <LogItem key={log.id} log={log} onDelete={deleteLogEntry} onEdit={editLogEntry} />)}
      </div>
    </div>
  );
};

const MacroBox = ({ label, val }) => (
    <div className="bg-white p-2 rounded-xl text-center shadow-sm">
        <span className="block font-bold text-slate-800 text-sm">{val}</span>
        <span className="text-[10px] text-slate-400 uppercase font-bold">{label}</span>
    </div>
);

const LogItem = ({ log, onDelete, onEdit }) => {
    const isFood = log.type === 'food';
    const styles = {
        food: { bg: 'bg-orange-50', text: 'text-orange-600', icon: Utensils },
        weight: { bg: 'bg-blue-50', text: 'text-blue-600', icon: User },
        workout: { bg: 'bg-teal-50', text: 'text-teal-600', icon: Dumbbell }
    };
    const style = styles[log.type] || styles.food;
    const Icon = style.icon;
    
    return (
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-slate-100 hover:border-slate-200 transition-colors">
            <div className="flex items-center space-x-4 overflow-hidden">
                <div className={`p-3 rounded-xl ${style.bg} ${style.text}`}><Icon className="w-5 h-5" /></div>
                <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{isFood ? log.description : (log.type === 'workout' ? 'Workout' : 'Weight Update')}</p>
                    <p className="text-xs text-slate-400 font-medium">{safeDate(log.date).toLocaleDateString(undefined, {weekday: 'short', hour: '2-digit', minute:'2-digit'})}</p>
                </div>
            </div>
            
            <div className="flex items-center space-x-3 pl-2">
                <div className="text-right whitespace-nowrap">
                    {isFood ? (
                        <div className="text-right">
                            <span className="block font-black text-slate-900 text-sm">{log.nutrition?.calories} <span className="text-[10px] text-slate-400 font-normal">kcal</span></span>
                        </div>
                    ) : (
                        <span className="font-black text-slate-900 text-sm">{log.type === 'weight' ? `${parseFloat(log.value).toFixed(1)}kg` : log.value}</span>
                    )}
                </div>
                
                <div className="flex space-x-1">
                    {onEdit && <button onClick={() => onEdit(log)} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 rounded-full transition-colors"><Pencil className="w-4 h-4" /></button>}
                    {onDelete && <button onClick={() => onDelete(log.id)} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors"><Trash2 className="w-4 h-4" /></button>}
                </div>
            </div>
        </div>
    );
};

const EditLogModal = ({ log, onSave, onClose }) => {
    const [editVal, setEditVal] = useState(log.type === 'food' ? log.description : log.value);
    const [nutrition, setNutrition] = useState(log.nutrition || {});

    const handleSave = () => {
        const updatedLog = { ...log, date: safeDate(log.date).toISOString() }; 
        if (log.type === 'food') { updatedLog.description = editVal; updatedLog.nutrition = nutrition; } 
        else { updatedLog.value = editVal; }
        onSave(updatedLog);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
                <div className="flex justify-between mb-6">
                    <h2 className="text-lg font-bold text-slate-900">Edit Entry</h2>
                    <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="space-y-4">
                    <input value={editVal} onChange={e => setEditVal(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border-none text-sm font-medium" />
                    {log.type === 'food' && (
                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" placeholder="Cals" value={nutrition.calories || 0} onChange={e => setNutrition({...nutrition, calories: parseInt(e.target.value)})} className="p-3 bg-slate-50 rounded-xl text-sm" />
                            <input type="number" placeholder="Prot" value={nutrition.protein || 0} onChange={e => setNutrition({...nutrition, protein: parseInt(e.target.value)})} className="p-3 bg-slate-50 rounded-xl text-sm" />
                            <input type="number" placeholder="Carb" value={nutrition.carbs || 0} onChange={e => setNutrition({...nutrition, carbs: parseInt(e.target.value)})} className="p-3 bg-slate-50 rounded-xl text-sm" />
                            <input type="number" placeholder="Fat" value={nutrition.fats || 0} onChange={e => setNutrition({...nutrition, fats: parseInt(e.target.value)})} className="p-3 bg-slate-50 rounded-xl text-sm" />
                        </div>
                    )}
                    <button onClick={handleSave} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const ProfileModal = ({ currentProfile, onSave, onClose, onLogout }) => {
  const [formData, setFormData] = useState({
      name: currentProfile?.name || '',
      age: currentProfile?.age || '',
      currentWeight: toDisplayWeight(currentProfile?.currentWeight, currentProfile?.unit || 'kg'),
      goalWeight: toDisplayWeight(currentProfile?.goalWeight, currentProfile?.unit || 'kg'),
      activityLevel: currentProfile?.activityLevel || 'moderate',
      unit: currentProfile?.unit || 'kg',
      autoCalcCalories: currentProfile?.autoCalcCalories !== false,
      targetCalories: currentProfile?.targetCalories || ''
  });

  const toggleUnit = (newUnit) => {
      if (newUnit === formData.unit) return;
      const factor = newUnit === 'lbs' ? KG_TO_LBS : 1/KG_TO_LBS;
      setFormData({
          ...formData,
          unit: newUnit,
          currentWeight: (formData.currentWeight * factor).toFixed(1),
          goalWeight: (formData.goalWeight * factor).toFixed(1),
      });
  };

  const handleSave = () => {
      onSave({
          name: formData.name,
          age: parseInt(formData.age, 10) || 30,
          activityLevel: formData.activityLevel,
          unit: formData.unit,
          currentWeight: toStorageWeight(formData.currentWeight, formData.unit),
          goalWeight: toStorageWeight(formData.goalWeight, formData.unit),
          autoCalcCalories: formData.autoCalcCalories,
          targetCalories: formData.autoCalcCalories ? null : (parseInt(formData.targetCalories, 10) || 0)
      });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-slate-900">Your Goals</h2>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        
        <div className="space-y-5">
            <div className="bg-slate-100 p-1.5 rounded-2xl flex">
                <button onClick={() => toggleUnit('kg')} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${formData.unit === 'kg' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>KG</button>
                <button onClick={() => toggleUnit('lbs')} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${formData.unit === 'lbs' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>LBS</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Name</label>
                    <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-medium border-none focus:ring-2 ring-indigo-500" placeholder="Name" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Age</label>
                    <input type="number" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-medium border-none focus:ring-2 ring-indigo-500" placeholder="Age" />
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Current</label>
                    <div className="relative">
                        <input type="number" value={formData.currentWeight} onChange={e => setFormData({...formData, currentWeight: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-lg font-bold border-none focus:ring-2 ring-indigo-500" />
                        <span className="absolute right-4 top-5 text-xs font-bold text-slate-400">{formData.unit}</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Goal</label>
                    <div className="relative">
                        <input type="number" value={formData.goalWeight} onChange={e => setFormData({...formData, goalWeight: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-lg font-bold border-none focus:ring-2 ring-indigo-500" />
                        <span className="absolute right-4 top-5 text-xs font-bold text-slate-400">{formData.unit}</span>
                    </div>
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Activity Level</label>
                <select value={formData.activityLevel} onChange={e => setFormData({...formData, activityLevel: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl text-sm font-medium border-none focus:ring-2 ring-indigo-500">
                    <option value="low">Low (Sedentary)</option>
                    <option value="moderate">Moderate (Active)</option>
                    <option value="high">High (Athlete)</option>
                </select>
            </div>

            <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-slate-700">Auto-calculate Calorie Goal</span>
                    <button 
                        onClick={() => setFormData({...formData, autoCalcCalories: !formData.autoCalcCalories})}
                        className={`w-12 h-7 rounded-full p-1 transition-colors ${formData.autoCalcCalories ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${formData.autoCalcCalories ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
                
                {!formData.autoCalcCalories && (
                    <div className="animate-in slide-in-from-top-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Custom Daily Target</label>
                        <input
                            type="number"
                            value={formData.targetCalories}
                            onChange={e => setFormData({...formData, targetCalories: e.target.value})}
                            className="w-full p-4 bg-indigo-50 text-indigo-900 font-bold rounded-2xl border-2 border-indigo-100 focus:border-indigo-500"
                            placeholder="e.g. 2200"
                        />
                    </div>
                )}
            </div>

            <button onClick={handleSave} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-lg shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95">Save Profile</button>
            <button onClick={onLogout} className="w-full py-4 text-red-500 font-bold text-sm hover:bg-red-50 rounded-2xl transition-colors flex items-center justify-center">
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </button>
        </div>
      </div>
    </div>
  );
};

const NavButton = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${active ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
    <Icon className={`w-6 h-6 mb-1 ${active ? 'fill-current' : ''}`} strokeWidth={active ? 2.5 : 2} />
    <span className={`text-[10px] font-bold ${active ? 'opacity-100' : 'opacity-0 scale-0'} transition-all`}>{label}</span>
  </button>
);

export default App;