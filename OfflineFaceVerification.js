/**
 * Face Verification Service
 * Server-side face verification with optimized performance
 */

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

const API_URL = 'https://letsbunk-uw7g.onrender.com';

/**
 * Initialize face verification (no-op for server-side)
 */
export const initializeFaceAPI = async () => {
    console.log('✅ Face verification ready (server-side)');
    return true;
};

/**
 * Verify face against server
 * @param {string} capturedImageUri - URI of captured photo
 * @param {string} _referenceImageUri - Not used (server fetches from DB)
 * @param {string} userId - User ID or enrollment number
 * @returns {Promise<Object>} Verification result
 */
export const verifyFaceOffline = async (capturedImageUri, _referenceImageUri, userId) => {
    try {
        console.log('🔍 Starting face verification for:', userId);

        // Compress image (640px width, 70% quality = ~50KB)
        const compressed = await ImageManipulator.manipulateAsync(
            capturedImageUri,
            [{ resize: { width: 640 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Read as base64
        const capturedBase64 = await FileSystem.readAsStringAsync(compressed.uri, {
            encoding: FileSystem.EncodingType.Base64,
        });

        console.log(`📤 Uploading ${Math.round(capturedBase64.length / 1024)}KB to server`);

        // Clean up temp file
        await FileSystem.deleteAsync(compressed.uri, { idempotent: true });

        // Send to server
        const response = await fetch(`${API_URL}/api/verify-face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                capturedImage: capturedBase64,
            }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ Verification complete:', result.match ? 'MATCH' : 'NO MATCH');

        return {
            success: result.success,
            match: result.match,
            confidence: result.confidence,
            message: result.message,
        };
    } catch (error) {
        console.error('❌ Verification error:', error);
        return {
            success: false,
            match: false,
            confidence: 0,
            message: 'Verification failed: ' + error.message
        };
    }
};

/**
 * Check if models are loaded (always true for server-side)
 */
export const areModelsLoaded = () => true;
