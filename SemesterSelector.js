import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';

const SemesterSelector = ({ 
  visible, 
  onClose, 
  onSelect, 
  currentSelection,
  theme,
  isStudent = false
}) => {
  const semesters = [
    { value: 'auto', label: '📚 Current Lecture (Auto)', description: 'Based on timetable' },
    { value: '1', label: 'Semester 1', description: 'First semester' },
    { value: '2', label: 'Semester 2', description: 'Second semester' },
    { value: '3', label: 'Semester 3', description: 'Third semester' },
    { value: '4', label: 'Semester 4', description: 'Fourth semester' },
    { value: '5', label: 'Semester 5', description: 'Fifth semester' },
    { value: '6', label: 'Semester 6', description: 'Sixth semester' },
    { value: '7', label: 'Semester 7', description: 'Seventh semester' },
    { value: '8', label: 'Semester 8', description: 'Eighth semester' },
  ];

  // All branches available to all teachers (no restrictions)
  const branches = [
    { value: 'B.Tech Data Science', label: 'Data Science (DS)' },
    { value: 'B.Tech Computer Science', label: 'Computer Science (CS)' },
    { value: 'B.Tech Information Technology', label: 'Information Technology (IT)' },
    { value: 'B.Tech Electronics', label: 'Electronics (EC)' },
    { value: 'B.Tech Mechanical', label: 'Mechanical (ME)' },
    { value: 'B.Tech Civil', label: 'Civil (CE)' },
  ];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={[styles.title, { color: theme.text }]}>
                {isStudent ? 'Select Your Branch & Semester' : 'Select Semester & Branch'}
              </Text>
              {isStudent && (
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Choose your branch and semester to view your personal timetable
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Semester Selection */}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Semester</Text>
            {semesters.map((sem) => (
              <TouchableOpacity
                key={sem.value}
                style={[
                  styles.option,
                  { 
                    backgroundColor: currentSelection?.semester === sem.value 
                      ? theme.primary + '20' 
                      : theme.background,
                    borderColor: currentSelection?.semester === sem.value
                      ? theme.primary
                      : theme.border
                  }
                ]}
                onPress={() => {
                  onSelect({ ...currentSelection, semester: sem.value });
                }}
              >
                <View style={styles.optionContent}>
                  <Text style={[
                    styles.optionLabel, 
                    { 
                      color: currentSelection?.semester === sem.value 
                        ? theme.primary 
                        : theme.text 
                    }
                  ]}>
                    {sem.label}
                  </Text>
                  <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
                    {sem.description}
                  </Text>
                </View>
                {currentSelection?.semester === sem.value && (
                  <Text style={{ color: theme.primary, fontSize: 20 }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Branch Selection (only if not auto) */}
            {currentSelection?.semester !== 'auto' && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>
                  Branch
                </Text>
                {branches.map((branch) => (
                  <TouchableOpacity
                    key={branch.value}
                    style={[
                      styles.option,
                      { 
                        backgroundColor: currentSelection?.branch === branch.value 
                          ? theme.primary + '20' 
                          : theme.background,
                        borderColor: currentSelection?.branch === branch.value
                          ? theme.primary
                          : theme.border
                      }
                    ]}
                    onPress={() => {
                      onSelect({ ...currentSelection, branch: branch.value });
                    }}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[
                        styles.optionLabel, 
                        { 
                          color: currentSelection?.branch === branch.value 
                            ? theme.primary 
                            : theme.text 
                        }
                      ]}>
                        {branch.label}
                      </Text>
                    </View>
                    {currentSelection?.branch === branch.value && (
                      <Text style={{ color: theme.primary, fontSize: 20 }}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>

          {/* Apply Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: theme.primary }]}
              onPress={onClose}
            >
              <Text style={styles.applyButtonText}>
                {isStudent ? 'View My Timetable' : 'Apply Selection'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerContent: {
    flex: 1,
    marginRight: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: 24,
    fontWeight: '300',
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 8,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  applyButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SemesterSelector;
