import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Alert, Platform, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Plus, Minus, ChevronLeft, FileText, Hash, Copy, Check, X } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from "../../constants/apiConfig";
import * as IntentLauncher from 'expo-intent-launcher';
import { ActivityIndicator } from 'react-native';
import { getAuthData } from "../../utils/authStorage";
import Constants from 'expo-constants';
// Fallback for Clipboard if native module is missing
let Clipboard: any;
try {
     Clipboard = require('expo-clipboard');
} catch (e) {
     console.warn("Clipboard module not found");
}

import QRCode from 'react-native-qrcode-svg';

// Import Share dynamically or handle missing native modules in Expo Go
let Share: any;
try {
     Share = require('react-native-share').default;
} catch (e) {
     console.warn("native modules are not available in Expo Go.");
}

const parsePageRange = (rangeStr: string, maxPages: number) => {
     if (!rangeStr.trim()) return 0;
     const parts = rangeStr.split(',');
     let count = 0;
     const processedPages = new Set();

     parts.forEach(part => {
          const range = part.trim().split('-');
          if (range.length === 2) {
               const start = parseInt(range[0]);
               const end = parseInt(range[1]);
               if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.max(1, start); i <= Math.min(end, maxPages); i++) {
                         processedPages.add(i);
                    }
               }
          } else {
               const page = parseInt(range[0]);
               if (!isNaN(page) && page >= 1 && page <= maxPages) {
                    processedPages.add(page);
               }
          }
     });
     return processedPages.size;
};

const getUpiParam = (url: string, param: string) => {
     const regex = new RegExp(`(?:[?&]|^)${param}=([^&^#]*)`, 'i');
     const match = url.match(regex);
     return match ? decodeURIComponent(match[1]) : null;
};

