// ============================================================
// QUICKCHAT — app.js
// Developed By Ghost & Dexter
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where,
  orderBy, addDoc, serverTimestamp, getDocs, limit, deleteDoc, arrayUnion, arrayRemove,
  writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadString, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ------------------------------------------------------------
// 🔧 FIREBASE CONFIG — Replace with your real project credentials
// Get this from: Firebase Console → Project Settings → Your apps → SDK setup
// Required: Authentication (Phone provider enabled, Blaze plan),
//           Firestore Database, Storage (Blaze plan)
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const storage = getStorage(fbApp);

// ------------------------------------------------------------
// Twilio OTP Worker Config
// Deploy worker.js to Cloudflare Workers first, then paste the URL here
// ------------------------------------------------------------
const OTP_WORKER_URL = "YOUR_CLOUDFLARE_WORKER_URL"; // e.g. https://quickchat-otp.yourname.workers.dev
const WORKER_SECRET  = "YOUR_RANDOM_SECRET_STRING";  // same value as in worker.js

// ------------------------------------------------------------
// App constants
// ------------------------------------------------------------
const APP_NAME = "QuickChat";
const OWNER = "Ghost & Dexter";
const WHATSAPP_CONTACTS = ["0743010225", "0740989928"];
const COUNTRY_CODE = "+94"; // Sri Lanka default — editable on login screen

// ------------------------------------------------------------
// Twilio WhatsApp OTP helpers (via Cloudflare Worker)
// ------------------------------------------------------------
async function svSendOtp(phoneE164){
  const res = await fetch(OTP_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": WORKER_SECRET
    },
    body: JSON.stringify({ action: "send", phone: phoneE164 })
  });
  const json = await res.json();
  if(!res.ok || !json.success) throw new Error(json.error || "Failed to send OTP");
  return json.sid; // not needed for verify, but stored for reference
}

async function svCheckOtp(_, code){ // first arg unused (no verificationId needed)
  const res = await fetch(OTP_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": WORKER_SECRET
    },
    body: JSON.stringify({ action: "verify", phone: state.pendingPhone, code })
  });
  const json = await res.json();
  if(!res.ok) throw new Error(json.error || "Verification failed");
  return json.verified === true;
}

// ------------------------------------------------------------
// Session helpers (localStorage-based, no Firebase Auth)
// ------------------------------------------------------------
function sessionSave(uid, phone){
  localStorage.setItem("qc_uid", uid);
  localStorage.setItem("qc_phone", phone);
}
function sessionLoad(){
  const uid = localStorage.getItem("qc_uid");
  const phone = localStorage.getItem("qc_phone");
  return uid && phone ? { uid, phone } : null;
}
function sessionClear(){
  localStorage.removeItem("qc_uid");
  localStorage.removeItem("qc_phone");
}
// Generate a stable UID from phone number (deterministic)
function phoneToUid(phoneE164){
  const digits = phoneE164.replace(/\D/g,"");
  return "uid_" + btoa(digits).replace(/[^a-zA-Z0-9]/g,"").slice(0,20);
}

