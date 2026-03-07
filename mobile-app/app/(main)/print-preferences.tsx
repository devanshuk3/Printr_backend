import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Plus, Minus, ChevronLeft, FileText, Hash } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect } from 'react';

const PrintSettings = () => {
     const router = useRouter();
     const { files } = useLocalSearchParams<{ files: string }>();
     const uploadedFiles = files ? JSON.parse(files) as Array<{ uri: string, name: string, mimeType: string }> : [];

     const [copies, setCopies] = useState(1);
     const [totalPages, setTotalPages] = useState(0);
     const [isLoadingPages, setIsLoadingPages] = useState(true);
     const [formData, setFormData] = useState({
          colorMode: 'Colored',
          layout: 'Portrait',
          scaling: 'Fit to Page',
          customScale: '',
          pageSelection: 'All',
          customRange: '',
          doubleSided: 'NO'
     });

     useEffect(() => {
          const calculateTotalPages = async () => {
               setIsLoadingPages(true);
               let total = 0;
               try {
                    for (const file of uploadedFiles) {
                         const isPdf = file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                         if (isPdf) {
                              try {
                                   const content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
                                   // Try to find the page count in the catalog first (/Count X)
                                   const countMatch = content.match(/\/Count\s+(\d+)/);
                                   if (countMatch && countMatch[1]) {
                                        total += parseInt(countMatch[1]);
                                   } else {
                                        // Fallback: Count /Type /Page entries
                                        const pageMatches = content.match(/\/Type\s*\/Page\b/g);
                                        total += pageMatches ? pageMatches.length : 1;
                                   }
                              } catch (e) {
                                   console.error("Error reading PDF:", e);
                                   total += 1; // Fallback
                              }
                         } else {
                              // Images or other files count as 1 page
                              total += 1;
                         }
                    }
                    setTotalPages(total);
               } finally {
                    setIsLoadingPages(false);
               }
          };

          if (uploadedFiles.length > 0) {
               calculateTotalPages();
          } else {
               setIsLoadingPages(false);
          }
     }, [files]);

     const handleChange = (field: string, value: string) => {
          setFormData(prev => ({ ...prev, [field]: value }));
     };

     const renderDropdown = (label: string, field: string, options: string[]) => (
          <View style={styles.section}>
               <Text style={styles.label}>{label}</Text>
               <View style={styles.pickerContainer}>
                    {options.map((option) => (
                         <TouchableOpacity
                              key={option}
                              style={[
                                   styles.optionButton,
                                   formData[field as keyof typeof formData] === option && styles.optionButtonSelected
                              ]}
                              onPress={() => handleChange(field, option)}
                         >
                              <Text style={[
                                   styles.optionText,
                                   formData[field as keyof typeof formData] === option && styles.optionTextSelected
                              ]}>{option}</Text>
                         </TouchableOpacity>
                    ))}
               </View>
          </View>
     );

     const handleCheckout = () => {
          Alert.alert("Print Order", "Your print job has been sent to the printer successfully.", [
               { text: "OK", onPress: () => router.replace("/home") }
          ]);
     };

     return (
          <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
               <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                         <ChevronLeft size={24} color="#2e3563" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Print Settings</Text>
               </View>
                {/* Job Summary Banner */}
                <View style={styles.summaryBanner}>
                    <View style={styles.summaryItem}>
                        <FileText size={20} color="#1271dd" />
                        <Text style={styles.summaryLabel}>{uploadedFiles.length} {uploadedFiles.length === 1 ? 'File' : 'Files'}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                        <Hash size={20} color="#1271dd" />
                        <Text style={styles.summaryLabel}>
                             {isLoadingPages ? 'Counting...' : `${totalPages} Total ${totalPages === 1 ? 'Page' : 'Pages'}`}
                        </Text>
                    </View>
                </View>
                <ScrollView contentContainerStyle={styles.content}>
                     {/* Selected Files Summary */}
                     {uploadedFiles.length > 0 && (
                          <View style={styles.section}>
                               <Text style={styles.label}>Selected Files ({uploadedFiles.length})</Text>
                               <View style={styles.fileSummaryList}>
                                    {uploadedFiles.map((file, idx) => (
                                         <View key={idx} style={styles.fileSummaryItem}>
                                              <Text style={styles.fileSummaryName} numberOfLines={1}>
                                                   {idx + 1}. {file.name}
                                              </Text>
                                         </View>
                                    ))}
                               </View>
                          </View>
                     )}

                     {/* Color Mode */}
                    {renderDropdown('Color Mode', 'colorMode', ['Colored', 'Black & White', 'Grayscale'])}

                    {/* Number of Copies */}
                    <View style={styles.section}>
                         <Text style={styles.label}>Number of copies</Text>
                         <View style={styles.copiesSection}>
                              <TextInput
                                   style={styles.copiesInput}
                                   value={copies.toString()}
                                   keyboardType="numeric"
                                   onChangeText={(text) => setCopies(parseInt(text) || 0)}
                              />
                              <View style={styles.stepperContainer}>
                                   <TouchableOpacity
                                        onPress={() => setCopies(c => c + 1)}
                                        style={styles.stepperButton}
                                   >
                                        <Plus size={20} color="#2e3563" />
                                   </TouchableOpacity>
                                   <View style={styles.stepperDivider} />
                                   <TouchableOpacity
                                        onPress={() => setCopies(c => Math.max(1, c - 1))}
                                        style={styles.stepperButton}
                                   >
                                        <Minus size={20} color="#2e3563" />
                                   </TouchableOpacity>
                              </View>
                         </View>
                    </View>

                    {/* Layout */}
                    {renderDropdown('Layout', 'layout', ['Portrait', 'Landscape'])}

                    {/* Scaling */}
                    <View style={styles.section}>
                         <Text style={styles.label}>Scaling</Text>
                         <View style={styles.pickerContainer}>
                              {['Fit to Page', 'Original Size', 'Custom'].map((option) => (
                                   <TouchableOpacity
                                        key={option}
                                        style={[
                                             styles.optionButton,
                                             formData.scaling === option && styles.optionButtonSelected
                                        ]}
                                        onPress={() => handleChange('scaling', option)}
                                   >
                                        <Text style={[
                                             styles.optionText,
                                             formData.scaling === option && styles.optionTextSelected
                                        ]}>{option}</Text>
                                   </TouchableOpacity>
                              ))}
                         </View>
                         {formData.scaling === 'Custom' && (
                              <TextInput
                                   style={styles.textInput}
                                   placeholder="e.g. 100%"
                                   value={formData.customScale}
                                   onChangeText={(val) => handleChange('customScale', val)}
                              />
                         )}
                    </View>

                    {/* Pages */}
                    <View style={styles.section}>
                         <Text style={styles.label}>Pages</Text>
                         <View style={styles.pagesList}>
                              <TouchableOpacity
                                   style={styles.radioRow}
                                   onPress={() => handleChange('pageSelection', 'All')}
                              >
                                   <View style={[styles.radio, formData.pageSelection === 'All' && styles.radioSelected]} />
                                   <Text style={styles.radioLabel}>All</Text>
                              </TouchableOpacity>

                              <View style={styles.radioRow}>
                                   <TouchableOpacity
                                        style={styles.radioRow}
                                        onPress={() => handleChange('pageSelection', 'Custom')}
                                   >
                                        <View style={[styles.radio, formData.pageSelection === 'Custom' && styles.radioSelected]} />
                                        <Text style={styles.radioLabel}>Custom Range</Text>
                                   </TouchableOpacity>
                              </View>
                              {formData.pageSelection === 'Custom' && (
                                   <TextInput
                                        style={styles.textInput}
                                        placeholder="e.g. 1-5, 8"
                                        value={formData.customRange}
                                        onChangeText={(val) => handleChange('customRange', val)}
                                   />
                              )}
                         </View>
                    </View>

                    {/* Double-Sided */}
                    <View style={styles.section}>
                         <Text style={styles.label}>Double-Sided Printing</Text>
                         <View style={styles.doubleSidedList}>
                              {['YES', 'NO'].map((option) => (
                                   <TouchableOpacity
                                        key={option}
                                        style={styles.radioRow}
                                        onPress={() => handleChange('doubleSided', option)}
                                   >
                                        <View style={[styles.radio, formData.doubleSided === option && styles.radioSelected]} />
                                        <Text style={styles.radioLabel}>{option}</Text>
                                   </TouchableOpacity>
                              ))}
                         </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.buttonRow}>
                         <TouchableOpacity
                              style={[styles.actionButton, styles.cancelButton]}
                              onPress={() => router.back()}
                         >
                              <Text style={styles.buttonText}>CANCEL</Text>
                         </TouchableOpacity>
                         <TouchableOpacity
                              style={[styles.actionButton, styles.printButton]}
                              onPress={handleCheckout}
                         >
                              <Text style={styles.checkoutButtonText}>PRINT NOW</Text>
                         </TouchableOpacity>
                    </View>
               </ScrollView>
          </SafeAreaView>
     );
};