const PrintSettings = () => {
     const router = useRouter();
     const { files, vendorId, vendorPhone, bwPrice, colorPrice, upiId, vendorName } = useLocalSearchParams<{ 
          files: string, 
          vendorId: string, 
          vendorPhone: string,
          bwPrice: string,
          colorPrice: string,
          upiId: string,
          vendorName: string
     }>();
     const uploadedFiles = files ? JSON.parse(files) as Array<{ uri: string, name: string, mimeType: string }> : [];

     const [copies, setCopies] = useState(1);
     const [totalPages, setTotalPages] = useState(0);
     const [fullDocPages, setFullDocPages] = useState(0);
     const [totalCost, setTotalCost] = useState(0);
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
     const [showPaymentModal, setShowPaymentModal] = useState(false);
     const [isCopied, setIsCopied] = useState(false);
     const [pendingAmount, setPendingAmount] = useState('0.00');
     const [isUploading, setIsUploading] = useState(false);

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
                                   const countMatch = content.match(/\/Count\s+(\d+)/);
                                   if (countMatch && countMatch[1]) {
                                        total += parseInt(countMatch[1]);
                                   } else {
                                        const pageMatches = content.match(/\/Type\s*\/Page\b/g);
                                        total += pageMatches ? pageMatches.length : 1;
                                   }
                              } catch (e) {
                                   total += 1;
                              }
                         } else {
                              total += 1;
                         }
                    }
                    setFullDocPages(total);
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

     useEffect(() => {
          if (formData.pageSelection === 'All') {
               setTotalPages(fullDocPages);
          } else if (formData.pageSelection === 'Custom') {
               const count = parsePageRange(formData.customRange, fullDocPages);
               setTotalPages(count);
          }
     }, [formData.pageSelection, formData.customRange, fullDocPages]);

     useEffect(() => {
          const price = formData.colorMode === 'Colored' ? parseFloat(colorPrice || "0") : parseFloat(bwPrice || "0");
          const cost = totalPages * copies * price;
          setTotalCost(cost);
     }, [totalPages, copies, formData.colorMode, bwPrice, colorPrice]);

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

     const performUpload = async () => {
          setIsUploading(true);
          try {
               const { token } = await getAuthData();
               const uploadResults = await Promise.all(uploadedFiles.map(async (file) => {
                    const urlResponse = await fetch(`${API_URL}/vendors/files/upload-url`, {
                         method: 'POST',
                         headers: { 
                              'Content-Type': 'application/json',
                              'x-auth-token': token || ''
                         },
                         body: JSON.stringify({
                              vendorId: vendorId,
                              fileName: file.name,
                              contentType: file.mimeType || 'application/octet-stream'
                         })
                    });

                    if (!urlResponse.ok) {
                         const errorData = await urlResponse.json();
                         throw new Error(errorData.message || "Failed to get upload URL");
                    }

                    const { uploadUrl, filePath } = await urlResponse.json();

                    const uploadRes = await FileSystem.uploadAsync(uploadUrl, file.uri, {
                         httpMethod: 'PUT',
                         uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                         headers: {
                              'Content-Type': 'application/octet-stream'
                         }
                    });

                    if (uploadRes.status < 200 || uploadRes.status >= 300) {
                         throw new Error(`Cloud storage upload failed with status ${uploadRes.status}`);
                    }
                    return filePath;
               }));
               console.log("All files uploaded to R2:", uploadResults);
               return uploadResults;
          } catch (error: any) {
               console.error("Upload to R2 failed:", error);
               throw error;
          } finally {
               setIsUploading(false);
          }
     };

     const initiateWhatsAppSequence = async (finalAmount: string) => {
          if (!Share) {
               Alert.alert("Native Module Required", "WhatsApp sharing needs a custom native build.");
               return;
          }

          try {
               const shortId = Math.random().toString(36).substring(2, 6) + Date.now().toString(36).substring(4, 8);
               const jobId = `job_${shortId}`;
               const printConfig = {
                    job_id: jobId,
                    vendor_id: vendorId,
                    copies: copies,
                    totalPages: totalPages,
                    pageSelection: formData.pageSelection,
                    customRange: formData.customRange,
                    color: formData.colorMode,
                    final_amount: finalAmount
               };

               const jsonString = JSON.stringify(printConfig, null, 2);
               const jsonFilePath = `${FileSystem.cacheDirectory}${jobId}.json`;
               await FileSystem.writeAsStringAsync(jsonFilePath, jsonString, { encoding: FileSystem.EncodingType.UTF8 });

               const renamedFiles = [];
               for (let i = 0; i < uploadedFiles.length; i++) {
                    const file = uploadedFiles[i];
                    const extMatch = file.name.match(/\.[0-9a-z]+$/i);
                    const ext = extMatch ? extMatch[0] : '.pdf';
                    const fileSuffix = uploadedFiles.length > 1 ? `_${i + 1}` : '';
                    const renamedPath = `${FileSystem.cacheDirectory}${jobId}${fileSuffix}${ext}`;
                    await FileSystem.copyAsync({ from: file.uri, to: renamedPath });
                    renamedFiles.push(renamedPath);
               }

               const fileUrls = [jsonFilePath, ...renamedFiles].map(path => `file://${path}`);
               const processedPhone = (vendorPhone || '').startsWith('91') ? vendorPhone : `91${vendorPhone}`;
               const shareOptions = {
                    title: 'Send Print Job',
                    social: Share.Social.WHATSAPP,
                    whatsAppNumber: processedPhone,
                    urls: fileUrls,
                    type: '*/*',
                    failOnCancel: false,
               };
               await Share.shareSingle(shareOptions as any);

               try {
                    const { token } = await getAuthData();
                    const statsResponse = await fetch(`${API_URL}/vendors/increment-stats`, {
                         method: 'POST',
                         headers: { 
                               'Content-Type': 'application/json',
                               'x-auth-token': token || ''
                          },
                          body: JSON.stringify({
                               vendorId: vendorId,
                               pages: totalPages * copies
                          })
                     });
                     if (!statsResponse.ok) console.warn("Failed to update stats on server");
               } catch (statsErr) {
                    console.error("Stats update error:", statsErr);
               }
          } catch (error) {
               console.error("WhatsApp share error:", error);
               Alert.alert("Error", "Failed to share files with vendor.");
          }
     };

     const handleCheckout = async () => {
          if (uploadedFiles.length === 0) {
               Alert.alert("Error", "No files selected to print.");
               return;
          }

          if (!upiId) {
               Alert.alert("Payment Error", "This vendor has not set up their UPI ID yet. Please contact them directly.");
               return;
          }

          if (!vendorPhone) {
               Alert.alert("Contact Error", "This vendor has no phone number listed for WhatsApp sharing.");
               return;
          }

          // Calculate final amount with random verification decimals
          const randomVerification = (Math.floor(Math.random() * 19) + 1) / 100;
          const finalAmount = (totalCost + randomVerification).toFixed(2);
          
          setPendingAmount(finalAmount);
          setShowPaymentModal(true);
     };

     const copyToClipboard = async () => {
          try {
               if (Clipboard && Clipboard.setStringAsync) {
                    await Clipboard.setStringAsync(upiId || '');
               } else {
                    // Very simple fallback or just alert
                    Alert.alert("Copy Failed", "Please manually copy the UPI ID: " + upiId);
                    return;
               }
               setIsCopied(true);
               setTimeout(() => setIsCopied(false), 2000);
          } catch (err) {
               console.error("Clipboard error:", err);
               Alert.alert("Copy Failed", "Please manually copy the UPI ID.");
          }
     };

     return (
          <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
               <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                         <ChevronLeft size={24} color="#2e3563" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Print Settings</Text>
               </View>
               <View style={styles.summaryBanner}>
                    <View style={styles.summaryItem}>
                         <FileText size={20} color="#1271dd" />
                         <Text style={styles.summaryLabel}>{uploadedFiles.length} {uploadedFiles.length === 1 ? 'File' : 'Files'}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                         <Hash size={20} color="#1271dd" />
                         <Text style={styles.summaryLabel}>
                              {isLoadingPages ? 'Counting...' : `${totalPages} Total Pages`}
                         </Text>
                    </View>
               </View>
               
               <View style={styles.totalPriceStick}>
                    <View>
                        <Text style={styles.stickLabel}>Total Cost</Text>
                        <Text style={styles.stickValue}>₹{totalCost.toFixed(2)}</Text>
                    </View>
                     <TouchableOpacity
                         style={[styles.stickBtn, isUploading && { opacity: 0.7 }]}
                         onPress={handleCheckout}
                         disabled={isUploading}
                     >
                         {isUploading ? (
                              <ActivityIndicator color="#ffffff" size="small" />
                         ) : (
                              <Text style={styles.stickBtnText}>PRINT NOW</Text>
                         )}
                     </TouchableOpacity>
               </View>

               <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 }]}>
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

                    {renderDropdown('Color Mode', 'colorMode', ['Colored', 'Black & White', 'Grayscale'])}

                    <View style={styles.section}>
                         <Text style={styles.label}>Number of copies</Text>
                         <View style={styles.copiesSection}>
                              <TextInput
                                   style={styles.copiesInput}
                                   value={copies.toString()}
                                   keyboardType="numeric"
                                   onChangeText={(text) => setCopies(parseInt(text) || 1)}
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

                    {renderDropdown('Layout', 'layout', ['Portrait', 'Landscape'])}

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
                </ScrollView>

               <Modal
                    visible={showPaymentModal}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setShowPaymentModal(false)}
               >
                    <View style={styles.modalOverlay}>
                         <View style={styles.modalContent}>
                              <View style={styles.modalHeader}>
                                   <Text style={styles.modalTitle}>Complete Payment</Text>
                                   <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                                        <X size={24} color="#2e3563" />
                                   </TouchableOpacity>
                              </View>

                              <ScrollView contentContainerStyle={styles.modalScroll}>
                                   <View style={styles.qrContainer}>
                                        <QRCode
                                             value={`upi://pay?pa=${upiId}&pn=${encodeURIComponent(vendorName || "Merchant")}&am=${pendingAmount}&cu=INR&tn=${encodeURIComponent(`Printr Job ${vendorId}`)}`}
                                             size={220}
                                             color="#2e3563"
                                        />
                                   </View>

                                   <Text style={styles.hintText}>Scan this QR using any UPI app (GPay, PhonePe, Paytm)</Text>

                                   <View style={styles.manualEntryBox}>
                                        <Text style={styles.manualLabel}>Or pay to UPI ID:</Text>
                                        <TouchableOpacity style={styles.upiCopyBox} onPress={copyToClipboard}>
                                             <Text style={styles.upiIdDisplayText}>{upiId}</Text>
                                             {isCopied ? <Check size={18} color="#10b981" /> : <Copy size={18} color="#1271dd" />}
                                        </TouchableOpacity>
                                   </View>

                                   <View style={styles.paymentSummary}>
                                        <View style={styles.summaryRow}>
                                             <Text style={styles.summaryRowLabel}>Amount:</Text>
                                             <Text style={styles.summaryRowValue}>₹{pendingAmount}</Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                             <Text style={styles.summaryRowLabel}>Note:</Text>
                                             <Text style={styles.summaryRowValue} numberOfLines={1}>Printr Job {vendorId}</Text>
                                        </View>
                                   </View>

                                    <View style={styles.verificationNote}>
                                         <Text style={styles.verificationNoteText}>
                                              * Printing will only be done when the payment is verified by the vendor
                                         </Text>
                                    </View>

                                    <TouchableOpacity 
                                         style={[styles.confirmPaymentBtn, isUploading && { opacity: 0.7 }]}
                                         disabled={isUploading}
                                         onPress={async () => {
                                              try {
                                                   // 1. Upload to R2 first
                                                   await performUpload();
                                                   // 2. Complete the process
                                                   setShowPaymentModal(false);
                                                   initiateWhatsAppSequence(pendingAmount);
                                              } catch (err: any) {
                                                   Alert.alert("Upload Failed", "Could not upload files to secure storage. Please check your connection.");
                                              }
                                         }}
                                    >
                                         {isUploading ? (
                                              <ActivityIndicator color="#ffffff" size="small" />
                                         ) : (
                                              <Text style={styles.confirmPaymentText}>I HAVE PAID</Text>
                                         )}
                                    </TouchableOpacity>
                                    
                                    <Text style={styles.securityNote}>Your files will be securely stored and shared with the vendor after payment.</Text>
                              </ScrollView>
                         </View>
                    </View>
               </Modal>
          </SafeAreaView>
     );
};