// ------------------------------------------------------------
// Inline SVG Icons (no external deps)
// ------------------------------------------------------------
const ICONS = {
  logo: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3C7 3 3 6.6 3 11c0 2.4 1.2 4.5 3.1 6L5 21l4.2-1.6c.9.2 1.8.4 2.8.4 5 0 9-3.6 9-8S17 3 12 3z" fill="#04231b"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  newChat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  chatsNav: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  contactsNav: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  callsNav: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`,
  settingsNav: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 005 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008.6 5a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019 8.6a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>`,
  attach: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.1l-9.2 9.2a5.5 5.5 0 01-7.8-7.8l9.2-9.2a3.7 3.7 0 015.2 5.2l-9.2 9.2a1.8 1.8 0 01-2.6-2.6l8.5-8.4"/></svg>`,
  emoji: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  checkSingle: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l4 4 8-9"/></svg>`,
  checkDouble: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 9l4 4 3-3"/><path d="M6 10l3 3 8-9"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>`,
  block: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>`,
  flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  callOut: `<svg class="call-type-icon ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="8 7 17 7 17 16"/></svg>`,
  callIn: `<svg class="call-type-icon ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="16 17 7 17 7 8"/></svg>`,
  callMissed: `<svg class="call-type-icon missed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 16 17 7 8 7"/></svg>`,
  phoneCall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`,
  videoCall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  ghostMark: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3C7.5 3 4 6.6 4 11c0 2.5 1.2 4.6 3 6.1V21l2.4-1.6c.8.2 1.7.3 2.6.3 4.5 0 8-3.6 8-8S16.5 3 12 3z" fill="#04231b"/><circle cx="9.5" cy="11" r="1.2" fill="#00d9a3"/><circle cx="14.5" cy="11" r="1.2" fill="#00d9a3"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

const EMOJI_LIST = ["😀","😁","😂","🤣","😊","😍","😘","😎","🤩","🥳","😇","🙂","😉","😋","😜","🤪","😏","😒","😢","😭","😡","🤬","😱","😴","🤤","🥺","😬","🙄","😤","🤔","🤗","🤭","😶","🤐","🤧","🤒","🤕","🥴","🤢","💀","👻","👽","🤖","💩","🔥","✨","🎉","💯","❤️","🧡","💛","💚","💙","💜","🖤","💔","💕","👍","👎","👏","🙏","💪","🤝","👋","✌️","🤙","🫡","🎮","⚡","🚀","🌙","☀️","🍕","🍔","☕","🎵","📌","✅","❌","⭐"];

// ------------------------------------------------------------
// Global App State
// ------------------------------------------------------------
const state = {
  currentUser: null,        // { uid, phoneNumber } — replaces firebase auth user
  userDoc: null,            // firestore /users/{uid} data
  screen: "splash",
  prevScreen: null,
  activeNav: "chats",
  chats: [],                 // chat list (live)
  activeChatId: null,
  activeChatPeer: null,      // peer user doc for open chat
  messages: [],               // messages in active chat
  typingPeer: false,
  verificationId: null,      // SimpleVerify verification_id (replaces confirmationResult)
  pendingPhone: null,
  newUserSetup: false,
  contacts: [],                // discovered users (from chats / search)
  blockedUsers: [],
  privacy: { hideLastSeen:false, hidePhoto:false, hideOnline:false },
  unsubscribers: {},           // active onSnapshot listeners keyed
  selectedImageBase64: null,
  selectedImagePreview: null,
  replyTo: null,
  typingTimeout: null,
  callLog: [],                // simulated local call log
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const $app = () => document.getElementById("app");
const el = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
const qs = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str=""){
  return str.replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function initials(name=""){
  const parts = name.trim().split(/\s+/);
  if(!parts[0]) return "?";
  return (parts[0][0] + (parts[1]?.[0]||"")).toUpperCase();
}

function avatarHtml(user, size="avatar"){
  const showPhoto = user?.photoURL && !(user.privacy?.hidePhoto && user._isPeer);
  if(showPhoto){
    return `<div class="${size}"><img src="${user.photoURL}" alt=""></div>`;
  }
  return `<div class="${size}">${initials(user?.username || user?.phone || "?")}</div>`;
}

function formatTime(ts){
  if(!ts) return "";
  const d = ts instanceof Date ? ts : ts.toDate ? ts.toDate() : new Date(ts);
  let h = d.getHours(); const m = d.getMinutes().toString().padStart(2,"0");
  const ampm = h >= 12 ? "PM" : "AM"; h = h % 12; if(h===0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function formatChatListTime(ts){
  if(!ts) return "";
  const d = ts instanceof Date ? ts : ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if(isToday) return formatTime(d);
  const yest = new Date(now); yest.setDate(now.getDate()-1);
  if(d.toDateString() === yest.toDateString()) return "Yesterday";
  const diffDays = Math.floor((now - d)/86400000);
  if(diffDays < 7) return d.toLocaleDateString(undefined,{weekday:"short"});
  return d.toLocaleDateString(undefined,{day:"2-digit",month:"2-digit",year:"2-digit"});
}

function formatDateChip(ts){
  const d = ts instanceof Date ? ts : ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  if(d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now); yest.setDate(now.getDate()-1);
  if(d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"});
}

function lastSeenLabel(user){
  if(!user) return "offline";
  if(user.privacy?.hideLastSeen || user.privacy?.hideOnline) return "";
  if(user.online) return "online";
  if(!user.lastSeen) return "offline";
  const d = user.lastSeen.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = formatTime(d);
  if(isToday) return `last seen today at ${timeStr}`;
  const yest = new Date(now); yest.setDate(now.getDate()-1);
  if(d.toDateString() === yest.toDateString()) return `last seen yesterday at ${timeStr}`;
  return `last seen ${d.toLocaleDateString(undefined,{day:"2-digit",month:"2-digit",year:"2-digit"})}`;
}

function normalizePhone(raw){
  let v = raw.replace(/[^\d+]/g,"");
  if(v.startsWith("0")) v = COUNTRY_CODE + v.slice(1);
  if(!v.startsWith("+")) v = COUNTRY_CODE + v;
  return v;
}

function chatIdFor(uid1, uid2){
  return [uid1, uid2].sort().join("_");
}

function showToast(msg, ms=2200){
  const existing = qs(".toast"); if(existing) existing.remove();
  const t = el(`<div class="toast">${escapeHtml(msg)}</div>`);
  $app().appendChild(t);
  setTimeout(()=> t.remove(), ms);
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// compress image client-side before upload (keeps Firestore/Storage light)
function compressImage(base64, maxW=800, quality=0.72){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if(w > maxW){ h = h*(maxW/w); w = maxW; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = base64;
  });
}

// ============================================================
// FIREBASE SERVICE LAYER
// ============================================================

async function ensureUserDoc(uid, phone){
  const ref_ = doc(db, "users", uid);
  const snap = await getDoc(ref_);
  if(snap.exists()) return { data: snap.data(), isNew:false };
  const newUser = {
    uid, phone,
    username: "New User",
    bio: "Hey there! I am using QuickChat.",
    photoURL: "",
    online: true,
    lastSeen: serverTimestamp(),
    createdAt: serverTimestamp(),
    privacy: { hideLastSeen:false, hidePhoto:false, hideOnline:false },
    blocked: [],
    notifications: true
  };
  await setDoc(ref_, newUser);
  return { data: newUser, isNew:true };
}

async function setUserOnline(uid, online){
  try{
    await updateDoc(doc(db,"users",uid), {
      online,
      lastSeen: serverTimestamp()
    });
  }catch(e){ /* doc might not exist yet */ }
}

async function findUserByPhone(phone){
  const norm = normalizePhone(phone);
  const q = query(collection(db,"users"), where("phone","==",norm), limit(1));
  const snap = await getDocs(q);
  if(snap.empty) return null;
  return snap.docs[0].data();
}

async function getOrCreateChat(myUid, peerUid){
  const cid = chatIdFor(myUid, peerUid);
  const ref_ = doc(db,"chats",cid);
  const snap = await getDoc(ref_);
  if(!snap.exists()){
    await setDoc(ref_, {
      members: [myUid, peerUid],
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageType: "text",
      lastMessageAt: serverTimestamp(),
      lastSenderId: "",
      unread: { [myUid]: 0, [peerUid]: 0 },
      typing: { [myUid]: false, [peerUid]: false }
    });
  }
  return cid;
}

async function sendMessage(chatId, fromUid, toUid, payload){
  const msgsRef = collection(db,"chats",chatId,"messages");
  const msgData = {
    from: fromUid, to: toUid,
    type: payload.type || "text",
    text: payload.text || "",
    imageURL: payload.imageURL || "",
    replyToText: payload.replyToText || "",
    createdAt: serverTimestamp(),
    status: "sent",
    deletedForEveryone: false
  };
  await addDoc(msgsRef, msgData);
  const preview = payload.type === "image" ? "Photo" : payload.text;
  try{
    const chatSnap = await getDoc(doc(db,"chats",chatId));
    const cur = chatSnap.data()?.unread?.[toUid] || 0;
    await updateDoc(doc(db,"chats",chatId), {
      lastMessage: preview,
      lastMessageType: payload.type || "text",
      lastMessageAt: serverTimestamp(),
      lastSenderId: fromUid,
      [`unread.${toUid}`]: cur + 1,
      [`typing.${fromUid}`]: false
    });
  }catch(e){}
}

async function markChatRead(chatId, myUid){
  try{ await updateDoc(doc(db,"chats",chatId), { [`unread.${myUid}`]: 0 }); }catch(e){}
}

async function markMessagesRead(chatId, myUid){
  const msgsRef = collection(db,"chats",chatId,"messages");
  const q = query(msgsRef, where("to","==",myUid));
  const snap = await getDocs(q).catch(()=>null);
  if(!snap) return;
  const batch = writeBatch(db);
  let any=false;
  snap.forEach(d => { if(d.data().status !== "read"){ batch.update(d.ref, { status:"read" }); any=true; } });
  if(any) await batch.commit().catch(()=>{});
}

async function setTyping(chatId, uid, isTyping){
  try{ await updateDoc(doc(db,"chats",chatId), { [`typing.${uid}`]: isTyping }); }catch(e){}
}

async function deleteMessageForEveryone(chatId, msgId){
  await updateDoc(doc(db,"chats",chatId,"messages",msgId), {
    deletedForEveryone: true, text:"", imageURL:""
  });
}

async function uploadImageToStorage(base64Data, pathPrefix){
  const path = `${pathPrefix}/${Date.now()}.jpg`;
  const sref = ref(storage, path);
  await uploadString(sref, base64Data, "data_url");
  return await getDownloadURL(sref);
}

async function blockUserFn(myUid, peerUid){
  await updateDoc(doc(db,"users",myUid), { blocked: arrayUnion(peerUid) });
}
async function unblockUserFn(myUid, peerUid){
  await updateDoc(doc(db,"users",myUid), { blocked: arrayRemove(peerUid) });
}
async function reportUserFn(reporterUid, targetUid, reason){
  await addDoc(collection(db,"reports"), {
    reporterUid, targetUid, reason, createdAt: serverTimestamp()
  });
}

// ============================================================
// RENDER ENGINE
// ============================================================
function render(){
  const root = $app();
  root.innerHTML = "";
  switch(state.screen){
    case "splash": root.appendChild(renderSplash()); break;
    case "login": root.appendChild(renderLogin()); break;
    case "otp": root.appendChild(renderOtp()); break;
    case "profileSetup": root.appendChild(renderProfileSetup()); break;
    case "main": root.appendChild(renderMain()); break;
    case "chatWindow": root.appendChild(renderChatWindow()); break;
    case "newChat": root.appendChild(renderNewChat()); break;
    case "editProfile": root.appendChild(renderEditProfile()); break;
    case "privacy": root.appendChild(renderPrivacySettings()); break;
    case "peerProfile": root.appendChild(renderPeerProfile()); break;
    default: root.appendChild(renderSplash());
  }
}

function goto(screen){
  state.prevScreen = state.screen;
  state.screen = screen;
  render();
}

// ============================================================
// SCREEN: Splash
// ============================================================
function renderSplash(){
  return el(`
  <div class="screen" id="splashScreen">
    <div class="splash-logo-wrap">
      <div class="splash-mark">${ICONS.ghostMark}</div>
      <div class="splash-title">QUICKCHAT</div>
      <div class="splash-sub">SURVIVE. CHAT. CONNECT.</div>
      <div class="splash-loader"></div>
    </div>
    <div class="splash-credit">Developed By ${OWNER}</div>
  </div>`);
}

// ============================================================
// SCREEN: Login (phone entry)
// ============================================================
function renderLogin(){
  const wrap = el(`
  <div class="screen auth-screen">
    <div class="auth-top">
      <div class="auth-mark">${ICONS.ghostMark}</div>
      <div class="auth-heading">Welcome to QuickChat</div>
      <div class="auth-subtext">Enter your phone number to verify your account. QuickChat will send a one-time code via <strong style="color:var(--accent)">WhatsApp</strong>.</div>
    </div>
    <div class="field-group">
      <label class="field-label">Phone number</label>
      <div class="phone-input-row">
        <input class="country-code" id="countryCodeInput" value="${COUNTRY_CODE}">
        <input class="text-input" id="phoneInput" type="tel" placeholder="77 123 4567" inputmode="numeric">
      </div>
    </div>
    <button class="btn-primary" id="sendOtpBtn">Send verification code</button>
    <div class="auth-error" id="loginError"></div>
    <div class="auth-footnote">By continuing, you agree to QuickChat's Terms of Service and Privacy Policy.<br>Developed By ${OWNER}</div>
  </div>`);

  qs("#sendOtpBtn", wrap).addEventListener("click", async () => {
    const phoneRaw = qs("#phoneInput", wrap).value.trim();
    const cc = qs("#countryCodeInput", wrap).value.trim() || COUNTRY_CODE;
    const errBox = qs("#loginError", wrap);
    errBox.textContent = "";
    if(!phoneRaw){ errBox.textContent = "Please enter your phone number."; return; }
    let digits = phoneRaw.replace(/[^\d]/g,"");
    if(digits.startsWith("0")) digits = digits.slice(1);
    const full = cc + digits;
    const btn = qs("#sendOtpBtn", wrap);
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try{
      const verificationId = await svSendOtp(full);
      state.verificationId = verificationId;
      state.pendingPhone = full;
      goto("otp");
    }catch(e){
      console.error(e);
      errBox.textContent = e.message || "Failed to send code. Check your Worker URL and Twilio config.";
      btn.disabled = false; btn.textContent = "Send verification code";
    }
  });

  return wrap;
}

// ============================================================
// SCREEN: OTP Verification
// ============================================================
function renderOtp(){
  const wrap = el(`
  <div class="screen auth-screen">
    <div class="auth-top">
      <div class="auth-mark">${ICONS.lock}</div>
      <div class="auth-heading">Verify your number</div>
      <div class="auth-subtext">Enter the 6-digit code sent to<br><strong style="color:var(--text-primary)">${state.pendingPhone||""}</strong></div>
    </div>
    <div class="otp-boxes" id="otpBoxes">
      ${Array.from({length:6}).map((_,i)=>`<input class="otp-box" maxlength="1" inputmode="numeric" data-i="${i}">`).join("")}
    </div>
    <button class="btn-primary" id="verifyBtn">Verify & Continue</button>
    <button class="btn-ghost" id="changeNumberBtn">Change phone number</button>
    <div class="auth-error" id="otpError"></div>
  </div>`);

  const boxes = qsa(".otp-box", wrap);
  boxes.forEach((b,i)=>{
    b.addEventListener("input", () => {
      b.value = b.value.replace(/[^\d]/g,"");
      if(b.value && boxes[i+1]) boxes[i+1].focus();
    });
    b.addEventListener("keydown",(ev)=>{
      if(ev.key === "Backspace" && !b.value && boxes[i-1]) boxes[i-1].focus();
    });
  });
  setTimeout(()=> boxes[0]?.focus(), 100);

  qs("#changeNumberBtn", wrap).addEventListener("click", ()=> goto("login"));

  qs("#verifyBtn", wrap).addEventListener("click", async () => {
    const code = boxes.map(b=>b.value).join("");
    const errBox = qs("#otpError", wrap);
    if(code.length !== 6){ errBox.textContent = "Enter the full 6-digit code."; return; }
    const btn = qs("#verifyBtn", wrap);
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try{
      const verified = await svCheckOtp(state.verificationId, code);
      if(!verified) throw new Error("Code not verified");
      const uid = phoneToUid(state.pendingPhone);
      const { data, isNew } = await ensureUserDoc(uid, state.pendingPhone);
      state.currentUser = { uid, phoneNumber: state.pendingPhone };
      state.userDoc = data;
      sessionSave(uid, state.pendingPhone);
      await setUserOnline(uid, true);
      if(isNew){
        state.newUserSetup = true;
        goto("profileSetup");
      }else{
        initLiveListeners();
        goto("main");
      }
    }catch(e){
      console.error(e);
      errBox.textContent = "Incorrect code. Please try again.";
      btn.disabled = false; btn.textContent = "Verify & Continue";
    }
  });

  return wrap;
}

// ============================================================
// SCREEN: Profile Setup (new users)
// ============================================================
function renderProfileSetup(){
  const wrap = el(`
  <div class="screen auth-screen">
    <div class="auth-top">
      <div class="auth-heading">Set up your profile</div>
      <div class="auth-subtext">This is how other QuickChat users will see you.</div>
    </div>
    <div class="profile-setup-avatar" id="avatarPreviewWrap">
      <span style="color:var(--text-tertiary);font-size:13px;">Add photo</span>
      <div class="avatar-edit-badge">${ICONS.camera}</div>
    </div>
    <input type="file" id="avatarFileInput" accept="image/*" class="hidden">
    <div class="field-group">
      <label class="field-label">Your name</label>
      <input class="text-input" id="setupUsername" placeholder="Enter your name" maxlength="30">
    </div>
    <div class="field-group">
      <label class="field-label">About (bio)</label>
      <input class="text-input" id="setupBio" placeholder="Hey there! I am using QuickChat." maxlength="80">
    </div>
    <button class="btn-primary" id="finishSetupBtn">Get Started</button>
    <div class="auth-error" id="setupError"></div>
  </div>`);

  let pendingPhotoBase64 = null;

  qs("#avatarPreviewWrap", wrap).addEventListener("click", ()=> qs("#avatarFileInput", wrap).click());
  qs("#avatarFileInput", wrap).addEventListener("change", async (ev) => {
    const file = ev.target.files[0]; if(!file) return;
    const raw = await fileToBase64(file);
    const compressed = await compressImage(raw, 500, 0.75);
    pendingPhotoBase64 = compressed;
    qs("#avatarPreviewWrap", wrap).innerHTML = `<img src="${compressed}"><div class="avatar-edit-badge">${ICONS.camera}</div>`;
    qs("#avatarPreviewWrap", wrap).querySelector(".avatar-edit-badge").onclick=(e)=>{e.stopPropagation();qs("#avatarFileInput", wrap).click();};
  });

  qs("#finishSetupBtn", wrap).addEventListener("click", async () => {
    const username = qs("#setupUsername", wrap).value.trim();
    const bio = qs("#setupBio", wrap).value.trim() || "Hey there! I am using QuickChat.";
    const errBox = qs("#setupError", wrap);
    if(!username){ errBox.textContent = "Please enter your name."; return; }
    const btn = qs("#finishSetupBtn", wrap);
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
    try{
      let photoURL = "";
      if(pendingPhotoBase64){
        photoURL = await uploadImageToStorage(pendingPhotoBase64, `avatars/${state.currentUser.uid}`);
      }
      const updates = { username, bio };
      if(photoURL) updates.photoURL = photoURL;
      await updateDoc(doc(db,"users",state.currentUser.uid), updates);
      state.userDoc = { ...state.userDoc, ...updates };
      initLiveListeners();
      goto("main");
    }catch(e){
      console.error(e);
      errBox.textContent = "Something went wrong. Check your Firebase Storage setup.";
      btn.disabled = false; btn.textContent = "Get Started";
    }
  });

  return wrap;
}

// ============================================================
// LIVE LISTENERS (chats list, presence)
// ============================================================
function initLiveListeners(){
  const uid = state.currentUser.uid;

  // listen to my own user doc (privacy/profile changes reflect immediately)
  if(state.unsubscribers.myUser) state.unsubscribers.myUser();
  state.unsubscribers.myUser = onSnapshot(doc(db,"users",uid), (snap) => {
    if(snap.exists()){
      state.userDoc = snap.data();
      state.blockedUsers = state.userDoc.blocked || [];
      state.privacy = state.userDoc.privacy || state.privacy;
    }
  });

  // listen to chats where I'm a member
  if(state.unsubscribers.chats) state.unsubscribers.chats();
  const chatsQ = query(collection(db,"chats"), where("members","array-contains",uid));
  state.unsubscribers.chats = onSnapshot(chatsQ, async (snap) => {
    const chatDocs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    // resolve peer user info for each chat
    const enriched = await Promise.all(chatDocs.map(async (c) => {
      const peerUid = c.members.find(m => m !== uid);
      let peer = state.contacts.find(u => u.uid === peerUid);
      if(!peer){
        const pSnap = await getDoc(doc(db,"users",peerUid));
        peer = pSnap.exists() ? pSnap.data() : { uid:peerUid, username:"Unknown User", phone:"" };
        state.contacts.push(peer);
      }
      return { ...c, peer };
    }));
    enriched.sort((a,b) => {
      const ta = a.lastMessageAt?.toDate ? a.lastMessageAt.toDate().getTime() : 0;
      const tb = b.lastMessageAt?.toDate ? b.lastMessageAt.toDate().getTime() : 0;
      return tb - ta;
    });
    state.chats = enriched;
    if(state.screen === "main" && state.activeNav === "chats") renderMainBody();
  });

  // presence: mark offline on unload
  window.addEventListener("beforeunload", () => { setUserOnline(uid, false); });
  document.addEventListener("visibilitychange", () => {
    if(document.hidden) setUserOnline(uid, false);
    else setUserOnline(uid, true);
  });
}

function teardownChatWindowListeners(){
  if(state.unsubscribers.activeMessages){ state.unsubscribers.activeMessages(); state.unsubscribers.activeMessages=null; }
  if(state.unsubscribers.activePeer){ state.unsubscribers.activePeer(); state.unsubscribers.activePeer=null; }
  if(state.unsubscribers.activeChatMeta){ state.unsubscribers.activeChatMeta(); state.unsubscribers.activeChatMeta=null; }
}

// ============================================================
// SCREEN: Main shell (Chats / Contacts / Calls / Settings)
// ============================================================
function renderMain(){
  const wrap = el(`<div class="screen" id="mainScreen"></div>`);
  wrap.appendChild(renderMainHeader());
  const body = el(`<div class="screen-stack" id="mainBodyWrap"></div>`);
  wrap.appendChild(body);
  wrap.appendChild(renderBottomNav());
  setTimeout(renderMainBody, 0);
  return wrap;
}

function renderMainHeader(){
  const titleMap = { chats:"QUICKCHAT", contacts:"Contacts", calls:"Calls", settings:"Settings" };
  const header = el(`
  <div class="app-header">
    <div class="header-row">
      <div class="header-logo">
        ${state.activeNav==="chats" ? `<div class="header-logo-mark">${ICONS.ghostMark}</div>` : ""}
        <div class="header-logo-text">${titleMap[state.activeNav]}</div>
      </div>
      <div class="header-icons">
        ${state.activeNav==="chats" ? `<button class="icon-btn" id="headerNewChatBtn">${ICONS.newChat}</button>` : ""}
        <button class="icon-btn" id="headerMoreBtn">${ICONS.dots}</button>
      </div>
    </div>
    ${state.activeNav==="chats" || state.activeNav==="contacts" ? `
    <div class="search-bar">
      ${ICONS.search}
      <input type="text" id="mainSearchInput" placeholder="${state.activeNav==='chats' ? 'Search chats' : 'Search contacts'}">
    </div>` : ""}
  </div>`);

  const newChatBtn = qs("#headerNewChatBtn", header);
  if(newChatBtn) newChatBtn.addEventListener("click", ()=> goto("newChat"));

  qs("#headerMoreBtn", header).addEventListener("click", (e)=>{
    showSimpleMenu(e.currentTarget, [
      { label:"About QuickChat", action: showAboutModal },
      { label:"Settings", action: ()=>{ state.activeNav="settings"; render(); } },
    ]);
  });

  const searchInput = qs("#mainSearchInput", header);
  if(searchInput){
    searchInput.addEventListener("input", (e)=>{
      renderMainBody(e.target.value.trim().toLowerCase());
    });
  }
  return header;
}

function renderBottomNav(){
  const items = [
    { key:"chats", label:"Chats", icon:ICONS.chatsNav, badge: state.chats.reduce((s,c)=> s + (c.unread?.[state.currentUser.uid]||0), 0) },
    { key:"contacts", label:"Contacts", icon:ICONS.contactsNav },
    { key:"calls", label:"Calls", icon:ICONS.callsNav },
    { key:"settings", label:"Settings", icon:ICONS.settingsNav },
  ];
  const nav = el(`<div class="bottom-nav">
    ${items.map(it => `
      <button class="nav-item ${state.activeNav===it.key?'active':''}" data-key="${it.key}">
        ${it.badge ? `<span class="nav-badge">${it.badge>99?'99+':it.badge}</span>` : ""}
        ${it.icon}
        <span>${it.label}</span>
      </button>`).join("")}
  </div>`);
  qsa(".nav-item", nav).forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeNav = btn.dataset.key;
      render();
    });
  });
  return nav;
}

function renderMainBody(searchTerm=""){
  const bodyWrap = qs("#mainBodyWrap");
  if(!bodyWrap) return;
  bodyWrap.innerHTML = "";
  if(state.activeNav === "chats") bodyWrap.appendChild(renderChatsList(searchTerm));
  else if(state.activeNav === "contacts") bodyWrap.appendChild(renderContactsTab(searchTerm));
  else if(state.activeNav === "calls") bodyWrap.appendChild(renderCallsTab());
  else if(state.activeNav === "settings") bodyWrap.appendChild(renderSettingsTab());
}

// ---------------- Chats tab ----------------
function renderChatsList(searchTerm=""){
  const uid = state.currentUser.uid;
  let chats = state.chats;
  if(searchTerm){
    chats = chats.filter(c => (c.peer?.username||"").toLowerCase().includes(searchTerm) || (c.peer?.phone||"").includes(searchTerm));
  }
  const wrap = el(`<div class="scroll-body" style="position:relative;height:100%;"></div>`);
  if(chats.length === 0){
    wrap.appendChild(el(`
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.chatsNav}</div>
        <div class="empty-state-title">No chats yet</div>
        <div class="empty-state-text">Tap the new chat button and enter a phone number to start messaging on QuickChat.</div>
      </div>`));
  }else{
    chats.forEach(c => {
      const peer = c.peer;
      const isBlocked = state.blockedUsers.includes(peer.uid);
      const unread = c.unread?.[uid] || 0;
      const isMine = c.lastSenderId === uid;
      let tickIcon = "";
      if(isMine && c.lastMessage){
        tickIcon = `<span class="ticks tick-sent">${ICONS.checkDouble}</span>`;
      }
      const item = el(`
        <div class="chat-item" data-cid="${c.id}">
          ${avatarHtml({...peer, _isPeer:true})}
          ${(peer.online && !peer.privacy?.hideOnline) ? `<div class="avatar-status-dot" style="margin-left:-22px;margin-top:32px;"></div>` : ""}
          <div class="chat-item-body">
            <div class="chat-item-top">
              <div class="chat-item-name">${escapeHtml(peer.username||peer.phone||"Unknown")}</div>
              <div class="chat-item-time ${unread>0?'unread-time':''}">${formatChatListTime(c.lastMessageAt)}</div>
            </div>
            <div class="chat-item-bottom">
              <div class="chat-item-preview">${tickIcon}${escapeHtml(c.lastMessage || "Say hello 👋")}</div>
              ${unread>0 ? `<div class="unread-badge">${unread>99?'99+':unread}</div>` : ""}
            </div>
          </div>
        </div>`);
      item.addEventListener("click", () => openChat(c.id, peer));
      wrap.appendChild(item);
    });
  }
  const fab = el(`<button class="fab" id="chatsFab">${ICONS.newChat}</button>`);
  fab.addEventListener("click", ()=> goto("newChat"));
  wrap.appendChild(fab);
  return wrap;
}

// ---------------- Contacts tab ----------------
function renderContactsTab(searchTerm=""){
  const uid = state.currentUser.uid;
  let people = state.contacts.filter(c => c.uid !== uid);
  if(searchTerm){
    people = people.filter(p => (p.username||"").toLowerCase().includes(searchTerm) || (p.phone||"").includes(searchTerm));
  }
  const wrap = el(`<div class="scroll-body" style="position:relative;height:100%;"></div>`);
  wrap.appendChild(el(`
    <div class="action-row" id="newContactRow">
      <div class="action-icon-circle">${ICONS.newChat}</div>
      <div class="contact-name">New chat by phone number</div>
    </div>`));
  qs("#newContactRow",wrap).addEventListener("click", ()=> goto("newChat"));

  if(people.length){
    wrap.appendChild(el(`<div class="section-label">YOUR CONTACTS ON QUICKCHAT</div>`));
    people.forEach(p => {
      const row = el(`
        <div class="contact-item" data-uid="${p.uid}">
          ${avatarHtml({...p,_isPeer:true})}
          <div>
            <div class="contact-name">${escapeHtml(p.username||p.phone)}</div>
            <div class="contact-sub">${escapeHtml(p.bio || p.phone || "")}</div>
          </div>
        </div>`);
      row.addEventListener("click", () => openChat(chatIdFor(uid,p.uid), p, true));
      wrap.appendChild(row);
    });
  }else{
    wrap.appendChild(el(`<div class="user-search-empty">No contacts yet. Start a new chat to add someone.</div>`));
  }
  return wrap;
}

// ---------------- Calls tab (simulated log, since this is a chat app) ----------------
function renderCallsTab(){
  const wrap = el(`<div class="scroll-body" style="position:relative;height:100%;"></div>`);
  if(state.callLog.length === 0){
    wrap.appendChild(el(`
      <div class="empty-state">
        <div class="empty-state-icon">${ICONS.callsNav}</div>
        <div class="empty-state-title">No call history</div>
        <div class="empty-state-text">Voice & video calls you make on QuickChat will appear here.</div>
      </div>`));
  }else{
    state.callLog.forEach(call => {
      const icon = call.missed ? ICONS.callMissed : (call.out ? ICONS.callOut : ICONS.callIn);
      wrap.appendChild(el(`
        <div class="chat-item">
          ${avatarHtml({...call.peer,_isPeer:true})}
          <div class="chat-item-body">
            <div class="chat-item-top">
              <div class="chat-item-name" style="${call.missed?'color:var(--danger)':''}">${escapeHtml(call.peer.username)}</div>
              <div class="chat-item-time">${formatChatListTime(call.at)}</div>
            </div>
            <div class="chat-item-bottom">
              <div class="chat-item-preview">${icon} ${call.video?'Video call':'Voice call'}</div>
            </div>
          </div>
        </div>`));
    });
  }
  return wrap;
}

// ---------------- Settings tab ----------------
function renderSettingsTab(){
  const me = state.userDoc || {};
  const wrap = el(`<div class="scroll-body"></div>`);
  wrap.appendChild(el(`
    <div class="profile-banner" id="settingsProfileBanner" style="cursor:pointer;">
      ${avatarHtml(me,"avatar-lg")}
      <div class="profile-banner-name">${escapeHtml(me.username||"")}</div>
      <div class="profile-banner-phone">${escapeHtml(me.phone||"")}</div>
    </div>`));
  qs("#settingsProfileBanner",wrap).addEventListener("click", ()=> goto("editProfile"));

  const rows = [
    { icon:ICONS.profile, title:"Edit Profile", sub:"Name, photo, bio", action: ()=>goto("editProfile") },
    { icon:ICONS.lock, title:"Privacy", sub:"Last seen, photo, online status, blocked users", action: ()=>goto("privacy") },
    { icon:ICONS.bell, title:"Notifications", sub: me.notifications!==false ? "On" : "Off", toggle:true,
      get on(){ return me.notifications !== false; },
      action: async ()=>{
        await updateDoc(doc(db,"users",state.currentUser.uid), { notifications: !(me.notifications!==false) });
      }},
    { icon:ICONS.info, title:"About QuickChat", sub:"App info & WhatsApp contact", action: showAboutModal },
  ];
  const section = el(`<div class="settings-section"></div>`);
  rows.forEach(r => {
    const row = el(`
      <div class="settings-row">
        <div class="settings-row-icon">${r.icon}</div>
        <div class="settings-row-body">
          <div class="settings-row-title">${r.title}</div>
          <div class="settings-row-sub">${r.sub}</div>
        </div>
        ${r.toggle
          ? `<div class="toggle-switch ${r.on?'on':''}" id="notifToggle"><div class="toggle-knob"></div></div>`
          : `<div class="settings-row-chevron">${ICONS.chevronRight}</div>`}
      </div>`);
    row.addEventListener("click", async () => {
      await r.action();
      if(r.toggle) renderMainBody();
    });
    section.appendChild(row);
  });
  wrap.appendChild(section);
  wrap.appendChild(el(`<div class="settings-divider"></div>`));

  const logoutBtn = el(`<div class="logout-btn" id="logoutBtn">Log out</div>`);
  logoutBtn.addEventListener("click", async () => {
    showConfirmDialog("Log out of QuickChat?", "You can always log back in with your phone number.", async () => {
      await setUserOnline(state.currentUser.uid, false);
      Object.values(state.unsubscribers).forEach(unsub => { if(typeof unsub === "function") unsub(); });
      sessionClear();
      state.currentUser = null; state.userDoc = null; state.chats = []; state.contacts = [];
      goto("login");
    });
  });
  wrap.appendChild(logoutBtn);
  wrap.appendChild(el(`<div style="text-align:center;color:var(--text-tertiary);font-size:11.5px;padding:10px 0 30px;">Developed By ${OWNER}</div>`));
  return wrap;
}

// ---------------- Privacy settings ----------------
function renderPrivacySettings(){
  const wrap = el(`<div class="screen"></div>`);
  wrap.appendChild(renderSubHeader("Privacy", ()=>{ state.activeNav="settings"; goto("main"); }));
  const body = el(`<div class="scroll-body"></div>`);

  const priv = state.userDoc.privacy || {};
  const toggles = [
    { key:"hideLastSeen", title:"Hide last seen", sub:"Others won't see when you were last online" },
    { key:"hidePhoto", title:"Hide profile photo", sub:"Your profile photo will be hidden from others" },
    { key:"hideOnline", title:"Hide online status", sub:"Others won't see your green online dot" },
  ];
  body.appendChild(el(`<div class="section-label">VISIBILITY</div>`));
  toggles.forEach(t => {
    const row = el(`
      <div class="settings-row">
        <div class="settings-row-body">
          <div class="settings-row-title">${t.title}</div>
          <div class="settings-row-sub">${t.sub}</div>
        </div>
        <div class="toggle-switch ${priv[t.key]?'on':''}" data-key="${t.key}"><div class="toggle-knob"></div></div>
      </div>`);
    row.addEventListener("click", async () => {
      const newVal = !priv[t.key];
      priv[t.key] = newVal;
      await updateDoc(doc(db,"users",state.currentUser.uid), { [`privacy.${t.key}`]: newVal });
      renderPrivacyBody();
    });
    body.appendChild(row);
  });

  body.appendChild(el(`<div class="settings-divider"></div>`));
  body.appendChild(el(`<div class="section-label">BLOCKED USERS</div>`));
  const blockedWrap = el(`<div id="blockedListWrap"></div>`);
  body.appendChild(blockedWrap);

  wrap.appendChild(body);

  async function renderPrivacyBody(){
    const idx = qsa(".toggle-switch", body);
    idx.forEach(t => t.classList.toggle("on", !!priv[t.dataset.key]));
    blockedWrap.innerHTML = "";
    if(!state.blockedUsers.length){
      blockedWrap.appendChild(el(`<div class="user-search-empty">No blocked users.</div>`));
      return;
    }
    for(const bUid of state.blockedUsers){
      let p = state.contacts.find(c=>c.uid===bUid);
      if(!p){
        const s = await getDoc(doc(db,"users",bUid));
        p = s.exists() ? s.data() : { uid:bUid, username:"Unknown User" };
      }
      const row = el(`
        <div class="contact-item">
          ${avatarHtml(p)}
          <div style="flex:1;">
            <div class="contact-name">${escapeHtml(p.username)}</div>
            <div class="contact-sub">${escapeHtml(p.phone||"")}</div>
          </div>
          <button class="btn-ghost" style="width:auto;color:var(--danger);" data-unblock="${bUid}">Unblock</button>
        </div>`);
      row.querySelector("[data-unblock]").addEventListener("click", async (e) => {
        e.stopPropagation();
        await unblockUserFn(state.currentUser.uid, bUid);
        showToast("User unblocked");
        renderPrivacyBody();
      });
      blockedWrap.appendChild(row);
    }
  }
  setTimeout(renderPrivacyBody, 0);
  return wrap;
}

// ---------------- Edit profile ----------------
function renderEditProfile(){
  const me = state.userDoc;
  const wrap = el(`<div class="screen"></div>`);
  wrap.appendChild(renderSubHeader("Edit Profile", ()=>{ state.activeNav="settings"; goto("main"); }));
  const body = el(`<div class="scroll-body" style="padding:24px 20px;"></div>`);

  const avatarWrap = el(`
    <div class="profile-setup-avatar" id="editAvatarWrap" style="cursor:pointer;">
      ${me.photoURL ? `<img src="${me.photoURL}">` : `<span style="font-size:30px;font-weight:700;color:var(--text-secondary);">${initials(me.username)}</span>`}
      <div class="avatar-edit-badge">${ICONS.camera}</div>
    </div>`);
  body.appendChild(avatarWrap);
  const fileInput = el(`<input type="file" accept="image/*" class="hidden" id="editAvatarFile">`);
  body.appendChild(fileInput);
  let newPhotoBase64 = null;
  avatarWrap.addEventListener("click", ()=> fileInput.click());
  fileInput.addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if(!f) return;
    const raw = await fileToBase64(f);
    newPhotoBase64 = await compressImage(raw, 500, 0.75);
    avatarWrap.innerHTML = `<img src="${newPhotoBase64}"><div class="avatar-edit-badge">${ICONS.camera}</div>`;
  });

  body.appendChild(el(`
    <div class="field-group" style="margin-top:20px;">
      <label class="field-label">Name</label>
      <input class="text-input" id="editUsername" value="${escapeHtml(me.username||"")}" maxlength="30">
    </div>`));
  body.appendChild(el(`
    <div class="field-group">
      <label class="field-label">About</label>
      <input class="text-input" id="editBio" value="${escapeHtml(me.bio||"")}" maxlength="80">
    </div>`));
  body.appendChild(el(`
    <div class="field-group">
      <label class="field-label">Phone number</label>
      <input class="text-input" value="${escapeHtml(me.phone||"")}" disabled style="opacity:.55;">
    </div>`));

  const saveBtn = el(`<button class="btn-primary" id="saveProfileBtn">Save changes</button>`);
  saveBtn.addEventListener("click", async () => {
    const username = qs("#editUsername",body).value.trim();
    const bio = qs("#editBio",body).value.trim();
    if(!username){ showToast("Name can't be empty"); return; }
    saveBtn.disabled = true; saveBtn.innerHTML = `<span class="spinner"></span>`;
    try{
      const updates = { username, bio };
      if(newPhotoBase64){
        updates.photoURL = await uploadImageToStorage(newPhotoBase64, `avatars/${state.currentUser.uid}`);
      }
      await updateDoc(doc(db,"users",state.currentUser.uid), updates);
      showToast("Profile updated");
      state.activeNav = "settings";
      goto("main");
    }catch(e){
      console.error(e);
      showToast("Failed to save. Check Firebase Storage setup.");
      saveBtn.disabled = false; saveBtn.textContent = "Save changes";
    }
  });
  body.appendChild(saveBtn);
  wrap.appendChild(body);
  return wrap;
}

// ---------------- Sub header helper ----------------
function renderSubHeader(title, onBack, rightHtml=""){
  const h = el(`
    <div class="sub-header">
      <button class="back-btn">${ICONS.back}</button>
      <div class="sub-header-title">${title}</div>
      ${rightHtml}
    </div>`);
  qs(".back-btn", h).addEventListener("click", onBack);
  return h;
}

// ---------------- About modal ----------------
function showAboutModal(){
  const overlay = el(`
    <div class="modal-overlay" id="aboutOverlay">
      <div class="modal-card">
        <div class="auth-mark">${ICONS.ghostMark}</div>
        <div class="modal-title">QUICKCHAT</div>
        <div class="modal-line">QuickChat Official Chat App</div>
        <div class="modal-line">Owner: ${OWNER}</div>
        <div class="modal-contact">
          <div class="modal-line" style="font-weight:700;">WhatsApp Contact</div>
          ${WHATSAPP_CONTACTS.map(n=>`<div class="modal-contact-num">${n}</div>`).join("")}
        </div>
        <button class="modal-close" id="closeAboutBtn">Close</button>
      </div>
    </div>`);
  overlay.addEventListener("click",(e)=>{ if(e.target===overlay) overlay.remove(); });
  qs("#closeAboutBtn",overlay).addEventListener("click", ()=> overlay.remove());
  $app().appendChild(overlay);
}

// ---------------- Simple dropdown menu ----------------
function showSimpleMenu(anchorEl, items){
  const existing = qs(".ctx-overlay"); if(existing) existing.remove();
  const overlay = el(`<div class="ctx-overlay"></div>`);
  const rect = anchorEl.getBoundingClientRect();
  const appRect = $app().getBoundingClientRect();
  const menu = el(`<div class="ctx-menu"></div>`);
  menu.style.top = (rect.bottom - appRect.top + 4) + "px";
  menu.style.right = (appRect.right - rect.right) + "px";
  items.forEach(it => {
    const row = el(`<div class="ctx-menu-item ${it.danger?'danger':''}">${it.label}</div>`);
    row.addEventListener("click", ()=>{ overlay.remove(); it.action(); });
    menu.appendChild(row);
  });
  overlay.appendChild(menu);
  overlay.addEventListener("click",(e)=>{ if(e.target===overlay) overlay.remove(); });
  $app().appendChild(overlay);
}

// ---------------- Confirm dialog (reusable) ----------------
function showConfirmDialog(title, msg, onConfirm, confirmLabel="Confirm", danger=true){
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal-card">
        <div class="modal-title" style="margin-bottom:10px;">${title}</div>
        <div class="modal-line">${msg}</div>
        <div style="display:flex;gap:10px;margin-top:20px;">
          <button class="btn-ghost" id="cancelDialogBtn" style="background:var(--bg-input);border-radius:8px;">Cancel</button>
          <button class="btn-primary" id="confirmDialogBtn" style="${danger?'background:linear-gradient(135deg,#ff5c5c,#c43f3f);color:#fff;':''}">${confirmLabel}</button>
        </div>
      </div>
    </div>`);
  qs("#cancelDialogBtn",overlay).addEventListener("click", ()=> overlay.remove());
  qs("#confirmDialogBtn",overlay).addEventListener("click", ()=>{ overlay.remove(); onConfirm(); });
  $app().appendChild(overlay);
}

