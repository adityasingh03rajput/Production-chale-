import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Animated, Alert } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { initializeFaceAPI } from './OfflineFaceVerification';
import { CheckIcon, XIcon, SunIcon, UserIcon } from './Icons';
import { getServerTime } from './ServerTime';
import WiFiManager from './WiFiManager';

export default function FaceVerificationScreen({
  userId,
  onVerificationSuccess,
  onVerificationFailed,
  onCancel,
  theme,
  currentClassInfo = null, // Add current class info for BSSID validation
  serverUrl = null, // Add server URL for BSSID validation
}) {
  const [hasPermission, setHasPermission] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [verificationMessage, setVerificationMessage] = useState('Loading...');
  const [cachedPhoto, setCachedPhoto] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [showTakePhotoButton, setShowTakePhotoButton] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const cameraRef = useRef(null);
  
  // BSSID validation states
  const [bssidValidation, setBssidValidation] = useState({
    isValidating: false,
    isValid: false,
    currentBSSID: null,
    expectedBSSID: null,
    roomNumber: null,
    error: null
  });

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animation for face frame
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        console.log('🚀 Starting FaceVerificationScreen initialization...');
        console.log('📍 Current class info:', currentClassInfo);
        console.log('🌐 Server URL:', serverUrl);
        
        // STEP 1: BSSID Validation FIRST (silently in background)
        console.log('📶 Step 1: Starting BSSID validation...');
        setVerificationMessage('Initializing camera...');
        const bssidValid = await performBSSIDValidation();
        console.log('📶 BSSID validation result:', bssidValid);
        
        // Only proceed if BSSID validation passes
        if (!bssidValid) {
          console.log('❌ BSSID validation failed - stopping initialization');
          setIsInitializing(false); // Stop loading state
          return; // Stop initialization if BSSID validation fails
        }

        console.log('✅ BSSID validation passed - continuing initialization...');

        // STEP 2: Request camera permission (only after BSSID validation)
        console.log('📷 Step 2: Requesting camera permission...');
        setVerificationMessage('Requesting camera access...');
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');

        if (status !== 'granted') {
          console.log('❌ Camera permission denied');
          setVerificationMessage('Camera permission required');
          setIsInitializing(false);
          return;
        }

        console.log('✅ Camera permission granted');

        // STEP 3: Initialize face-api.js models
        console.log('🤖 Step 3: Loading AI models...');
        setVerificationMessage('Loading AI models...');
        const modelsLoaded = await initializeFaceAPI();
        if (!modelsLoaded) {
          console.log('❌ AI models failed to load');
          setVerificationMessage('Failed to load face detection models');
          setIsInitializing(false);
          return;
        }

        console.log('✅ AI models loaded successfully');

        // STEP 4: Ready for face verification
        console.log('🎯 Step 4: Ready for face verification');
        setVerificationMessage('✅ Ready! Position your face and take photo');
        setCachedPhoto('ready'); // Server will handle verification
        setShowTakePhotoButton(true);
        setIsInitializing(false);
        
      } catch (error) {
        console.error('❌ Initialization error:', error);
        setVerificationMessage(`Initialization failed: ${error.message}`);
        setIsInitializing(false);
        setBssidValidation(prev => ({
          ...prev,
          error: error.message
        }));
      }
    })();
  }, [userId, currentClassInfo, serverUrl]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && isVerifying) {
      performCapture();
    }
  }, [countdown, isVerifying]);

  // BSSID Validation Function - Called BEFORE face verification
  const performBSSIDValidation = async () => {
    try {
      console.log('📶 === BSSID VALIDATION START ===');
      setBssidValidation(prev => ({ ...prev, isValidating: true }));
      setVerificationMessage('🔍 Validating classroom location...');
      
      console.log('📶 Starting BSSID validation for face verification...');
      console.log('📍 Current class info:', currentClassInfo);
      console.log('🌐 Server URL:', serverUrl);
      
      // Check if we have current class info
      if (!currentClassInfo || !currentClassInfo.room) {
        console.log('❌ No current class info available');
        console.log('   currentClassInfo:', currentClassInfo);
        throw new Error('No active lecture found. Please check your timetable.');
      }

      console.log(`📶 Validating BSSID for room: ${currentClassInfo.room}`);
      
      // Step 1: Check permissions first
      console.log('📶 Step 1: Checking WiFi permissions...');
      setVerificationMessage('🔐 Checking permissions...');
      
      const permissionResult = await WiFiManager.requestPermissions();
      console.log('📶 Permission result:', permissionResult);
      
      if (!permissionResult) {
        console.log('❌ Location permissions not granted');
        
        // Show permission explanation
        Alert.alert(
          '📍 Location Permission Required',
          'This app needs location permission to detect WiFi network details (BSSID) for attendance verification.\n\nThis is required by Android for security reasons.\n\nNo location data is collected or stored.',
          [
            {
              text: 'Grant Permission',
              onPress: async () => {
                // Try aggressive permission request
                const aggressiveResult = await WiFiManager.requestLocationPermissionAggressively();
                if (aggressiveResult) {
                  // Retry BSSID validation
                  performBSSIDValidation();
                } else {
                  setBssidValidation({
                    isValidating: false,
                    isValid: false,
                    currentBSSID: 'Permission denied',
                    expectedBSSID: 'Permission required',
                    roomNumber: currentClassInfo.room,
                    error: 'Location permission required for WiFi validation'
                  });
                  setVerificationMessage('❌ Location permission required');
                }
              }
            },
            {
              text: 'Cancel',
              onPress: () => onCancel(),
              style: 'cancel'
            }
          ]
        );
        
        return false;
      }
      
      // Step 2: Initialize WiFi Manager
      console.log('📶 Step 2: Initializing WiFi Manager...');
      setVerificationMessage('📶 Initializing WiFi system...');
      
      const wifiInitialized = await WiFiManager.initialize();
      console.log('📶 WiFi Manager initialized:', wifiInitialized);
      
      // Step 3: Load authorized BSSIDs from server
      if (serverUrl) {
        console.log('📶 Step 3: Loading authorized BSSIDs from server...');
        setVerificationMessage('📥 Loading classroom data...');
        await WiFiManager.loadAuthorizedBSSIDs(serverUrl);
        console.log('📶 Authorized BSSIDs loaded');
      } else {
        console.warn('⚠️ No server URL provided for BSSID loading');
      }
      
      // Step 4: Check BSSID authorization for current room
      console.log('📶 Step 4: Checking BSSID authorization...');
      setVerificationMessage('🔍 Checking WiFi connection...');
      
      const authResult = await WiFiManager.isAuthorizedForRoom(currentClassInfo.room);
      
      console.log('📶 === BSSID VALIDATION RESULT ===');
      console.log('   Authorized:', authResult.authorized);
      console.log('   Current BSSID:', authResult.currentBSSID);
      console.log('   Expected BSSID:', authResult.expectedBSSID);
      console.log('   Reason:', authResult.reason);
      console.log('   Room Info:', authResult.roomInfo);
      
      setBssidValidation({
        isValidating: false,
        isValid: authResult.authorized,
        currentBSSID: authResult.currentBSSID || 'Not detected',
        expectedBSSID: authResult.expectedBSSID || 'Not configured',
        roomNumber: currentClassInfo.room,
        error: authResult.authorized ? null : authResult.reason
      });

      if (!authResult.authorized) {
        console.log('❌ BSSID validation FAILED');
        
        // BSSID validation failed - show detailed error with specific guidance
        let errorMessage = '';
        let alertTitle = '📶 WiFi Validation Failed';
        
        switch (authResult.reason) {
          case 'no_wifi':
            errorMessage = 'You are not connected to WiFi.\n\n📱 Please:\n1. Enable WiFi on your device\n2. Connect to the classroom WiFi network\n3. Try again';
            break;
          case 'wrong_bssid':
            errorMessage = `You are connected to the wrong WiFi network.\n\n📍 Required: ${currentClassInfo.room} classroom WiFi\n📶 Current: ${authResult.currentBSSID || 'Not detected'}\n\n📱 Please connect to the correct classroom WiFi and try again.`;
            break;
          case 'room_not_configured':
            errorMessage = `Room ${currentClassInfo.room} WiFi is not configured.\n\n📞 Please contact your administrator to set up WiFi for this classroom.`;
            break;
          default:
            errorMessage = 'WiFi validation failed. Please check your connection and try again.';
        }
        
        setVerificationMessage(`❌ ${errorMessage.split('\n')[0]}`);
        
        // Show detailed alert with retry option
        Alert.alert(
          alertTitle,
          `Face verification requires you to be connected to the correct classroom WiFi.\n\n${errorMessage}\n\nExpected BSSID: ${authResult.expectedBSSID || 'Not configured'}\nCurrent BSSID: ${authResult.currentBSSID || 'Not detected'}`,
          [
            {
              text: 'Retry',
              onPress: () => performBSSIDValidation()
            },
            {
              text: 'Cancel',
              onPress: () => onCancel(),
              style: 'cancel'
            }
          ]
        );
        
        console.log('📶 === BSSID VALIDATION END (FAILED) ===');
        return false;
      }

      // BSSID validation successful
      console.log('✅ BSSID validation PASSED');
      setVerificationMessage('✅ WiFi validated! Initializing camera...');
      console.log('📶 === BSSID VALIDATION END (SUCCESS) ===');
      return true;
      
    } catch (error) {
      console.error('❌ BSSID validation error:', error);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      
      setBssidValidation({
        isValidating: false,
        isValid: false,
        currentBSSID: 'Error',
        expectedBSSID: 'Error',
        roomNumber: currentClassInfo?.room || 'Unknown',
        error: error.message
      });
      
      setVerificationMessage(`❌ ${error.message}`);
      
      Alert.alert(
        '❌ Location Validation Error',
        `Cannot validate your classroom location:\n\n${error.message}\n\nFace verification requires you to be in the correct classroom.\n\n📱 Please ensure:\n1. Location permission is granted\n2. WiFi is enabled and connected\n3. You are in the correct classroom`,
        [
          {
            text: 'Retry',
            onPress: () => performBSSIDValidation()
          },
          {
            text: 'Cancel',
            onPress: () => onCancel(),
            style: 'cancel'
          }
        ]
      );
      
      console.log('📶 === BSSID VALIDATION END (ERROR) ===');
      return false;
    }
  };

  // Test native WiFi module directly
  const testNativeWiFiModule = async () => {
    try {
      console.log('🔧 === TESTING NATIVE WIFI MODULE ===');
      
      // Import native module
      const { NativeModules } = require('react-native');
      const { WifiModule } = NativeModules;
      
      if (!WifiModule) {
        console.error('❌ WifiModule not found in NativeModules');
        Alert.alert('Error', 'Native WiFi module not found');
        return;
      }
      
      console.log('✅ WifiModule found, testing methods...');
      
      // Test 1: Check permissions
      console.log('🔧 Test 1: Checking permissions...');
      const permissions = await WifiModule.checkPermissions();
      console.log('📱 Permissions:', permissions);
      
      // Test 2: Get WiFi state
      console.log('🔧 Test 2: Getting WiFi state...');
      const wifiState = await WifiModule.getWifiState();
      console.log('📶 WiFi State:', wifiState);
      
      // Test 3: Try to get BSSID
      console.log('🔧 Test 3: Getting BSSID...');
      try {
        const bssidResult = await WifiModule.getBSSID();
        console.log('✅ BSSID Result:', bssidResult);
        
        Alert.alert(
          '🔧 Native WiFi Test Results',
          `Permissions: ${JSON.stringify(permissions, null, 2)}\n\nWiFi State: ${JSON.stringify(wifiState, null, 2)}\n\nBSSID: ${JSON.stringify(bssidResult, null, 2)}`,
          [{ text: 'OK' }]
        );
      } catch (bssidError) {
        console.error('❌ BSSID Error:', bssidError);
        
        Alert.alert(
          '🔧 Native WiFi Test Results',
          `Permissions: ${JSON.stringify(permissions, null, 2)}\n\nWiFi State: ${JSON.stringify(wifiState, null, 2)}\n\nBSSID Error: ${bssidError.message}`,
          [{ text: 'OK' }]
        );
      }
      
      console.log('🔧 === NATIVE WIFI MODULE TEST COMPLETE ===');
      
    } catch (error) {
      console.error('❌ Native WiFi module test failed:', error);
      Alert.alert('Test Failed', `Error: ${error.message}`);
    }
  };

  const takePhoto = async () => {
    if (isVerifying) return;
    
    console.log('📸 Taking photo for verification...');
    setIsVerifying(true);
    setShowTakePhotoButton(false);
    setVerificationProgress(0);
    setVerificationMessage('📸 Taking photo...');
    
    // Simulate progress for better UX
    const progressInterval = setInterval(() => {
      setVerificationProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);
    
    // Take photo immediately
    await performCapture();
    
    clearInterval(progressInterval);
    setVerificationProgress(100);
  };

  const performCapture = async () => {
    if (!cameraRef.current) return;

    try {
      setVerificationProgress(20);
      setVerificationMessage('📸 Capturing image...');
      
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      setVerificationProgress(40);
      setVerificationMessage('🤖 Processing with AI...');

      // Server-side verification - only send captured photo and userId
      const { verifyFaceOffline } = require('./OfflineFaceVerification');
      
      setVerificationProgress(60);
      setVerificationMessage('🔍 Verifying identity...');
      
      const result = await verifyFaceOffline(photo.uri, null, userId);

      setVerificationProgress(80);

      // Clean up captured photo
      try {
        await FileSystem.deleteAsync(photo.uri, { idempotent: true });
      } catch (err) {
        console.log('Could not delete temp photo:', err);
      }

      setVerificationProgress(100);

      if (result.success && result.match) {
        setVerificationMessage(`✅ Verified! ${result.confidence}% match`);
        setTimeout(() => {
          onVerificationSuccess(result);
        }, 1500);
      } else {
        const message = result.message || 'Face does not match';
        setVerificationMessage(`❌ ${message}`);
        setTimeout(() => {
          setIsVerifying(false);
          setShowTakePhotoButton(true);
          setVerificationProgress(0);
          setVerificationMessage('Ready! Position your face and take photo');
        }, 2500);
        onVerificationFailed(result);
      }
    } catch (error) {
      console.error('Error during verification:', error);
      setVerificationMessage('❌ Verification error. Try again.');
      setTimeout(() => {
        setIsVerifying(false);
        setShowTakePhotoButton(true);
        setVerificationProgress(0);
        setVerificationMessage('Ready! Position your face and take photo');
      }, 2000);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Requesting camera...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>📷</Text>
          <Text style={[styles.errorText, { color: theme.text }]}>Camera Access Required</Text>
          <Text style={[styles.errorSubtext, { color: theme.textSecondary }]}>
            Please enable camera permissions in settings
          </Text>
          <TouchableOpacity onPress={onCancel} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.background, opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Face Verification</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          Position your face within the circle
        </Text>
      </View>

      {/* Camera View with Modern Frame */}
      <View style={styles.cameraWrapper}>
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="front"
          >
            {/* Gradient Overlay */}
            <View style={styles.gradientOverlay}>
              {/* Animated Face Frame */}
              <Animated.View
                style={[
                  styles.faceFrame,
                  {
                    transform: [{ scale: isVerifying ? 1 : pulseAnim }],
                    borderColor: isVerifying ? '#00ff88' : '#fff',
                    shadowColor: isVerifying ? '#00ff88' : '#fff',
                  }
                ]}
              />

              {/* Countdown */}
              {countdown > 0 && (
                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              )}

              {/* Corner Markers */}
              <View style={styles.cornerMarkers}>
                <View style={[styles.cornerTL, { borderColor: isVerifying ? '#00ff88' : '#fff' }]} />
                <View style={[styles.cornerTR, { borderColor: isVerifying ? '#00ff88' : '#fff' }]} />
                <View style={[styles.cornerBL, { borderColor: isVerifying ? '#00ff88' : '#fff' }]} />
                <View style={[styles.cornerBR, { borderColor: isVerifying ? '#00ff88' : '#fff' }]} />
              </View>
            </View>
          </CameraView>
        </View>

        {/* Reference photo is securely stored on server - not displayed here */}
      </View>





      {/* Progress Bar */}
      {isVerifying && (
        <View style={[styles.progressContainer, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: theme.text }]}>Processing...</Text>
            <Text style={[styles.progressPercent, { color: theme.primary }]}>{verificationProgress}%</Text>
          </View>
          <View style={[styles.progressBarBackground, { backgroundColor: theme.border }]}>
            <Animated.View 
              style={[
                styles.progressBarFill, 
                { 
                  backgroundColor: theme.primary,
                  width: `${verificationProgress}%`
                }
              ]} 
            />
          </View>
          <Text style={[styles.progressMessage, { color: theme.textSecondary }]}>
            {verificationMessage}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        {/* Show retry button if BSSID validation failed */}
        {!bssidValidation.isValid && !bssidValidation.isValidating && bssidValidation.currentBSSID && (
          <TouchableOpacity
            onPress={performBSSIDValidation}
            style={[styles.retryButton, { backgroundColor: '#f59e0b' }]}
          >
            <Text style={styles.retryButtonText}>🔄 Retry WiFi Check</Text>
          </TouchableOpacity>
        )}

        {/* Debug button for testing native WiFi module */}
        {__DEV__ && (
          <TouchableOpacity
            onPress={testNativeWiFiModule}
            style={[styles.retryButton, { backgroundColor: '#8b5cf6' }]}
          >
            <Text style={styles.retryButtonText}>🔧 Test Native WiFi</Text>
          </TouchableOpacity>
        )}

        {/* Take Photo Button */}
        {showTakePhotoButton && !isVerifying && (
          <TouchableOpacity
            onPress={takePhoto}
            disabled={isInitializing || !cachedPhoto || !bssidValidation.isValid}
            style={[
              styles.takePhotoButton,
              {
                backgroundColor: (!isInitializing && cachedPhoto && bssidValidation.isValid) ? theme.primary : '#666',
                opacity: (!isInitializing && cachedPhoto && bssidValidation.isValid) ? 1 : 0.5,
              }
            ]}
          >
            <Text style={styles.takePhotoIcon}>📸</Text>
            <Text style={styles.takePhotoText}>
              {isInitializing ? 'Initializing...' : 
               !bssidValidation.isValid ? 'WiFi Required' : 
               'Take Photo'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={onCancel}
          style={[styles.cancelButton, { borderColor: theme.border }]}
        >
          <Text style={[styles.cancelButtonText, { color: theme.text }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Tips */}
      <View style={styles.tipsContainer}>
        <View style={styles.tipRow}>
          <Text style={{ fontSize: 20, color: theme.textSecondary }}>📶</Text>
          <Text style={[styles.tipText, { color: theme.textSecondary }]}>
            Must be connected to classroom WiFi
          </Text>
        </View>
        <View style={styles.tipRow}>
          <UserIcon size={20} color={theme.textSecondary} />
          <Text style={[styles.tipText, { color: theme.textSecondary }]}>
            Position face clearly in frame
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  cameraWrapper: {
    flex: 1,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  faceFrame: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    borderColor: '#fff',
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  countdownContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  countdownText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  cornerMarkers: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cornerTL: {
    position: 'absolute',
    top: 60,
    left: 60,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    position: 'absolute',
    top: 60,
    right: 60,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 60,
    left: 60,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 60,
    right: 60,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  actionContainer: {
    gap: 12,
    marginBottom: 20,
  },
  verifyButton: {
    flexDirection: 'row',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  verifyButtonIcon: {
    color: '#fff',
    fontSize: 20,
    marginRight: 8,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tipsContainer: {
    gap: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  tipText: {
    fontSize: 15,
  },
  progressContainer: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressMessage: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  takePhotoButton: {
    flexDirection: 'row',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    marginBottom: 12,
  },
  takePhotoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  takePhotoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  takePhotoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  takePhotoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});