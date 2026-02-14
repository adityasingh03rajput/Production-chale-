import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_DIR = `${FileSystem.cacheDirectory}secure_photos/`;
const PHOTO_CACHE_KEY = '@cached_photo_';
const ENCRYPTION_KEY = 'your-secret-key-here'; // In production, use secure key storage

// Initialize cache directory
export const initializeFaceCache = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      console.log('✅ Face cache directory created');
    }
  } catch (error) {
    console.error('❌ Error creating cache directory:', error);
  }
};

// Simple XOR encryption (for demo - use better encryption in production)
const encryptData = (data, key) => {
  let encrypted = '';
  for (let i = 0; i < data.length; i++) {
    encrypted += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return encrypted;
};

const decryptData = (data, key) => {
  return encryptData(data, key); // XOR is symmetric
};

// Download and cache profile photo
export const cacheProfilePhoto = async (photoUrl, userId) => {
  try {
    if (!photoUrl) {
      console.log('⚠️ No photo URL provided');
      return null;
    }

    console.log('📥 Downloading photo for caching:', photoUrl);

    // Download photo
    const downloadResult = await FileSystem.downloadAsync(
      photoUrl,
      `${CACHE_DIR}temp_${userId}.jpg`
    );

    if (downloadResult.status !== 200) {
      console.error('❌ Failed to download photo');
      return null;
    }

    // Read file as base64
    const photoData = await FileSystem.readAsStringAsync(downloadResult.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Encrypt the photo data
    const encryptedData = encryptData(photoData, ENCRYPTION_KEY);

    // Save encrypted data to secure location
    const cachedPhotoPath = `${CACHE_DIR}${userId}_encrypted.dat`;
    await FileSystem.writeAsStringAsync(cachedPhotoPath, encryptedData);

    // Store metadata with server time if available
    let timestamp;
    try {
      const { getServerTime } = require('./ServerTime');
      const serverTime = getServerTime();
      timestamp = serverTime.now();
    } catch {
      timestamp = Date.now();
    }
    
    await AsyncStorage.setItem(
      `${PHOTO_CACHE_KEY}${userId}`,
      JSON.stringify({
        path: cachedPhotoPath,
        timestamp: timestamp,
        userId: userId,
      })
    );

    // Delete temp file
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });

    console.log('✅ Photo cached and encrypted successfully');
    return cachedPhotoPath;
  } catch (error) {
    console.error('❌ Error caching photo:', error);
    return null;
  }
};

// Get cached photo (decrypted)
export const getCachedPhoto = async (userId) => {
  try {
    const metadata = await AsyncStorage.getItem(`${PHOTO_CACHE_KEY}${userId}`);
    if (!metadata) {
      console.log('⚠️ No cached photo found');
      return null;
    }

    const { path } = JSON.parse(metadata);

    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(path);
    if (!fileInfo.exists) {
      console.log('⚠️ Cached photo file not found');
      return null;
    }

    // Read encrypted data
    const encryptedData = await FileSystem.readAsStringAsync(path);

    // Decrypt
    const decryptedData = decryptData(encryptedData, ENCRYPTION_KEY);

    // Return as data URI for Image component
    return `data:image/jpeg;base64,${decryptedData}`;
  } catch (error) {
    console.error('❌ Error retrieving cached photo:', error);
    return null;
  }
};

// Clear cached photo
export const clearCachedPhoto = async (userId) => {
  try {
    const metadata = await AsyncStorage.getItem(`${PHOTO_CACHE_KEY}${userId}`);
    if (metadata) {
      const { path } = JSON.parse(metadata);
      await FileSystem.deleteAsync(path, { idempotent: true });
      await AsyncStorage.removeItem(`${PHOTO_CACHE_KEY}${userId}`);
      console.log('✅ Cached photo cleared');
    }
  } catch (error) {
    console.error('❌ Error clearing cached photo:', error);
  }
};

// Offline face comparison using image analysis
import { verifyFaceOffline } from './OfflineFaceVerification';

export const compareFaces = async (capturedImageUri, cachedPhotoUri, userId) => {
  try {
    console.log('🔍 Starting offline face verification...');
    console.log('Captured:', capturedImageUri);
    console.log('Cached:', cachedPhotoUri);

    // Use offline verification
    const result = await verifyFaceOffline(capturedImageUri, cachedPhotoUri, 0.65);

    if (!result.success) {
      return {
        match: false,
        confidence: 0,
        message: result.message || 'Face verification failed'
      };
    }

    console.log(`✅ Offline verification: ${result.match ? 'MATCH' : 'NO MATCH'} (${result.confidence}%)`);

    return {
      match: result.match,
      confidence: result.confidence,
      similarity: result.similarity,
      message: result.message
    };
  } catch (error) {
    console.error('❌ Error comparing faces:', error);
    return {
      match: false,
      confidence: 0,
      message: 'Face verification error: ' + error.message
    };
  }
};

// Check if photo is cached
export const isPhotoCached = async (userId) => {
  try {
    const metadata = await AsyncStorage.getItem(`${PHOTO_CACHE_KEY}${userId}`);
    if (!metadata) return false;

    const { path } = JSON.parse(metadata);
    const fileInfo = await FileSystem.getInfoAsync(path);
    return fileInfo.exists;
  } catch (error) {
    return false;
  }
};