// ============================================================
// SCREEN: New Chat (search by phone number)
// ============================================================
function renderNewChat(){
  const wrap = el(`<div class="screen"></div>`);
  wrap.appendChild(renderSubHeader("New Chat", ()=> goto("main")));
  const body = el(`<div class="scroll-body"></div>`);
  body.appendChild(el(`
    <div class="search-bar" style="margin:14px;">
      ${ICONS.search}
      <input type="tel" id="newChatPhoneInput" placeholder="Enter phone number e.g. 0771234567">
    </div>`));
  const resultsWrap = el(`<div id="newChatResults"></div>`);
  body.appendChild(resultsWrap);
  wrap.appendChild(body);

  resultsWrap.appendChild(el(`<div class="user-search-empty">Enter a QuickChat user's phone number to start chatting.</div>`));

  let debounceT = null;
  qs("#newChatPhoneInput", body).addEventListener("input", (e) => {
    clearTimeout(debounceT);
    const val = e.target.value.trim();
    debounceT = setTimeout(async () => {
      resultsWrap.innerHTML = "";
      if(!val){
        resultsWrap.appendChild(el(`<div class="user-search-empty">Enter a QuickChat user's phone number to start chatting.</div>`));
        return;
      }
      resultsWrap.appendChild(el(`<div class="user-search-empty"><span class="spinner spinner-light" style="display:inline-block;"></span></div>`));
      const found = await findUserByPhone(val);
      resultsWrap.innerHTML = "";
      if(!found){
        resultsWrap.appendChild(el(`<div class="user-search-empty">No QuickChat user found with this number.<br>Make sure they've signed up first.</div>`));
        return;
      }
      if(found.uid === state.currentUser.uid){
        resultsWrap.appendChild(el(`<div class="user-search-empty">This is your own number 🙂</div>`));
        return;
      }
      if(!state.contacts.find(c=>c.uid===found.uid)) state.contacts.push(found);
      const row = el(`
        <div class="contact-item">
          ${avatarHtml({...found,_isPeer:true})}
          <div style="flex:1;">
            <div class="contact-name">${escapeHtml(found.username)}</div>
            <div class="contact-sub">${escapeHtml(found.phone)}</div>
          </div>
        </div>`);
      row.addEventListener("click", () => openChat(chatIdFor(state.currentUser.uid,found.uid), found, true));
      resultsWrap.appendChild(row);
    }, 450);
  });

  setTimeout(()=> qs("#newChatPhoneInput", body)?.focus(), 150);
  return wrap;
}