const styles = StyleSheet.create({
     container: { flex: 1, backgroundColor: '#ffffff' },
     header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 10, gap: 16 },
     backButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f5f7fa', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e1e4e8' },
     content: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 },
     title: { fontSize: 24, fontWeight: '700', color: '#2e3563' },
     section: { marginBottom: 32 },
     label: { fontSize: 16, fontWeight: '700', color: '#2e3563', marginBottom: 16, letterSpacing: 0.3 },
     pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
     optionButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1.5, borderColor: '#e1e4e8', backgroundColor: '#ffffff' },
     optionButtonSelected: { backgroundColor: '#1271dd', borderColor: '#1271dd' },
     optionText: { color: '#2e3563', fontWeight: '600', fontSize: 14 },
     optionTextSelected: { color: '#ffffff' },
     copiesSection: { flexDirection: 'row', alignItems: 'center', gap: 16 },
     copiesInput: { width: 80, height: 52, borderWidth: 1.5, borderColor: '#e1e4e8', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, fontWeight: '600', color: '#2e3563', backgroundColor: '#fcfdfe' },
     stepperContainer: { flexDirection: 'row', borderWidth: 1.5, borderColor: '#e1e4e8', borderRadius: 12, backgroundColor: '#ffffff', overflow: 'hidden' },
     stepperButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
     stepperDivider: { width: 1.5, height: '100%', backgroundColor: '#e1e4e8' },
     textInput: { marginTop: 12, height: 52, borderWidth: 1.5, borderColor: '#e1e4e8', borderRadius: 12, paddingHorizontal: 16, fontSize: 15, color: '#2e3563', backgroundColor: '#fcfdfe' },
     pagesList: { gap: 14 },
     doubleSidedList: { gap: 14 },
     radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
     radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#e1e4e8', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
     radioSelected: { borderColor: '#1271dd', borderWidth: 6 },
     radioLabel: { fontSize: 15, fontWeight: '500', color: '#2e3563' },
     buttonRow: { flexDirection: 'row', gap: 16, marginTop: 16 },
     actionButton: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
     cancelButton: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#e1e4e8' },
     printButton: { backgroundColor: '#1271dd', shadowColor: '#1271dd', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
     buttonText: { color: '#2e3563', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
     checkoutButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
     fileSummaryList: { backgroundColor: '#f8fbff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e3f0ff' },
     fileSummaryItem: { paddingVertical: 4 },
     fileSummaryName: { fontSize: 14, color: '#1271dd', fontWeight: '500' },
     summaryBanner: { flexDirection: 'row', backgroundColor: '#eff6ff', marginHorizontal: 24, marginTop: 8, marginBottom: 16, padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'space-around', borderWidth: 1, borderColor: '#bfdbfe' },
     summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
     summaryLabel: { fontSize: 15, fontWeight: '700', color: '#2e3563' },
     summaryDivider: { width: 1, height: 24, backgroundColor: '#bfdbfe' },
     totalPriceStick: {
          backgroundColor: '#ffffff',
          flexDirection: 'row',
          padding: 24,
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTopWidth: 1,
          borderColor: '#f0f0f0',
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 10,
     },
     stickLabel: {
          fontSize: 12,
          color: '#979797',
          fontWeight: '500',
          textTransform: 'uppercase',
          letterSpacing: 1,
     },
     stickValue: {
          fontSize: 24,
          fontWeight: '800',
          color: '#2e3563',
          marginTop: 2,
     },
     stickBtn: {
          backgroundColor: '#1271dd',
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: 14,
          shadowColor: '#1271dd',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 5,
     },
     stickBtnText: {
          color: '#ffffff',
          fontWeight: '700',
          fontSize: 16,
     },
     modalOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'flex-end',
     },
     modalContent: {
          backgroundColor: '#ffffff',
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          maxHeight: '85%',
          paddingBottom: Platform.OS === 'ios' ? 40 : 20,
     },
     modalHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 24,
          borderBottomWidth: 1,
          borderBottomColor: '#f0f0f0',
     },
     modalTitle: {
          fontSize: 20,
          fontWeight: '800',
          color: '#2e3563',
     },
     modalScroll: {
          padding: 24,
          alignItems: 'center',
     },
     qrContainer: {
          padding: 20,
          backgroundColor: '#f8fbff',
          borderRadius: 24,
          borderWidth: 2,
          borderColor: '#eff6ff',
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.05,
          shadowRadius: 15,
          elevation: 5,
     },
     hintText: {
          fontSize: 14,
          color: '#64748b',
          textAlign: 'center',
          marginBottom: 24,
          fontWeight: '500',
     },
     manualEntryBox: {
          width: '100%',
          marginBottom: 24,
     },
     manualLabel: {
          fontSize: 13,
          fontWeight: '600',
          color: '#94a3b8',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
     },
     upiCopyBox: {
          flexDirection: 'row',
          backgroundColor: '#f1f5f9',
          padding: 16,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: '#e2e8f0',
     },
     upiIdDisplayText: {
          fontSize: 16,
          fontWeight: '700',
          color: '#2e3563',
     },
     paymentSummary: {
          width: '100%',
          backgroundColor: '#f8fbff',
          padding: 20,
          borderRadius: 16,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: '#e0f2fe',
     },
     summaryRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 8,
     },
     summaryRowLabel: {
          fontSize: 14,
          color: '#64748b',
          fontWeight: '500',
     },
     summaryRowValue: {
          fontSize: 14,
          color: '#2e3563',
          fontWeight: '700',
     },
     confirmPaymentBtn: {
          width: '100%',
          backgroundColor: '#10b981',
          paddingVertical: 18,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#10b981',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
          elevation: 5,
          marginBottom: 16,
     },
     confirmPaymentText: {
          color: '#ffffff',
          fontSize: 16,
          fontWeight: '800',
          letterSpacing: 1,
     },
     securityNote: {
          fontSize: 12,
          color: '#94a3b8',
          textAlign: 'center',
          lineHeight: 18,
     },
     verificationNote: {
          backgroundColor: '#fff4e5',
          padding: 12,
          borderRadius: 10,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#ffe8cc',
          width: '100%',
     },
     verificationNoteText: {
          fontSize: 12,
          color: '#d97706',
          textAlign: 'center',
          fontWeight: '600',
          lineHeight: 18,
     },
});

export default PrintSettings;