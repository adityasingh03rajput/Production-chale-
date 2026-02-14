/**
 * Unified Timer Manager - Single Source of Truth
 * Eliminates conflicts between multiple timer systems
 * Provides secure, synchronized timer state management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getServerTime } from './ServerTime';

// Timer state lock to prevent race conditions
let timerStateLock = false;
const TIMER_STATE_KEY = '@unified_timer_state';
const MAX_SYNC_DRIFT = 30000; // 30 seconds max drift allowed

/**
 * Unified Timer Hook - Single source of truth for all timer operations
 */
export const useUnifiedTimer = (studentId, serverUrl, lectureInfo) => {
  // SINGLE timer state - no conflicts
  const [timerState, setTimerState] = useState({
    // Core timer data (ONLY from server)
    attendedSeconds: 0,
    totalLectureSeconds: 0,
    isRunning: false,
    isPaused: false,
    
    // Status and validation
    lastServerSync: null,
    syncDrift: 0,
    isValidated: false,
    
    // Security tracking (STUDENT-FRIENDLY)
    pauseReason: null,
    gracePeriodsUsed: 0,
    maxGracePeriods: 999, // Practically unlimited - student-friendly
    
    // UI display (derived from server data)
    displayTime: 0,
    
    // Metadata
    sessionId: null,
    lastUpdate: null,
    source: 'server' // Always server
  });

  // Refs for intervals and state management
  const syncIntervalRef = useRef(null);
  const displayIntervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const lastSyncTimeRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  /**
   * Secure state update with lock mechanism
   * Prevents race conditions between different systems
   */
  const updateTimerState = useCallback((updates, source = 'server') => {
    if (timerStateLock) {
      console.warn('⚠️ Timer state locked, ignoring update from:', source);
      return false;
    }

    // Only server can make authoritative updates
    if (source !== 'server' && updates.attendedSeconds !== undefined) {
      console.warn('⚠️ Non-server source trying to update attended time, blocked');
      return false;
    }

    timerStateLock = true;
    
    setTimerState(prevState => {
      const newState = {
        ...prevState,
        ...updates,
        lastUpdate: new Date().toISOString(),
        source: source
      };

      // Update display time to match server time
      if (updates.attendedSeconds !== undefined) {
        newState.displayTime = updates.attendedSeconds;
      }

      console.log('🔄 Timer state updated:', {
        source,
        attendedSeconds: newState.attendedSeconds,
        isRunning: newState.isRunning,
        isPaused: newState.isPaused
      });

      return newState;
    });

    timerStateLock = false;
    return true;
  }, []);

  /**
   * Validate timer data against server
   * Detects time manipulation and sync issues
   */
  const validateTimerSync = useCallback(async (serverData) => {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c55978b2-e466-4572-9aa3-8e6b3596be52',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'UnifiedTimerManager.js:validateTimerSync',message:'validateTimerSync before getServerTime',data:{},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      const serverTime = getServerTime();
      const currentServerTime = serverTime.now();
      const lastSync = lastSyncTimeRef.current;

      if (!lastSync) {
        // First sync - accept server data
        lastSyncTimeRef.current = currentServerTime;
        return { valid: true, drift: 0 };
      }

      // Calculate expected time progression
      const timeSinceLastSync = currentServerTime - lastSync;
      const expectedProgression = timerState.isRunning ? Math.floor(timeSinceLastSync / 1000) : 0;
      const actualProgression = serverData.attendedSeconds - timerState.attendedSeconds;
      const drift = Math.abs(actualProgression - expectedProgression);

      // Check for suspicious drift
      if (drift > MAX_SYNC_DRIFT / 1000) { // Convert to seconds
        console.error('🚨 Suspicious timer drift detected:', {
          expected: expectedProgression,
          actual: actualProgression,
          drift: drift
        });

        return { 
          valid: false, 
          drift: drift,
          reason: 'excessive_drift'
        };
      }

      lastSyncTimeRef.current = currentServerTime;
      return { valid: true, drift: drift };

    } catch (error) {
      console.error('❌ Timer validation error:', error);
      return { valid: false, drift: 0, reason: 'validation_error' };
    }
  }, [timerState.attendedSeconds, timerState.isRunning]);

  /**
   * Sync with server - authoritative timer source
   */
  const syncWithServer = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c55978b2-e466-4572-9aa3-8e6b3596be52',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'UnifiedTimerManager.js:syncWithServer',message:'syncWithServer entry',data:{studentId:!!studentId,serverUrl:!!serverUrl},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    if (!studentId || !serverUrl) return;

    try {
      console.log('🔄 Syncing timer with server...');
      
      const response = await fetch(`${serverUrl}/api/attendance/get-timer-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          clientTime: Date.now(),
          currentState: {
            attendedSeconds: timerState.attendedSeconds,
            isRunning: timerState.isRunning,
            isPaused: timerState.isPaused
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Server sync failed: ${response.status}`);
      }

      const serverData = await response.json();
      
      if (!serverData.success) {
        throw new Error(serverData.error || 'Server returned error');
      }

      // Validate server data
      const validation = await validateTimerSync(serverData.timerState);
      
      if (!validation.valid) {
        console.error('🚨 Server sync validation failed:', validation.reason);
        
        // Show user warning for suspicious activity
        if (validation.reason === 'excessive_drift') {
          Alert.alert(
            '⚠️ Timer Sync Issue',
            'Timer synchronization detected unusual activity. Your session may be reset for security.',
            [{ text: 'OK' }]
          );
        }
        
        return false;
      }

      // Update with validated server data
      updateTimerState({
        ...serverData.timerState,
        lastServerSync: new Date().toISOString(),
        syncDrift: validation.drift,
        isValidated: true
      }, 'server');

      console.log('✅ Timer synced successfully:', {
        attendedSeconds: serverData.timerState.attendedSeconds,
        isRunning: serverData.timerState.isRunning,
        drift: validation.drift
      });

      return true;

    } catch (error) {
      console.error('❌ Timer sync failed:', error);
      
      // Mark as unvalidated
      updateTimerState({
        isValidated: false,
        lastServerSync: null
      }, 'client');

      return false;
    }
  }, [studentId, serverUrl, timerState.attendedSeconds, timerState.isRunning, timerState.isPaused, updateTimerState, validateTimerSync]);

  /**
   * Start timer with server validation
   */
  const startTimer = useCallback(async () => {
    if (!studentId || !serverUrl) {
      Alert.alert('Error', 'Cannot start timer: Missing student ID or server URL');
      return false;
    }

    try {
      console.log('▶️ Starting unified timer...');

      const response = await fetch(`${serverUrl}/api/attendance/start-unified-timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          lectureInfo: lectureInfo,
          clientTime: Date.now(),
          deviceInfo: {
            platform: 'mobile',
            timestamp: new Date().toISOString()
          }
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to start timer');
      }

      // Update state with server response
      updateTimerState({
        ...result.timerState,
        isRunning: true,
        isPaused: false,
        sessionId: result.sessionId,
        isValidated: true,
        gracePeriodsUsed: 0, // Reset grace periods for new session
        maxGracePeriods: 999 // Student-friendly unlimited grace periods
      }, 'server');

      console.log('✅ Unified timer started successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to start unified timer:', error);
      Alert.alert('Timer Error', `Cannot start timer: ${error.message}`);
      return false;
    }
  }, [studentId, serverUrl, lectureInfo, updateTimerState]);

  /**
   * Stop timer with server validation
   */
  const stopTimer = useCallback(async (reason = 'manual') => {
    if (!timerState.isRunning) return true;

    try {
      console.log('⏹️ Stopping unified timer, reason:', reason);

      const response = await fetch(`${serverUrl}/api/attendance/stop-unified-timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          sessionId: timerState.sessionId,
          reason: reason,
          clientTime: Date.now()
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        console.warn('⚠️ Server stop failed, stopping locally');
      }

      // Update state
      updateTimerState({
        isRunning: false,
        isPaused: false,
        pauseReason: null,
        sessionId: null
      }, 'server');

      console.log('✅ Unified timer stopped');
      return true;

    } catch (error) {
      console.error('❌ Failed to stop unified timer:', error);
      
      // Force stop locally for safety
      updateTimerState({
        isRunning: false,
        isPaused: false,
        pauseReason: null
      }, 'client');

      return false;
    }
  }, [studentId, serverUrl, timerState.isRunning, timerState.sessionId, updateTimerState]);

  /**
   * Pause timer with grace period management (STUDENT-FRIENDLY)
   */
  const pauseTimer = useCallback(async (reason) => {
    if (!timerState.isRunning || timerState.isPaused) return;

    // STUDENT-FRIENDLY: No hard grace period limits
    // Only stop after extreme abuse (999+ disconnections)
    if (reason.includes('wifi') && timerState.gracePeriodsUsed >= 999) {
      console.warn('⚠️ Extreme disconnection abuse detected, stopping timer');
      await stopTimer('extreme_disconnection_abuse');
      return;
    }

    try {
      console.log('⏸️ Pausing unified timer, reason:', reason);

      const response = await fetch(`${serverUrl}/api/attendance/pause-unified-timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          sessionId: timerState.sessionId,
          reason: reason,
          gracePeriodsUsed: timerState.gracePeriodsUsed,
          clientTime: Date.now()
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        console.warn('⚠️ Server pause failed, pausing locally');
      }

      // Update state
      const updates = {
        isPaused: true,
        pauseReason: reason
      };

      // Increment grace periods for WiFi-related pauses
      if (reason.includes('wifi')) {
        updates.gracePeriodsUsed = timerState.gracePeriodsUsed + 1;
      }

      updateTimerState(updates, 'server');

      console.log('✅ Unified timer paused');

    } catch (error) {
      console.error('❌ Failed to pause unified timer:', error);
    }
  }, [studentId, serverUrl, timerState.isRunning, timerState.isPaused, timerState.sessionId, timerState.gracePeriodsUsed, timerState.maxGracePeriods, updateTimerState, stopTimer]);

  /**
   * Resume timer from pause
   */
  const resumeTimer = useCallback(async (reason) => {
    if (!timerState.isPaused) return;

    try {
      console.log('▶️ Resuming unified timer, reason:', reason);

      const response = await fetch(`${serverUrl}/api/attendance/resume-unified-timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          sessionId: timerState.sessionId,
          reason: reason,
          clientTime: Date.now()
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        console.warn('⚠️ Server resume failed, resuming locally');
      }

      // Update state
      updateTimerState({
        isPaused: false,
        pauseReason: null
      }, 'server');

      console.log('✅ Unified timer resumed');

    } catch (error) {
      console.error('❌ Failed to resume unified timer:', error);
    }
  }, [studentId, serverUrl, timerState.isPaused, timerState.sessionId, updateTimerState]);

  /**
   * Setup intervals for sync and display
   */
  useEffect(() => {
    // Server sync every 30 seconds (more frequent for security)
    if (timerState.isRunning && !timerState.isPaused) {
      syncIntervalRef.current = setInterval(syncWithServer, 30000);
    } else {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    }

    // Display update every second (UI only)
    if (timerState.isRunning && !timerState.isPaused) {
      displayIntervalRef.current = setInterval(() => {
        updateTimerState({
          displayTime: timerState.displayTime + 1
        }, 'display');
      }, 1000);
    } else {
      if (displayIntervalRef.current) {
        clearInterval(displayIntervalRef.current);
        displayIntervalRef.current = null;
      }
    }

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (displayIntervalRef.current) clearInterval(displayIntervalRef.current);
    };
  }, [timerState.isRunning, timerState.isPaused, timerState.displayTime, syncWithServer, updateTimerState]);

  /**
   * Handle app state changes
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - sync immediately
        if (timerState.isRunning) {
          console.log('📱 App resumed, syncing timer...');
          syncWithServer();
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => subscription?.remove();
  }, [timerState.isRunning, syncWithServer]);

  /**
   * Save state to storage for recovery
   */
  useEffect(() => {
    const saveState = async () => {
      try {
        await AsyncStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
          attendedSeconds: timerState.attendedSeconds,
          isRunning: timerState.isRunning,
          isPaused: timerState.isPaused,
          sessionId: timerState.sessionId,
          lastUpdate: timerState.lastUpdate
        }));
      } catch (error) {
        console.error('❌ Failed to save timer state:', error);
      }
    };

    if (timerState.sessionId) {
      saveState();
    }
  }, [timerState.attendedSeconds, timerState.isRunning, timerState.isPaused, timerState.sessionId, timerState.lastUpdate]);

  /**
   * Load state from storage on mount
   */
  useEffect(() => {
    const loadState = async () => {
      try {
        const savedState = await AsyncStorage.getItem(TIMER_STATE_KEY);
        if (savedState) {
          const parsedState = JSON.parse(savedState);
          
          // Validate saved state age (max 1 hour old)
          const stateAge = Date.now() - new Date(parsedState.lastUpdate).getTime();
          if (stateAge < 3600000) { // 1 hour
            updateTimerState(parsedState, 'storage');
            
            // Sync with server to validate
            setTimeout(syncWithServer, 1000);
          }
        }
      } catch (error) {
        console.error('❌ Failed to load timer state:', error);
      }
    };

    loadState();
  }, [updateTimerState, syncWithServer]);

  // Return unified timer interface
  return {
    // Timer state (read-only)
    timerState,
    
    // Actions
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    syncWithServer,
    
    // Computed values
    isSecure: timerState.isValidated && timerState.source === 'server',
    canStart: !timerState.isRunning && studentId && serverUrl,
    canStop: timerState.isRunning,
    canPause: timerState.isRunning && !timerState.isPaused,
    canResume: timerState.isPaused,
    
    // Display helpers
    formatTime: (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },
    
    // Security status
    securityStatus: {
      isValidated: timerState.isValidated,
      lastSync: timerState.lastServerSync,
      drift: timerState.syncDrift,
      gracePeriodsUsed: timerState.gracePeriodsUsed,
      maxGracePeriods: timerState.maxGracePeriods
    }
  };
};

export default useUnifiedTimer;