// ============================================================
// SCREEN: Peer profile (tap chat header)
// ============================================================
function renderPeerProfile(){
  const peer = state.activeChatPeer;
  const wrap = el(`<div class="screen"></div>`);
  wrap.appendChild(renderSubHeader("Contact Info", ()=> goto("chatWindow")));
  const body = el(`<div class="scroll-body"></div>`);
  body.appendChild(el(`
    <div class="profile-banner">
      ${avatarHtml({...peer,_isPeer:true},"avatar-lg")}
      <div class="profile-banner-name">${escapeHtml(peer.username)}</div>
      <div class="profile-banner-phone">${escapeHtml(peer.phone||"")}</div>
    </div>`));
  body.appendChild(el(`
    <div class="settings-section">
      <div class="settings-row" style="cursor:default;">
        <div class="settings-row-icon">${ICONS.info}</div>
        <div class="settings-row-body">
          <div class="settings-row-title">About</div>
          <div class="settings-row-sub">${escapeHtml(peer.bio||"Hey there! I am using QuickChat.")}</div>
        </div>
      </div>
    </div>`));

  const isBlocked = state.blockedUsers.includes(peer.uid);
  const actions = el(`<div class="settings-section"></div>`);
  const blockRow = el(`
    <div class="settings-row">
      <div class="settings-row-icon" style="color:var(--danger);">${ICONS.block}</div>
      <div class="settings-row-body"><div class="settings-row-title" style="color:var(--danger);">${isBlocked?'Unblock':'Block'} ${escapeHtml(peer.username)}</div></div>
    </div>`);
  blockRow.addEventListener("click", () => {
    if(isBlocked){
      unblockUserFn(state.currentUser.uid, peer.uid).then(()=> showToast("User unblocked"));
    }else{
      showConfirmDialog(`Block ${peer.username}?`, "Blocked users can't send you messages or see your online status.", async ()=>{
        await blockUserFn(state.currentUser.uid, peer.uid);
        showToast("User blocked");
      });
    }
  });
  actions.appendChild(blockRow);

  const reportRow = el(`
    <div class="settings-row">
      <div class="settings-row-icon" style="color:var(--warn);">${ICONS.flag}</div>
      <div class="settings-row-body"><div class="settings-row-title" style="color:var(--warn);">Report ${escapeHtml(peer.username)}</div></div>
    </div>`);
  reportRow.addEventListener("click", () => {
    showConfirmDialog("Report this user?", "QuickChat will review this account for spam, abuse, or policy violations.", async ()=>{
      await reportUserFn(state.currentUser.uid, peer.uid, "Reported from chat profile");
      showToast("Report submitted");
    }, "Report");
  });
  actions.appendChild(reportRow);
  body.appendChild(actions);

  wrap.appendChild(body);
  return wrap;
}

