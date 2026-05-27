# Finance CRM - Desktop Application Proposal

**Prepared by:** Development Team
**Date:** 14th March, 2026
**Version:** 1.0

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Why a Desktop Application?](#2-why-a-desktop-application)
3. [Available Approaches](#3-available-approaches)
   - [Option A: Progressive Web App (PWA)](#option-a-progressive-web-app-pwa---recommended)
   - [Option B: Electron Desktop App](#option-b-electron-desktop-app)
   - [Option C: Tauri Desktop App](#option-c-tauri-desktop-app)
4. [Side-by-Side Comparison](#4-side-by-side-comparison)
5. [Persistent Login (Stay Logged In)](#5-persistent-login-stay-logged-in)
6. [Our Recommendation](#6-our-recommendation)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Frequently Asked Questions](#8-frequently-asked-questions)

---

## 1. Introduction

The Finance CRM is currently a web-based application that employees access through a web browser (Chrome, Edge, etc.). The client has requested the ability to provide employees with a **downloadable desktop application** so they can use the CRM like any other installed software on their computers.

This document outlines the available approaches to achieve this, along with their pros, cons, costs, and our recommendation.

---

## 2. Why a Desktop Application?

A desktop application offers several advantages for employees:

- **Quick Access** - Employees can launch the CRM directly from their desktop or taskbar, just like any other app (MS Excel, Tally, etc.)
- **No Browser Distractions** - The app runs in its own window, separate from browser tabs
- **Persistent Login** - Employees can stay logged in across system restarts, removing the need to enter credentials every time
- **Professional Feel** - A dedicated app icon and window gives a more polished, professional appearance
- **Offline Capabilities** - Some approaches allow limited offline functionality (viewing cached data, etc.)

---

## 3. Available Approaches

### Option A: Progressive Web App (PWA) - RECOMMENDED

#### What is it?
A PWA (Progressive Web App) is a technology that allows a website to behave like a native desktop application. Employees can "install" the CRM directly from their browser, and it will appear as a standalone app on their desktop and taskbar.

#### How does it work for employees?
1. Employee opens the CRM website in Chrome or Edge browser
2. They see an "Install App" button or browser prompt
3. They click "Install"
4. The CRM app icon appears on their Desktop and Taskbar
5. From now on, they simply double-click the icon to open the CRM
6. The app opens in its own window (no browser address bar, no tabs)
7. They stay logged in - no need to enter password every time

#### What it looks like:
- The app has its own icon on the Desktop and Windows Taskbar
- Opens in a clean, standalone window (no browser chrome/tabs visible)
- Looks and feels like a regular desktop application
- The app name "Finance CRM" appears in the window title and taskbar

#### Development Effort:
- **Timeline:** 2-3 days
- **Changes Required:** Minimal - adding a configuration file and a service worker to the existing application
- **Risk:** Very Low - no changes to existing functionality

#### Advantages:
- **Fastest to implement** - minimal code changes needed
- **Zero distribution hassle** - no `.exe` file to distribute, employees install from the browser
- **Automatic updates** - whenever the web app is updated, the desktop app updates automatically. No need to send new `.exe` files to employees
- **No installation permissions needed** - employees don't need admin rights on their computer to install
- **Works on all platforms** - Windows, Mac, and Linux without separate builds
- **No additional hosting cost** - uses the same server as the web app
- **Small footprint** - does not take significant disk space (under 5 MB)

#### Limitations:
- Requires an internet connection to work (same as the current web app)
- Limited access to system-level features (e.g., cannot read/write arbitrary files on the computer)
- First-time installation still requires opening a browser

---

### Option B: Electron Desktop App

#### What is it?
Electron is a framework that packages a web application inside a dedicated browser engine (Chromium) to create a standalone `.exe` file. Apps like Visual Studio Code, Slack, Microsoft Teams, and WhatsApp Desktop are built with Electron.

#### How does it work for employees?
1. Development team builds an `.exe` installer file
2. The file is shared with employees (via email, shared drive, etc.)
3. Employees download and run the installer (may need admin permissions)
4. The CRM app is installed on their computer
5. They launch it from the Desktop or Start Menu

#### Development Effort:
- **Timeline:** 1-2 weeks
- **Changes Required:** Moderate - need to create Electron wrapper, configure build pipeline, set up auto-updater, code signing
- **Risk:** Low-Medium - need to handle packaging, distribution, and updates

#### Advantages:
- **True native feel** - behaves exactly like any other installed Windows application
- **Full system access** - can interact with the file system, system tray, notifications, etc.
- **Offline potential** - can be designed to work partially offline
- **Familiar distribution** - employees are used to installing `.exe` files

#### Limitations:
- **Large file size** - the installer will be 150-200 MB because it bundles an entire browser engine
- **Manual updates** - need to build and distribute a new `.exe` for every update, or implement auto-update mechanism (additional development)
- **Windows only by default** - separate builds needed for Mac (.dmg) and Linux (.AppImage)
- **Admin permissions** - employees may need administrator rights to install
- **Higher memory usage** - each running instance uses 200-500 MB RAM
- **Code signing cost** - to avoid Windows "Unknown Publisher" warnings, a code signing certificate is needed (approximately $200-500/year)
- **Ongoing maintenance** - need to maintain the Electron wrapper alongside the web app

---

### Option C: Tauri Desktop App

#### What is it?
Tauri is a modern alternative to Electron. Instead of bundling its own browser, it uses the browser engine already present on the employee's computer (WebView2 on Windows, which comes pre-installed on Windows 10/11).

#### How does it work for employees?
Same as Electron - employees receive an `.exe` installer, install it, and run the app from their Desktop or Start Menu.

#### Development Effort:
- **Timeline:** 2-3 weeks
- **Changes Required:** Significant - requires Rust programming language setup, different build pipeline, and some application restructuring
- **Risk:** Medium - newer technology, requires additional programming language expertise

#### Advantages:
- **Very small file size** - installer is only 10-30 MB (vs. 150-200 MB for Electron)
- **Low memory usage** - uses significantly less RAM than Electron
- **Better performance** - faster startup and smoother operation
- **Full system access** - same as Electron

#### Limitations:
- **Higher development effort** - requires knowledge of Rust programming language
- **Newer technology** - smaller community, fewer resources for troubleshooting
- **Same distribution challenges as Electron** - manual updates, code signing, admin permissions
- **Backend complexity** - the CRM's server-side logic needs to be handled differently (either bundled or hosted remotely)

---

## 4. Side-by-Side Comparison

| Feature                         | PWA (Option A)      | Electron (Option B)  | Tauri (Option C)    |
|---------------------------------|---------------------|----------------------|---------------------|
| **Development Time**            | 2-3 days            | 1-2 weeks            | 2-3 weeks           |
| **Development Cost**            | Low                 | Medium-High          | High                |
| **Installer Size**              | Under 5 MB          | 150-200 MB           | 10-30 MB            |
| **Memory Usage**                | Low (uses browser)  | High (200-500 MB)    | Low (50-100 MB)     |
| **Looks Like a Desktop App**    | Yes                 | Yes                  | Yes                 |
| **Desktop/Taskbar Icon**        | Yes                 | Yes                  | Yes                 |
| **Persistent Login**            | Yes                 | Yes                  | Yes                 |
| **Auto-Updates**                | Automatic           | Needs setup          | Needs setup         |
| **Admin Rights to Install**     | Not needed          | Usually needed        | Usually needed      |
| **Offline Support**             | Limited             | Possible             | Possible            |
| **Works on All Platforms**      | Yes (single build)  | Separate builds      | Separate builds     |
| **Internet Required**           | Yes                 | Can work offline     | Can work offline    |
| **Annual Maintenance Cost**     | None extra          | Code signing + maintenance | Code signing + maintenance |
| **Distribution Method**         | Browser install     | .exe file sharing    | .exe file sharing   |
| **System Tray Icon**            | No                  | Yes                  | Yes                 |
| **Risk Level**                  | Very Low            | Low-Medium           | Medium              |

---

## 5. Persistent Login (Stay Logged In)

### The Requirement
Employees should be able to:
1. Start their computer
2. Click on the CRM app icon
3. The app opens directly to the dashboard - **no login screen**
4. They are already logged in from their previous session

### How This Works

**This is fully achievable with all three approaches, including PWA.**

Here is how persistent login works:

#### Current Behaviour:
- Employee logs in -> session is created -> session expires after some time -> employee has to log in again

#### Proposed Behaviour:
- Employee logs in -> a long-lived session is created (valid for 30/60/90 days as configured) -> session persists even after closing the app or restarting the computer -> employee stays logged in until the session expires or they manually log out
- When the session eventually expires (e.g., after 30 days), the employee will need to log in once, and then they are set for another 30 days

#### Security Considerations:
- **"Remember Me" checkbox** - We can add a "Remember Me" option on the login page. If checked, the session lasts for 30-90 days. If unchecked, the session expires when the app is closed (for shared computers).
- **Device-based sessions** - Each device maintains its own session. Logging in on a new device does not log out other devices.
- **Admin control** - Super Admin can force-logout any employee's session from the admin panel if needed (e.g., if a device is lost or an employee leaves the company).
- **Automatic session refresh** - The session automatically refreshes while the employee is actively using the app, so active users never experience unexpected logouts.

#### Implementation Effort:
- **Timeline:** 1 day (independent of which desktop approach is chosen)
- **Changes Required:** Update session configuration in the authentication system

---

## 6. Our Recommendation

### We recommend: **Option A - Progressive Web App (PWA)**

#### Reasons:

1. **Fastest time to delivery** - Can be implemented and deployed in 2-3 days
2. **Zero distribution overhead** - No need to email `.exe` files, manage versions, or handle installation issues. Employees install once from the browser, and every future update is automatic.
3. **No additional cost** - No code signing certificates, no separate hosting, no additional infrastructure
4. **Minimal risk** - Almost no changes to the existing application. If anything goes wrong, the web version continues to work as before.
5. **Employee experience is identical** - Employees get a desktop icon, a standalone window, persistent login - everything they need. The experience is indistinguishable from a "real" desktop app for this use case.
6. **Maintenance-free** - Updates to the web app automatically reflect in the PWA. No separate build or distribution process.

#### When to consider Electron/Tauri instead:
- If employees need to work **completely offline** for extended periods
- If the app needs deep **operating system integration** (reading files from the computer, printing to specific printers, hardware access)
- If the app needs to run **background processes** even when the window is closed

None of these requirements apply to the Finance CRM at this time.

---

## 7. Implementation Roadmap

### If PWA is approved:

| Step | Task | Duration |
|------|------|----------|
| 1 | Add PWA manifest and service worker | 1 day |
| 2 | Add app icons for all sizes (desktop, taskbar, etc.) | Included in Step 1 |
| 3 | Implement persistent login ("Remember Me") | 1 day |
| 4 | Testing on Windows, Mac, and mobile devices | 0.5 day |
| 5 | Employee installation guide (with screenshots) | 0.5 day |
| **Total** | | **3 days** |

### What employees will need to do (one-time):
1. Open the CRM in Chrome or Edge
2. Click the "Install" button (or the install icon in the browser address bar)
3. Click "Install" in the confirmation popup
4. Done! The CRM app icon will appear on their Desktop

---

## 8. Frequently Asked Questions

**Q: Will the desktop app work if the internet is down?**
A: With PWA, the app requires internet to load data (same as the current web version). However, the app itself will open instantly even without internet and show a friendly "No connection" message. With Electron/Tauri, limited offline functionality can be built, but this requires significant additional development.

**Q: What if an employee uninstalls the app?**
A: They can simply reinstall it from the browser. No data is lost since everything is stored on the server.

**Q: Will it work on all versions of Windows?**
A: Yes, PWA works on Windows 10 and above (with Chrome or Edge browser installed). Electron and Tauri also support Windows 10+.

**Q: Can we control who installs the app?**
A: The app is only accessible to employees who have valid login credentials. The installation itself is just a shortcut - without valid credentials, the app is unusable.

**Q: What about mobile phones?**
A: PWA also works on mobile! Employees can install the CRM on their Android or iOS phones as well. This is a bonus feature that comes at no extra cost. Electron and Tauri do not support mobile.

**Q: How much additional server cost is involved?**
A: For PWA - zero additional cost. For Electron/Tauri - zero additional server cost, but there may be costs for code signing certificates and distribution infrastructure.

**Q: If we start with PWA, can we switch to Electron/Tauri later?**
A: Absolutely. The approaches are not mutually exclusive. Starting with PWA is the lowest-risk option, and if requirements change in the future, an Electron or Tauri wrapper can be built on top of the same codebase.

**Q: Will employees need to update the app manually?**
A: With PWA - no. Updates happen automatically in the background. With Electron/Tauri - an auto-update mechanism can be built, but it requires additional development and infrastructure.

---

*This document is intended for decision-making purposes. Technical implementation details can be provided separately upon request.*
