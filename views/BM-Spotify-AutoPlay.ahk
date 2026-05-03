; ============================================================
; BAND-MAID Unofficial — Spotify Playlist AutoPlay
; AutoHotkey v2 — No external libraries required
;
; DETECTION METHOD: Window title
;   The page sets its title to "[PLAY] BAND-MAID Spotify Playlist"
;   when the play prompt banner is visible, and clears it when
;   playback starts. AHK watches for "[PLAY]" in any browser window.
;   This is 100% reliable — no color detection, no screen coordinates.
;
; USAGE:
;   - Open the Spotify Playlist view in your browser
;   - Maximize the browser window
;   - Run this script (tray icon appears)
;   - Click play on the first track manually
;   - Script handles all subsequent tracks automatically
; ============================================================

#Requires AutoHotkey v2.0
#SingleInstance Force

; ── CONFIGURATION ────────────────────────────────────────────────────────────

; The title string the page sets when waiting for play
PLAY_SIGNAL   := "[PLAY]"

; Poll interval (ms)
POLL_MS       := 4000

; Delay after signal detected before acting (ms)
; Must be > focusPlayButton delay (1000ms) in the page
CLICK_DELAY   := 2000

; Cooldown after click attempt (ms)
; Prevents re-triggering while the [PLAY] title is still set
; and Spotify hasn't started playing yet. Should be longer than
; the time between pressing Enter and Spotify updating the title.
COOLDOWN_MS   := 10000

; Number of Tab presses to reach Spotify play button
TAB_COUNT     := 6

; Delay between each Tab press (ms) — increase if tabs are skipping
TAB_DELAY     := 50

; Delay before restoring the previously active window (ms)
; Give Spotify time to process Enter and start playing before
; we switch focus away from the browser
RESTORE_DELAY := 2000

; ── STATE ────────────────────────────────────────────────────────────────────
global paused      := false
global signalFound := false
global clickAt     := 0
global cooldownEnd := 0
global statusLabel := "Status: Watching…"
global browserHwnd := 0    ; handle of the detected browser window

; ── TRAY SETUP ───────────────────────────────────────────────────────────────
A_IconTip := "BAND-MAID Spotify AutoPlay"
TraySetIcon("shell32.dll", 277)
A_TrayMenu.Delete()
A_TrayMenu.Add("BAND-MAID AutoPlay", (*) => {})
A_TrayMenu.Disable("BAND-MAID AutoPlay")
A_TrayMenu.Add()
A_TrayMenu.Add(statusLabel, (*) => {})
A_TrayMenu.Disable(statusLabel)
A_TrayMenu.Add()
A_TrayMenu.Add("Pause / Resume", (*) => TogglePause())
A_TrayMenu.Add("Exit", (*) => ExitApp())

ToolTip("BAND-MAID AutoPlay running`nWatching for [PLAY] signal…")
Sleep(2500)
ToolTip()

; ── HELPERS ──────────────────────────────────────────────────────────────────
SetStatus(msg) {
    global statusLabel
    try A_TrayMenu.Rename(statusLabel, "Status: " msg)
    statusLabel := "Status: " msg
}

TogglePause() {
    global paused
    paused := !paused
    SetStatus(paused ? "Paused" : "Watching…")
    ToolTip(paused ? "AutoPlay PAUSED" : "AutoPlay RESUMED")
    Sleep(1500)
    ToolTip()
}

BrowserExe() {
    browsers := ["msedge.exe", "chrome.exe", "firefox.exe", "brave.exe", "vivaldi.exe"]
    for exe in browsers
        if WinExist("ahk_exe " exe)
            return exe
    return "msedge.exe"
}

; Find the browser window whose title contains [PLAY]
FindPlayWindow() {
    browsers := ["msedge.exe", "chrome.exe", "firefox.exe", "brave.exe", "vivaldi.exe"]
    for exe in browsers {
        ; WinExist with title match
        hwnd := WinExist("[PLAY] ahk_exe " exe)
        if hwnd
            return hwnd
    }
    return 0
}