// ============================================================
// CHAT WINDOW
// ============================================================
async function openChat(chatId, peer, isNew=false){
  teardownChatWindowListeners();
  state.activeChatId = chatId;
  state.activeChatPeer = peer;
  state.messages = [];
  state.replyTo = null;
  state.selectedImageBase64 = null;
  state.selectedImagePreview = null;

  if(isNew){
    await getOrCreateChat(state.currentUser.uid, peer.uid);
  }
  goto("chatWindow");
}

function renderChatWindow(){
  const peer = state.activeChatPeer;
  const uid = state.currentUser.uid;
  const isBlocked = state.blockedUsers.includes(peer.uid);
  const wrap = el(`<div class="screen"></div>`);

  // ---- header
  const header = el(`
    <div class="sub-header">
      <button class="back-btn">${ICONS.back}</button>
      <div class="chat-window-header" id="chatHeaderInfo">
        ${avatarHtml({...peer,_isPeer:true})}
        <div>
          <div class="chat-window-name">${escapeHtml(peer.username||peer.phone)}</div>
          <div class="chat-window-status" id="chatPeerStatus">...</div>
        </div>
      </div>
      <button class="icon-btn" id="chatMoreBtn">${ICONS.dots}</button>
    </div>`);
  qs(".back-btn",header).addEventListener("click", () => { teardownChatWindowListeners(); state.activeNav="chats"; goto("main"); });
  qs("#chatHeaderInfo",header).addEventListener("click", ()=> goto("peerProfile"));
  qs("#chatMoreBtn",header).addEventListener("click",(e)=>{
    showSimpleMenu(e.currentTarget, [
      { label:"View contact", action: ()=>goto("peerProfile") },
      { label: isBlocked?"Unblock":"Block", danger:true, action: () => {
          if(isBlocked) unblockUserFn(uid,peer.uid).then(()=>showToast("Unblocked"));
          else showConfirmDialog(`Block ${peer.username}?`,"They won't be able to message you.",async()=>{ await blockUserFn(uid,peer.uid); showToast("Blocked"); });
        }},
      { label:"Report", danger:true, action: () => {
          showConfirmDialog("Report this user?","QuickChat will review this account.",async()=>{ await reportUserFn(uid,peer.uid,"Reported from chat"); showToast("Report submitted"); },"Report");
        }},
    ]);
  });
  wrap.appendChild(header);

  // ---- messages area
  const msgArea = el(`<div class="messages-area" id="msgArea"></div>`);
  wrap.appendChild(msgArea);

  // ---- attach preview bar (hidden by default)
  const attachBar = el(`<div class="attach-preview-bar hidden" id="attachPreviewBar"></div>`);
  wrap.appendChild(attachBar);

  // ---- emoji panel (hidden)
  const emojiPanel = el(`<div class="emoji-panel hidden" id="emojiPanel">
    ${EMOJI_LIST.map(e=>`<span>${e}</span>`).join("")}
  </div>`);

  // ---- composer
  const composer = el(`
    <div class="composer">
      <button class="composer-icon-btn" id="emojiToggleBtn">${ICONS.emoji}</button>
      <div class="composer-input-wrap">
        <textarea class="composer-textarea" id="msgInput" placeholder="${isBlocked ? 'You blocked this user' : 'Type a message'}" rows="1" ${isBlocked?'disabled':''}></textarea>
        <button class="composer-icon-btn" id="attachBtn" ${isBlocked?'disabled':''}>${ICONS.attach}</button>
        <input type="file" id="imgFileInput" accept="image/*" class="hidden">
      </div>
      <button class="send-btn" id="sendBtn" ${isBlocked?'disabled':''}>${ICONS.send}</button>
    </div>`);

  wrap.appendChild(emojiPanel);
  wrap.appendChild(composer);

  // ---- emoji toggle
  qs("#emojiToggleBtn",composer).addEventListener("click", () => {
    emojiPanel.classList.toggle("hidden");
  });
  qsa("span", emojiPanel).forEach(span => {
    span.addEventListener("click", () => {
      const ta = qs("#msgInput", composer);
      ta.value += span.textContent;
      ta.focus();
      autoGrow(ta);
    });
  });

  // ---- textarea auto-grow + typing indicator
  const textarea = qs("#msgInput", composer);
  function autoGrow(ta){ ta.style.height="auto"; ta.style.height = Math.min(ta.scrollHeight,100)+"px"; }
  textarea.addEventListener("input", () => {
    autoGrow(textarea);
    if(isBlocked) return;
    setTyping(state.activeChatId, uid, textarea.value.length>0);
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(()=> setTyping(state.activeChatId, uid, false), 2000);
  });

  // ---- image attach
  qs("#attachBtn",composer)?.addEventListener("click", () => qs("#imgFileInput",composer).click());
  qs("#imgFileInput",composer)?.addEventListener("change", async (ev) => {
    const file = ev.target.files[0]; if(!file) return;
    const raw = await fileToBase64(file);
    const compressed = await compressImage(raw, 1000, 0.75);
    state.selectedImageBase64 = compressed;
    state.selectedImagePreview = compressed;
    attachBar.classList.remove("hidden");
    attachBar.innerHTML = `
      <img src="${compressed}">
      <div class="attach-info">Photo ready to send</div>
      <div class="attach-cancel" id="cancelAttachBtn">Remove</div>`;
    qs("#cancelAttachBtn",attachBar).addEventListener("click", ()=>{
      state.selectedImageBase64=null; state.selectedImagePreview=null;
      attachBar.classList.add("hidden"); attachBar.innerHTML="";
      qs("#imgFileInput",composer).value = "";
    });
  });

  // ---- send
  async function handleSend(){
    if(isBlocked) return;
    const text = textarea.value.trim();
    const hasImage = !!state.selectedImageBase64;
    if(!text && !hasImage) return;
    const sendBtn = qs("#sendBtn", composer);
    sendBtn.disabled = true;
    try{
      if(hasImage){
        const url = await uploadImageToStorage(state.selectedImageBase64, `chatImages/${state.activeChatId}`);
        await sendMessage(state.activeChatId, uid, peer.uid, { type:"image", imageURL:url, text });
        state.selectedImageBase64=null; state.selectedImagePreview=null;
        attachBar.classList.add("hidden"); attachBar.innerHTML="";
      }else{
        await sendMessage(state.activeChatId, uid, peer.uid, { type:"text", text });
      }
      textarea.value=""; autoGrow(textarea);
      clearTimeout(state.typingTimeout);
      setTyping(state.activeChatId, uid, false);
    }catch(e){
      console.error(e);
      showToast("Failed to send message");
    }
    sendBtn.disabled = false;
  }
  qs("#sendBtn",composer).addEventListener("click", handleSend);
  textarea.addEventListener("keydown",(ev)=>{
    if(ev.key==="Enter" && !ev.shiftKey){ ev.preventDefault(); handleSend(); }
  });

  setTimeout(()=> initChatWindowListeners(), 0);
  return wrap;
}

