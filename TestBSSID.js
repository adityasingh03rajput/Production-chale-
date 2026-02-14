import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import WiFiManager from './WiFiManager';
import NativeWiFiService from './NativeWiFiService';

const { WifiModule } = NativeModules;

export default function TestBSSID({ theme }) {
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentBSSID, setCurrentBSSID] = useState(null);
  const [wifiInfo, setWifiInfo] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const addResult = (test, result, success = true) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestResults(prev => [...prev, {
      id: Date.now(),
      test,
      result,
      success,
      timestamp
    }]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const runFullTest = async () => {
    setIsLoading(true);
    clearResults();
    
    try {
      addResult('Test Started', 'Running comprehensive BSSID detection test...');

      // Test 1: Check if native module exists
      addResult('Native Module Check', WifiModule ? '✅ WifiModule found' : '❌ WifiModule not found', !!WifiModule);
      
      if (!WifiModule) {
        addResult('Error', 'Native WiFi module not available. Please rebuild the app.', false);
        setIsLoading(false);
        return;
      }

      // Test 2: Test connection
      try {
        const connectionTest = await WifiModule.testConnection();
        addResult('Connection Test', `✅ ${connectionTest.message}`, true);
      } catch (error) {
        addResult('Connection Test', `❌ ${error.message}`, false);
      }

      // Test 3: Check permissions
      try {
        const permissions = await WifiModule.checkPermissions();
        addResult('Permission Check', `Fine Location: ${permissions.ACCESS_FINE_LOCATION ? '✅' : '❌'}, Coarse Location: ${permissions.ACCESS_COARSE_LOCATION ? '✅' : '❌'}`, permissions.ACCESS_FINE_LOCATION || permissions.ACCESS_COARSE_LOCATION);
        
        // Request permissions if not granted
        if (!permissions.ACCESS_FINE_LOCATION && !permissions.ACCESS_COARSE_LOCATION) {
          addResult('Requesting Permissions', 'Location permission required for BSSID detection...');
          
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ]);
          
          const fineGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
          const coarseGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
          
          addResult('Permission Request', `Fine: ${fineGranted ? '✅' : '❌'}, Coarse: ${coarseGranted ? '✅' : '❌'}`, fineGranted || coarseGranted);
        }
      } catch (error) {
        addResult('Permission Check', `❌ ${error.message}`, false);
      }

      // Test 4: Check WiFi state
      try {
        const wifiState = await WifiModule.getWifiState();
        addResult('WiFi State', `WiFi Enabled: ${wifiState.isWifiEnabled ? '✅' : '❌'}, Connected: ${wifiState.isConnectedToWifi ? '✅' : '❌'}`, wifiState.isWifiEnabled);
        
        if (!wifiState.isWifiEnabled) {
          addResult('WiFi Disabled', 'Please enable WiFi and try again', false);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        addResult('WiFi State', `❌ ${error.message}`, false);
      }

      // Test 5: Get BSSID
      try {
        const bssidResult = await WifiModule.getBSSID();
        if (bssidResult.success) {
          addResult('BSSID Detection', `✅ ${bssidResult.bssid}`, true);
          addResult('WiFi Details', `SSID: ${bssidResult.ssid}, Signal: ${bssidResult.rssi} dBm, Speed: ${bssidResult.linkSpeed} Mbps`);
        } else {
          addResult('BSSID Detection', `❌ Failed to get BSSID`, false);
        }
      } catch (error) {
        addResult('BSSID Detection', `❌ ${error.code}: ${error.message}`, false);
        
        // Provide specific guidance
        if (error.code === 'PERMISSION_DENIED') {
          addResult('Solution', '💡 Grant location permission in Android settings');
        } else if (error.code === 'WIFI_DISABLED') {
          addResult('Solution', '💡 Enable WiFi on your device');
        } else if (error.code === 'NO_BSSID') {
          addResult('Solution', '💡 Connect to a WiFi network');
        }
      }

      // Test 6: Test WiFiManager integration
      try {
        addResult('WiFiManager Test', 'Testing WiFiManager integration...');
        await WiFiManager.initialize();
        const managerBSSID = await WiFiManager.getCurrentBSSID();
        addResult('WiFiManager BSSID', managerBSSID ? `✅ ${managerBSSID}` : '❌ No BSSID from WiFiManager', !!managerBSSID);
      } catch (error) {
        addResult('WiFiManager Test', `❌ ${error.message}`, false);
      }

      addResult('Test Complete', '🎉 All tests completed!');

    } catch (error) {
      addResult('Test Error', `❌ ${error.message}`, false);
    }
    
    setIsLoading(false);
  };

  const testDirectBSSID = async () => {
    setIsLoading(true);
    
    try {
      if (!WifiModule) {
        Alert.alert('Error', 'Native WiFi module not available');
        return;
      }

      const result = await WifiModule.getBSSID();
      
      Alert.alert(
        'BSSID Test Result',
        `BSSID: ${result.bssid || 'Not detected'}\nSSID: ${result.ssid || 'Unknown'}\nSignal: ${result.rssi || 0} dBm`,
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      Alert.alert('BSSID Test Failed', `${error.code}: ${error.message}`);
    }
    
    setIsLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>BSSID Detection Test</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={runFullTest}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '🔄 Testing...' : '🧪 Run Full Test'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#6b7280' }]}
          onPress={testDirectBSSID}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>📶 Quick BSSID Test</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#ef4444' }]}
          onPress={clearResults}
        >
          <Text style={styles.buttonText}>🗑️ Clear Results</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.resultsContainer}>
        {testResults.map((result) => (
          <View key={result.id} style={[styles.resultItem, { backgroundColor: theme.cardBackground }]}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultTest, { color: theme.text }]}>{result.test}</Text>
              <Text style={[styles.resultTime, { color: theme.textSecondary }]}>{result.timestamp}</Text>
            </View>
            <Text style={[styles.resultText, { color: result.success ? '#10b981' : '#ef4444' }]}>
              {result.result}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
  },
  resultItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultTest: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultTime: {
    fontSize: 12,
  },
  resultText: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
});