const styles = StyleSheet.create({
     container: {
          flex: 1,
          backgroundColor: '#ffffff',
     },
     header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 10,
          gap: 16,
     },
     backButton: {
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: '#f5f7fa',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: '#e1e4e8',
     },
     content: {
          paddingHorizontal: 24,
          paddingTop: 10,
          paddingBottom: 40,
     },
     title: {
          fontSize: 24,
          fontWeight: '700',
          color: '#2e3563',
     },
     section: {
          marginBottom: 32,
     },
     label: {
          fontSize: 16,
          fontWeight: '700',
          color: '#2e3563',
          marginBottom: 16,
          letterSpacing: 0.3,
     },
     pickerContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
     },
     optionButton: {
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: '#e1e4e8',
          backgroundColor: '#ffffff',
     },
     optionButtonSelected: {
          backgroundColor: '#1271dd',
          borderColor: '#1271dd',
     },
     optionText: {
          color: '#2e3563',
          fontWeight: '600',
          fontSize: 14,
     },
     optionTextSelected: {
          color: '#ffffff',
     },
     copiesSection: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
     },
     copiesInput: {
          width: 80,
          height: 52,
          borderWidth: 1.5,
          borderColor: '#e1e4e8',
          borderRadius: 12,
          paddingHorizontal: 16,
          fontSize: 16,
          fontWeight: '600',
          color: '#2e3563',
          backgroundColor: '#fcfdfe',
     },
     stepperContainer: {
          flexDirection: 'row',
          borderWidth: 1.5,
          borderColor: '#e1e4e8',
          borderRadius: 12,
          backgroundColor: '#ffffff',
          overflow: 'hidden',
     },
     stepperButton: {
          width: 52,
          height: 52,
          alignItems: 'center',
          justifyContent: 'center',
     },
     stepperDivider: {
          width: 1.5,
          height: '100%',
          backgroundColor: '#e1e4e8',
     },
     textInput: {
          marginTop: 12,
          height: 52,
          borderWidth: 1.5,
          borderColor: '#e1e4e8',
          borderRadius: 12,
          paddingHorizontal: 16,
          fontSize: 15,
          color: '#2e3563',
          backgroundColor: '#fcfdfe',
     },
     pagesList: {
          gap: 14,
     },
     doubleSidedList: {
          gap: 14,
     },
     radioRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 4,
     },
     radio: {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: '#e1e4e8',
          backgroundColor: '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
     },
     radioSelected: {
          borderColor: '#1271dd',
          borderWidth: 6,
     },
     radioLabel: {
          fontSize: 15,
          fontWeight: '500',
          color: '#2e3563',
     },
     buttonRow: {
          flexDirection: 'row',
          gap: 16,
          marginTop: 16,
     },
     actionButton: {
          flex: 1,
          height: 56,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
     },
     cancelButton: {
          backgroundColor: '#ffffff',
          borderWidth: 1.5,
          borderColor: '#e1e4e8',
     },
     printButton: {
          backgroundColor: '#1271dd',
          shadowColor: '#1271dd',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 4,
     },
     buttonText: {
          color: '#2e3563',
          fontWeight: '700',
          fontSize: 15,
          letterSpacing: 0.5,
     },
     checkoutButtonText: {
          color: '#ffffff',
          fontWeight: '700',
          fontSize: 15,
          letterSpacing: 0.5,
     },
     fileSummaryList: {
          backgroundColor: '#f8fbff',
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: '#e3f0ff',
     },
     fileSummaryItem: {
          paddingVertical: 4,
     },
     fileSummaryName: {
          fontSize: 14,
          color: '#1271dd',
          fontWeight: '500',
     },
     summaryBanner: {
          flexDirection: 'row',
          backgroundColor: '#eff6ff',
          marginHorizontal: 24,
          marginTop: 8,
          marginBottom: 16,
          padding: 16,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'space-around',
          borderWidth: 1,
          borderColor: '#bfdbfe',
     },
     summaryItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
     },
     summaryLabel: {
          fontSize: 15,
          fontWeight: '700',
          color: '#2e3563',
     },
     summaryDivider: {
          width: 1,
          height: 24,
          backgroundColor: '#bfdbfe',
     },
});

export default PrintSettings;