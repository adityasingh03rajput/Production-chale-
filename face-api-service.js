/**
 * Face-API.js Service
 * Server-side face recognition using face-api.js
 * Provides 95%+ accuracy for face verification
 */

const faceapi = require('face-api.js');
const canvas = require('canvas');
const path = require('path');
require('@tensorflow/tfjs');

// Patch face-api.js to use node-canvas
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

/**
 * Load face-api.js models
 */
async function loadModels() {
    if (modelsLoaded) return true;

    try {
        const modelPath = path.join(__dirname, 'models');

        console.log('📦 Loading face-api.js models...');

        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath),
            faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath),
            faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath)
        ]);

        modelsLoaded = true;
        console.log('✅ Face-api.js models loaded successfully');
        return true;
    } catch (error) {
        console.error('❌ Error loading face-api.js models:', error.message);
        console.log('💡 Run: node download-models.js');
        return false;
    }
}

/**
 * Detect face and get descriptor with aggressive settings
 */
async function getFaceDescriptor(base64Image, imageName = 'image') {
    try {
        const buffer = Buffer.from(base64Image, 'base64');
        const img = await canvas.loadImage(buffer);

        console.log(`   ${imageName}: ${img.width}x${img.height}px`);

        // Very aggressive detection options - lower thresholds to detect more faces
        const detectionOptions = [
            new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }),
            new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }),
            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }),
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.15 }),
            new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 }),
            new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.05 })
        ];

        for (let i = 0; i < detectionOptions.length; i++) {
            const options = detectionOptions[i];
            console.log(`   Attempt ${i + 1}: size=${options.inputSize}, threshold=${options.scoreThreshold}`);

            // Detect face with landmarks and descriptor
            const detection = await faceapi
                .detectSingleFace(img, options)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                console.log(`   ✅ Face detected in ${imageName}!`);
                console.log(`   Score: ${detection.detection.score.toFixed(3)}`);
                console.log(`   Box: x=${Math.round(detection.detection.box.x)}, y=${Math.round(detection.detection.box.y)}, w=${Math.round(detection.detection.box.width)}, h=${Math.round(detection.detection.box.height)}`);
                return detection.descriptor;
            }
        }

        console.log(`   ❌ No face detected in ${imageName} after ${detectionOptions.length} attempts`);
        console.log(`   💡 Tips: Ensure good lighting, face clearly visible, front-facing photo`);
        return null;
    } catch (error) {
        console.error(`   ❌ Error processing ${imageName}:`, error.message);
        return null;
    }
}

/**
 * Compare two faces and return similarity
 */
async function compareFaces(capturedBase64, referenceBase64) {
    try {
        // Ensure models are loaded
        if (!modelsLoaded) {
            const loaded = await loadModels();
            if (!loaded) {
                return {
                    success: false,
                    message: 'Face recognition models not loaded. Please restart server.'
                };
            }
        }

        console.log('🔍 Detecting faces...');

        // Get face descriptors with detailed logging
        console.log('📸 Processing captured image...');
        const capturedDescriptor = await getFaceDescriptor(capturedBase64, 'captured');

        console.log('📷 Processing reference image...');
        const referenceDescriptor = await getFaceDescriptor(referenceBase64, 'reference');

        if (!capturedDescriptor) {
            return {
                success: false,
                message: 'No face detected in captured image. Please ensure good lighting and face is clearly visible.'
            };
        }

        if (!referenceDescriptor) {
            return {
                success: false,
                message: 'No face detected in reference photo. Please re-upload a clear, well-lit photo via admin panel.'
            };
        }

        // Calculate Euclidean distance between descriptors
        const distance = faceapi.euclideanDistance(capturedDescriptor, referenceDescriptor);

        // Threshold: 0.6 (lower = more similar)
        // Distance < 0.6 = same person
        // Distance > 0.6 = different person
        const threshold = 0.6;
        const match = distance < threshold;

        // Convert distance to confidence (0-100)
        // Lower distance = higher confidence
        const confidence = Math.max(0, Math.min(100, (1 - distance) * 100));

        console.log(`📊 Face comparison result:`);
        console.log(`   Distance: ${distance.toFixed(3)}`);
        console.log(`   Threshold: ${threshold}`);
        console.log(`   Match: ${match ? 'YES ✅' : 'NO ❌'}`);
        console.log(`   Confidence: ${confidence.toFixed(2)}%`);

        return {
            success: true,
            match: match,
            confidence: Math.round(confidence),
            distance: parseFloat(distance.toFixed(3)),
            message: match ? 'Face verified successfully!' : 'Face does not match. Please try again.'
        };

    } catch (error) {
        console.error('❌ Face comparison error:', error);
        return {
            success: false,
            message: 'Face comparison failed: ' + error.message
        };
    }
}

/**
 * Extract face descriptor only (for client-side verification)
 * Returns just the descriptor without comparison
 */
async function extractDescriptor(base64Image) {
    try {
        // Ensure models are loaded
        if (!modelsLoaded) {
            const loaded = await loadModels();
            if (!loaded) {
                return null;
            }
        }

        console.log('🔍 Extracting face descriptor...');
        const descriptor = await getFaceDescriptor(base64Image, 'reference');

        if (!descriptor) {
            console.log('❌ Could not extract face descriptor');
            return null;
        }

        console.log('✅ Face descriptor extracted successfully');
        return descriptor;
    } catch (error) {
        console.error('❌ Error extracting descriptor:', error);
        return null;
    }
}

/**
 * Check if models are loaded
 */
function areModelsLoaded() {
    return modelsLoaded;
}

module.exports = {
    loadModels,
    compareFaces,
    extractDescriptor,
    areModelsLoaded
};