function initChatWindowListeners(){
  const chatId = state.activeChatId;
  const uid = state.currentUser.uid;
  const peer = state.activeChatPeer;

  markChatRead(chatId, uid);
  markMessagesRead(chatId, uid);

  // peer presence live
  state.unsubscribers.activePeer = onSnapshot(doc(db,"users",peer.uid), (snap) => {
    if(!snap.exists()) return;
    const data = snap.data();
    state.activeChatPeer = data;
    const statusEl = qs("#chatPeerStatus");
    if(statusEl){
      if(state.typingPeer){
        statusEl.textContent = "typing...";
        statusEl.classList.add("online");
      }else{
        const label = lastSeenLabel(data);
        statusEl.textContent = label;
        statusEl.classList.toggle("online", data.online && !data.privacy?.hideOnline);
      }
    }
  });

  // chat meta (typing indicator)
  state.unsubscribers.activeChatMeta = onSnapshot(doc(db,"chats",chatId), (snap) => {
    if(!snap.exists()) return;
    const data = snap.data();
    state.typingPeer = !!data.typing?.[peer.uid];
    const statusEl = qs("#chatPeerStatus");
    if(statusEl){
      if(state.typingPeer){
        statusEl.textContent = "typing...";
        statusEl.classList.add("online");
      }else{
        const label = lastSeenLabel(state.activeChatPeer);
        statusEl.textContent = label;
        statusEl.classList.toggle("online", state.activeChatPeer.online && !state.activeChatPeer.privacy?.hideOnline);
      }
    }
    renderTypingRow();
  });

  // messages live
  const msgsQ = query(collection(db,"chats",chatId,"messages"), orderBy("createdAt","asc"));
  state.unsubscribers.activeMessages = onSnapshot(msgsQ, (snap) => {
    state.messages = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderMessagesArea();
    markMessagesRead(chatId, uid);
  });
}