; ── MAIN LOOP ────────────────────────────────────────────────────────────────
SetTimer(MainLoop, POLL_MS)

MainLoop() {
    global paused, signalFound, clickAt, cooldownEnd, browserHwnd
    global PLAY_SIGNAL, CLICK_DELAY

    if paused
        return

    ; Skip during cooldown
    if A_TickCount < cooldownEnd
        return

    ; Check for [PLAY] in any browser window title
    hwnd := FindPlayWindow()

    if hwnd {
        browserHwnd := hwnd
        if !signalFound {
            signalFound := true
            clickAt     := A_TickCount + CLICK_DELAY
            secs        := Round(CLICK_DELAY / 1000)
            ; Get the window title to show which track
            title := WinGetTitle("ahk_id " hwnd)
            SetStatus("Signal detected — acting in " secs "s")
            ToolTip("BAND-MAID AutoPlay`n[PLAY] detected — acting in " secs "s…")
        }

        if A_TickCount >= clickAt {
            signalFound := false
            clickAt     := 0
            ToolTip()
            ClickPlay(hwnd)
        }
    } else {
        if signalFound {
            signalFound := false
            ToolTip()
            SetStatus("Playing…")
        }
    }
}

; ── CLICK PLAY ────────────────────────────────────────────────────────────────
ClickPlay(hwnd) {
    global cooldownEnd, COOLDOWN_MS, TAB_COUNT

    ; Set cooldown immediately
    cooldownEnd := A_TickCount + COOLDOWN_MS

    ; Remember what window was active before we interfere
    prevHwnd := WinExist("A")   ; "A" = currently active window
    prevTitle := ""
    try prevTitle := WinGetTitle("ahk_id " prevHwnd)

    SetStatus("Activating browser…")
    ToolTip("Saving active window, then Tab×" TAB_COUNT " + Enter…")

    ; Bring the specific browser window to front
    try {
        WinActivate("ahk_id " hwnd)
        WinWaitActive("ahk_id " hwnd, , 3)
    }
    Sleep(300)

    ; Click inside the Spotify embed to lock Tab focus inside the iframe
    try {
        WinGetPos(&wx, &wy, &ww, &wh, "ahk_id " hwnd)
        embedX := wx + Round(ww * 0.60)
        embedY := wy + 130
        CoordMode("Mouse", "Screen")
        MouseMove(embedX, embedY, 2)
        Sleep(100)
        SendEvent("{LButton Down}")
        Sleep(40)
        SendEvent("{LButton Up}")
        Sleep(350)
    }

    ; Tab × TAB_COUNT then Enter — sandboxed inside the iframe
    SetStatus("Tab×" TAB_COUNT " + Enter…")
    ToolTip("Sending Tab×" TAB_COUNT " + Enter…")

    Loop TAB_COUNT {
        Send("{Tab}")
        Sleep(TAB_DELAY)
    }
    Sleep(200)
    Send("{Enter}")

    ; Wait before restoring focus — give Spotify time to process the keypress
    SetStatus("Waiting " Round(RESTORE_DELAY/1000) "s before restoring focus…")
    ToolTip("Waiting " Round(RESTORE_DELAY/1000) "s before restoring focus…")
    Sleep(RESTORE_DELAY)

    ; Restore the previously active window
    if prevHwnd && prevHwnd != hwnd {
        try {
            WinActivate("ahk_id " prevHwnd)
            SetStatus("Restored: " SubStr(prevTitle, 1, 40) (StrLen(prevTitle) > 40 ? "…" : ""))
            ToolTip("Restored focus to:`n" prevTitle)
            Sleep(1500)
        }
    } else {
        SetStatus("Waiting for playback…")
    }

    Sleep(300)
    ToolTip()
}
