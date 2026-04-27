# 🔍 Project Audit Report

## ✅ Overview

This audit covers all backend and frontend source files (excluding lockfiles/assets).
Frontend build, linting, and backend syntax checks were executed.

---

# 🚨 Critical Issues

## 1. Authentication Bypass (User Impersonation)

**Problem:**
The server trusts `uid` sent from the client.

**Location:**

* Backend/wss/Main.js (line 295, 392)

**Impact:**
Attackers can impersonate any user (including host) and perform privileged actions.

**Fix:**

```js
const decoded = await auth.verifyIdToken(data.idToken);
ws.userId = decoded.uid;
```

---

## 2. Unauthorized Access to Room State

**Problem:**
Sockets can request shared state without membership validation.

**Location:**

* Backend/wss/Main.js (line 347)

**Impact:**
Sensitive room data/code can be accessed by unauthorized users.

**Fix:**

```js
const room = rooms[roomId];
if (!room?.state?.players?.[ws.userId]) throw new Error("Forbidden");
if (ws.roomId && ws.roomId !== roomId) throw new Error("Room mismatch");
```

---

## 3. Unsafe Code Execution (Docker)

**Problem:**
Containers lack isolation limits.

**Location:**

* Backend/index.js (line 193)

**Impact:**
Risk of system abuse, DoS, or container escape attempts.

**Fix:**

```bash
--network none
--cpus 0.5
--memory 256m
--pids-limit 128
--read-only
--cap-drop ALL
--security-opt no-new-privileges
```

---

# ⚠️ High Priority Issues

## 4. Host Disconnect Deadlock

**Problem:**
No host reassignment when host disconnects.

**Location:**

* Backend/wss/Main.js (line 539)

**Impact:**
Rooms can become permanently stuck.

**Fix:**
Transfer host to oldest active player when host disconnects.

---

## 5. Invalid React Hook Usage

**Problem:**
Hooks are used conditionally.

**Location:**

* Votingpage.jsx (line 30)
* EmergencyMeetingPage.jsx (line 52)

**Impact:**
Runtime crashes due to hook order mismatch.

**Fix:**
Always call hooks at top level.

---

## 6. Tasks Not Displaying Correctly

**Problem:**
Incorrect data passed to components.

**Location:**

* Editor/Index.jsx (line 82)
* Editor/Leftpage.jsx (line 27)

**Fix:**

```js
const roleKey = data?.players?.[currentUser?.uid]?.role === "Imposter" ? "imposter" : "player";
setTaskData(tasks?.[roleKey] || null);
```

---

# ⚙️ Medium Issues

## 7. No Acknowledgment in Socket Actions

**Problem:**
Using fire-and-forget messaging.

**Impact:**
UI may freeze or fail silently.

**Fix:**
Use request-response pattern (`sendRequest`).

---

## 8. Timeout Memory Leak

**Location:**

* Main/Room.jsx (line 264)

**Fix:**

```js
const timeout = setTimeout(...);
return () => clearTimeout(timeout);
```

---

## 9. Hardcoded WebSocket URL

**Problem:**
`ws://localhost:5001` is hardcoded.

**Impact:**
Breaks in production.

**Fix:**
Use environment variables and `wss://`.

---

## 10. Unwanted Files in Repo

**Problem:**
Temporary files committed.

**Fix:**

* Remove files
* Add `.gitignore`

---

## 11. Legacy Firebase Code

**Problem:**
Unused/unfinished modules exist.

**Impact:**
Confusion and maintenance risk.

**Fix:**
Remove or fully integrate.

---

# 🚀 Performance Issues

## Large Bundle Size

* JS: ~2.99 MB
* CSS: ~609 KB

**Impact:**
Slow load times.

**Fix:**

* Lazy load heavy components
* Split bundles
* Optimize dependencies

---

# 📊 Summary of Critical Risks

* ❌ No real authentication (major security flaw)
* ❌ Unauthorized access to room state
* ❌ Unsafe execution of user code
* ❌ React hook misuse causing crashes
* ❌ No host failover mechanism

---

# 🧪 Verification Results

* ✅ Frontend build: PASSED
* ⚠️ Lint: 25 errors, 8 warnings
* ✅ Backend syntax: PASSED

---

# 🎯 Final Recommendation

Before adding new features:

1. Fix authentication immediately
2. Secure container execution
3. Resolve React hook errors
4. Implement proper state + role validation

---

💡 *This project has strong potential, but security and stability fixes should be prioritized before scaling.*