function renderTypingRow(){
  const area = qs("#msgArea");
  if(!area) return;
  const existingTyping = qs("#typingRow", area);
  if(state.typingPeer && !existingTyping){
    area.appendChild(el(`<div class="typing-row" id="typingRow"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`));
    area.scrollTop = area.scrollHeight;
  }else if(!state.typingPeer && existingTyping){
    existingTyping.remove();
  }
}

function renderMessagesArea(){
  const area = qs("#msgArea");
  if(!area) return;
  const uid = state.currentUser.uid;
  const wasAtBottom = area.scrollTop + area.clientHeight >= area.scrollHeight - 60;
  area.innerHTML = "";

  let lastDate = null;
  state.messages.forEach(m => {
    const d = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
    const dateKey = d.toDateString();
    if(dateKey !== lastDate){
      area.appendChild(el(`<div class="date-chip-wrap"><div class="date-chip">${formatDateChip(d)}</div></div>`));
      lastDate = dateKey;
    }
    const isOut = m.from === uid;
    const row = el(`<div class="msg-row ${isOut?'out':'in'}" data-mid="${m.id}"></div>`);

    if(m.deletedForEveryone){
      row.appendChild(el(`<div class="msg-bubble deleted">🚫 This message was deleted</div>`));
    }else{
      const bubble = el(`<div class="msg-bubble"></div>`);
      if(m.type === "image" && m.imageURL){
        const img = el(`<img class="msg-img" src="${m.imageURL}">`);
        img.addEventListener("click", ()=> openImageViewer(m.imageURL));
        bubble.appendChild(img);
      }
      if(m.text){
        bubble.appendChild(el(`<div class="msg-text-content">${escapeHtml(m.text)}</div>`));
      }
      const ticks = isOut ? `<span class="ticks ${m.status==='read'?'tick-read':'tick-sent'}">${ICONS.checkDouble}</span>` : "";
      bubble.appendChild(el(`<div class="msg-meta"><span class="msg-time">${formatTime(d)}</span>${ticks}</div>`));
      row.appendChild(bubble);

      // long-press / context menu for own messages (delete for everyone)
      let pressTimer = null;
      const startPress = () => { pressTimer = setTimeout(()=> showMessageMenu(row, m, isOut), 480); };
      const cancelPress = () => clearTimeout(pressTimer);
      row.addEventListener("touchstart", startPress);
      row.addEventListener("touchend", cancelPress);
      row.addEventListener("touchmove", cancelPress);
      row.addEventListener("mousedown", startPress);
      row.addEventListener("mouseup", cancelPress);
      row.addEventListener("mouseleave", cancelPress);
    }
    area.appendChild(row);
  });

  if(state.typingPeer){
    area.appendChild(el(`<div class="typing-row" id="typingRow"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`));
  }

  if(wasAtBottom || state.messages.length <= 1) area.scrollTop = area.scrollHeight;
}

function showMessageMenu(rowEl, msg, isOut){
  const items = [
    { label:"Copy", action: () => { navigator.clipboard?.writeText(msg.text||""); showToast("Copied"); } },
  ];
  if(isOut){
    items.push({ label:"Delete for everyone", danger:true, action: () => {
      showConfirmDialog("Delete message?", "This message will be deleted for everyone in this chat.", async () => {
        await deleteMessageForEveryone(state.activeChatId, msg.id);
      }, "Delete");
    }});
  }
  showSimpleMenu(rowEl, items);
}

function openImageViewer(url){
  const v = el(`
    <div class="img-viewer">
      <div class="img-viewer-close">${ICONS.close}</div>
      <img src="${url}">
    </div>`);
  qs(".img-viewer-close",v).addEventListener("click", ()=> v.remove());
  v.addEventListener("click",(e)=>{ if(e.target===v) v.remove(); });
  document.body.appendChild(v);
}

// ============================================================
// APP BOOT
// ============================================================
async function boot(){
  render(); // splash first

  // Try restoring session from localStorage (replaces Firebase onAuthStateChanged)
  const session = sessionLoad();
  if(session){
    try{
      const snap = await getDoc(doc(db, "users", session.uid));
      if(snap.exists()){
        state.currentUser = { uid: session.uid, phoneNumber: session.phone };
        state.userDoc = snap.data();
        state.blockedUsers = state.userDoc.blocked || [];
        state.privacy = state.userDoc.privacy || state.privacy;
        await setUserOnline(session.uid, true);
        initLiveListeners();
        goto("main");
        return;
      }
    }catch(e){
      console.error("Session restore failed", e);
      sessionClear();
    }
  }

  // No session — go to login after splash
  setTimeout(() => {
    if(state.screen === "splash") goto("login");
  }, 1200);
}

boot();
