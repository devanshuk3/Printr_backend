import React, { JSX, useState, useEffect, useCallback } from "react";
import { sharedFullName, setSharedFullName } from "../../utils/sharedState";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { clearAuthData, saveAuthData } from "../../utils/authStorage";
import * as IntentLauncher from "expo-intent-launcher";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { FilePreviewModal } from "../../components/modals/FilePreviewModal";
import { Linking } from "react-native";
import { API_URL } from "../../constants/apiConfig";
import { getAvatarHash, getRobohashUrl } from "../../utils/avatar";
import * as SecureStore from 'expo-secure-store';
import {
  CloudUpload,
  RefreshCcw,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  ChevronRight,
  LogOut,
  Trash2,
  User,
  Mail,
  UserCircle,
  LayoutDashboard,
  Eye,
  MoreHorizontal
} from "lucide-react-native";
import { getAuthData, UserData } from "../../utils/authStorage";
import { Modal } from 'react-native';
import { decode } from "base64-arraybuffer";

// ─── Data ────────────────────────────────────────────────────────────────────

// History data will be fetched dynamically from the backend

// Lucide icons are imported directly, so we don't need the local icon components

export default function HomePage() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [hasUploaded, setHasUploaded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ uri: string, name: string, mimeType: string }>>([]);
  const [activePreviewFile, setActivePreviewFile] = useState<{ uri: string, mimeType: string } | null>(null);
  const [isImagePreviewVisible, setIsImagePreviewVisible] = useState(false);
  const [verifiedVendor, setVerifiedVendor] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // Profile State
  const params = useLocalSearchParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isProfileVisible, setIsProfileVisible] = useState(false);
  const [isUsernameModalVisible, setIsUsernameModalVisible] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [profileSeedOffset, setProfileSeedOffset] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const { user } = await getAuthData();
      if (user) {
        setUserData(user);
        setSharedFullName(user.fullName);
        setNewUsername(user.username);
        
        // Show username modal ONLY if isNewUser param is present
        if (params.isNewUser === 'true') {
          setIsUsernameModalVisible(true);
        }
        
        // Initialize offset from user data
        if (user.profileSeedOffset !== undefined) {
          setProfileSeedOffset(user.profileSeedOffset);
        }
      }
    };
    fetchUser();
  }, [params.isNewUser]);

  // Load saved vendor ID from SecureStore on mount
  useEffect(() => {
    const loadVendorId = async () => {
      try {
        const savedVendorId = await SecureStore.getItemAsync('saved_vendor_id');
        if (savedVendorId) {
          setVendorId(savedVendorId);
        }
      } catch (error) {
        console.error('Error loading saved vendor ID:', error);
      }
    };
    loadVendorId();
  }, []);

  const calculatePageCount = async (files: any[]) => {
    let total = 0;
    for (const file of files) {
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
    return total;
  };

  // Fetch print history from backend
  const fetchHistory = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      const { token } = await getAuthData();
      if (!token) return;

      const response = await fetch(`${API_URL}/vendors/files/history`, {
        headers: { 'x-auth-token': token || '' }
      });

      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const handleUpdateUsername = async () => {
    if (!newUsername.trim()) {
      Alert.alert("Error", "Username cannot be empty");
      return;
    }

    setUsernameLoading(true);
    try {
      const { token } = await getAuthData();
      const response = await fetch(`${API_URL}/auth/username`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || '',
        },
        body: JSON.stringify({ username: newUsername }),
      });

      const data = await response.json();

      if (response.ok) {
        // Update local state
        const updatedUser = { ...userData!, username: newUsername };
        setUserData(updatedUser);
        await saveAuthData(token || '', updatedUser);
        setIsUsernameModalVisible(false);
        Alert.alert("Success", "Username updated successfully!");
      } else {
        Alert.alert("Error", data.message || "Failed to update username");
      }
    } catch (error) {
      console.error("Update username error:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setUsernameLoading(false);
    }
  };

  const handleVerifyVendor = async () => {
    if (!vendorId.trim()) {
      Alert.alert("Error", "Please enter a Vendor ID");
      return;
    }

    const normalizedVendorId = vendorId.trim().toLowerCase();
    setIsVerifying(true);
    try {
      const response = await fetch(`${API_URL}/vendors/verify/${normalizedVendorId}`);
      const contentType = response.headers.get("content-type");
      
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("API returned non-JSON response:", text.substring(0, 200));
        throw new Error("Server returned an invalid response (HTML). Please ensure the backend is running and updated.");
      }

      const data = await response.json();

      if (response.ok) {
        setVerifiedVendor(data);
        // Save vendor ID to SecureStore for persistence
        try {
          await SecureStore.setItemAsync('saved_vendor_id', vendorId);
        } catch (e) {
          console.warn('Could not save vendor ID:', e);
        }
        // Default total pages to Number of files if not already set
        if (totalPages === 0) setTotalPages(uploadedFiles.length || 1);
        Alert.alert("Success", `Vendor: ${data.name} verified!`);
      } else {
        setVerifiedVendor(null);
        Alert.alert("Error", data.message || "Vendor not found");
      }
    } catch (error: any) {
      console.error("Verify Vendor Error:", error);
      Alert.alert("Error", error.message || "Could not verify vendor. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const robohashUrl = userData 
    ? getRobohashUrl(userData.username || userData.id.toString(), profileSeedOffset)
    : null;

  const handleChangeProfileIcon = async () => {
    const newOffset = profileSeedOffset + 1;
    setProfileSeedOffset(newOffset);
    
    // Persist Choice
    if (userData) {
      const { token } = await getAuthData();
      const updatedUser = { ...userData, profileSeedOffset: newOffset };
      setUserData(updatedUser);
      await saveAuthData(token || '', updatedUser);
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
             try {
                const { token } = await getAuthData();
                const response = await fetch(`${API_URL}/auth/account`, {
                   method: 'DELETE',
                   headers: {
                      'x-auth-token': token || '',
                   },
                });

                if (response.ok) {
                   await clearAuthData();
                   setIsProfileVisible(false);
                   router.replace("/(auth)/login");
                } else {
                   const data = await response.json();
                   Alert.alert("Error", data.message || "Failed to delete account");
                }
             } catch (error) {
                console.error("Delete account error:", error);
                Alert.alert("Error", "An unexpected error occurred.");
             }
          }
        }
      ]
    );
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "image/*",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ],
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (result.assets.length > 10) {
           Alert.alert("Limit Reached", "You can only upload up to 10 files at a time.");
           return;
        }
        const filteredAssets = result.assets.filter(asset => {
          const mime = asset.mimeType?.toLowerCase() || "";
          const name = asset.name.toLowerCase();
          
          // Explicitly block Videos if they somehow bypassed the picker filter
          if (mime.startsWith("video/") || name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".avi")) {
            return false;
          }
          return true;
        });

        if (filteredAssets.length === 0) {
          Alert.alert("Invalid File", "Videos and GIFs are not supported for printing.");
          return;
        }

        setIsUploading(true);
        const newFilesList = await Promise.all(filteredAssets.map(async (asset) => {
          const fileName = asset.name;
          const destinationUri = (FileSystem.documentDirectory || "") + fileName;

          // Copy locally first for preview/counting/sending to preferences
          await FileSystem.copyAsync({
            from: asset.uri,
            to: destinationUri,
          });

          return {
            uri: destinationUri,
            name: fileName,
            mimeType: asset.mimeType || "application/octet-stream",
          };
        }));

        const updatedFiles = [...uploadedFiles, ...newFilesList];
        setUploadedFiles(updatedFiles);
        setHasUploaded(true);
        
        // Automatically calculate pages for price preview
        const pages = await calculatePageCount(updatedFiles);
        setTotalPages(pages);
        
        if (filteredAssets.length < result.assets.length) {
          Alert.alert("Notice", `Some files were excluded. Only PDF, Images, Word, PPT, and Excel are allowed.`);
        } else {
          Alert.alert("Success", `${newFilesList.length} file(s) added successfully.`);
        }
      }
    } catch (err) {
      console.error("Error picking/storing document:", err);
      Alert.alert("Error", "Failed to pick or store file.");
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = async (index: number) => {
    const updatedFiles = [...uploadedFiles];
    updatedFiles.splice(index, 1);
    setUploadedFiles(updatedFiles);
    if (updatedFiles.length === 0) {
      setHasUploaded(false);
      setTotalPages(0);
    } else {
      const pages = await calculatePageCount(updatedFiles);
      setTotalPages(pages);
    }
  };

  const handlePreview = async (uri: string, mime: string) => {
    const lowerUri = uri.toLowerCase();
    const isImage =
      mime?.startsWith("image/") ||
      lowerUri.endsWith(".jpg") ||
      lowerUri.endsWith(".jpeg") ||
      lowerUri.endsWith(".png") ||
      lowerUri.endsWith(".gif") ||
      lowerUri.endsWith(".webp");

    const isPdf = mime === "application/pdf" || lowerUri.endsWith(".pdf");

    if (isImage) {
      setActivePreviewFile({ uri, mimeType: mime });
      setIsImagePreviewVisible(true);
      return;
    }

    if (isPdf || !isImage) {
      try {
        if (Platform.OS === "android") {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            flags: 1,
            type: mime || "application/pdf",
          });
        } else {
          const isAvailable = await Sharing.isAvailableAsync();
          if (!isAvailable) {
            Alert.alert("Error", "No apps available to open this file type.");
            return;
          }
          await Sharing.shareAsync(uri, {
            mimeType: mime || "application/pdf",
          });
        }
      } catch (err) {
        console.error("Preview error:", err);
        Alert.alert("Error", "Failed to open the file.");
      }
      return;
    }
  };

  const handleSave = () => {
    if (!hasUploaded) {
      Alert.alert("Error", "Please upload a file first.");
      return;
    }
    if (!vendorId.trim()) {
      Alert.alert("Error", "Please enter a Vendor ID.");
      return;
    }
    if (!verifiedVendor) {
      Alert.alert("Vendor Required", "Please click 'Verify' to confirm your Vendor ID before proceeding.");
      return;
    }
    router.push({
      pathname: "/print-preferences",
      params: { 
        files: JSON.stringify(uploadedFiles),
        vendorId: vendorId,
        bwPrice: verifiedVendor?.price_per_page?.toString() || "0",
        colorPrice: verifiedVendor?.color_price?.toString() || "0",
        vendorPhone: verifiedVendor?.phone || "",
        upiId: verifiedVendor?.upi_id || "",
        vendorName: verifiedVendor?.shop_name || verifiedVendor?.name || "Vendor"
      },
    } as any);
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* ── Header ── */}
        {/* ── Username Choice Modal (For New Google Users) ── */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isUsernameModalVisible}
          onRequestClose={() => setIsUsernameModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.usernameModal}>
              <View style={styles.usernameModalHeader}>
                <View style={styles.usernameRobohashWrapper}>
                  <Image 
                    source={{ uri: getRobohashUrl(newUsername || "user", profileSeedOffset) }} 
                    style={styles.usernameRobohash} 
                  />
                </View>
                <Text style={styles.usernameModalTitle}>Choose your username</Text>
                <Text style={styles.usernameModalSubtitle}>
                  Welcome to printr! You've logged in with Google. Before you start, please pick a unique username.
                </Text>
              </View>

              <View style={styles.usernameForm}>
                <View style={styles.usernameInputWrapper}>
                  <Text style={styles.atSymbol}>@</Text>
                  <TextInput
                    style={styles.usernameInput}
                    placeholder="your_username"
                    value={newUsername}
                    onChangeText={setNewUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <TouchableOpacity 
                  style={[styles.usernameSubmitBtn, usernameLoading && { opacity: 0.7 }]}
                  onPress={handleUpdateUsername}
                  disabled={usernameLoading}
                >
                  {usernameLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.usernameSubmitText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Profile Modal ── */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isProfileVisible}
          onRequestClose={() => setIsProfileVisible(false)}
        >
          <View style={styles.modalOverlay}>-+
            <View style={styles.profileModal}>
              <View style={styles.profileModalHeader}>
                <Text style={styles.profileModalTitle}>My Profile</Text>
                <TouchableOpacity onPress={() => setIsProfileVisible(false)} style={styles.closeModalBtn}>
                  <XCircle size={24} color="#979797" />
                </TouchableOpacity>
              </View>

              <View style={styles.profileContent}>
                <View style={styles.profileImageLargeOuter}>
                  <View style={styles.profileImageLargeInner}>
                    {robohashUrl ? (
                      <Image source={{ uri: robohashUrl }} style={styles.profileImageLarge} />
                    ) : (
                      <UserCircle size={100} color="#1271dd" />
                    )}
                  </View>
                  <TouchableOpacity 
                    style={styles.changeProfileIconBtn}
                    onPress={handleChangeProfileIcon}
                    activeOpacity={0.8}
                  >
                    <RefreshCcw size={18} color="#1271dd" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                <View style={styles.profileInfoList}>
                  <View style={styles.profileInfoItem}>
                    <User size={20} color="#1271dd" />
                    <View style={styles.profileInfoTextContainer}>
                      <Text style={styles.profileInfoLabel}>Full Name</Text>
                      <Text style={styles.profileInfoValue}>{userData?.fullName}</Text>
                    </View>
                  </View>

                  <View style={styles.profileInfoItem}>
                    <UserCircle size={20} color="#1271dd" />
                    <View style={styles.profileInfoTextContainer}>
                      <Text style={styles.profileInfoLabel}>Username</Text>
                      <Text style={styles.profileInfoValue}>@{userData?.username}</Text>
                    </View>
                  </View>

                  <View style={styles.profileInfoItem}>
                    <Mail size={20} color="#1271dd" />
                    <View style={styles.profileInfoTextContainer}>
                      <Text style={styles.profileInfoLabel}>E-mail Address</Text>
                      <Text style={styles.profileInfoValue}>{userData?.email}</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.profileLogoutBtn}
                  onPress={async () => {
                    setIsProfileVisible(false);
                    await clearAuthData();
                    router.replace("/(auth)/login");
                  }}
                >
                  <LogOut size={20} color="#ffffff" />
                  <Text style={styles.profileLogoutText}>Log Out</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.profileDeleteBtn}
                  onPress={handleDeleteAccount}
                >
                  <Trash2 size={20} color="#e31e1e" />
                  <Text style={styles.profileDeleteText}>Delete Account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <FilePreviewModal
          visible={isImagePreviewVisible}
          onClose={() => {
            setIsImagePreviewVisible(false);
            setActivePreviewFile(null);
          }}
          fileUri={activePreviewFile?.uri || null}
          mimeType={activePreviewFile?.mimeType || null}
        />
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.welcomeText}>
              {"Welcome,\n" + sharedFullName}
            </Text>
            <View style={styles.headerIcons}>
              {userData?.username === "admin" && (
                <TouchableOpacity 
                  style={[styles.iconCircle, { backgroundColor: '#1271dd', borderColor: '#1271dd' }]}
                  onPress={() => router.push("/(admin)/vendors")}
                >
                  <LayoutDashboard size={20} color="#ffffff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={styles.profileIconCircle}
                onPress={() => setIsProfileVisible(true)}
              >
                {robohashUrl ? (
                  <Image source={{ uri: robohashUrl }} style={styles.profileImageSmall} />
                ) : (
                  <User size={20} color="#2e3563" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconCircle}
                onPress={async () => {
                  try {
                    await clearAuthData();
                    router.replace("/(auth)/login");
                  } catch (error) {
                    console.error("Logout error:", error);
                    router.replace("/(auth)/login");
                  }
                }}
              >
                <LogOut size={20} color="#e31e1e" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Vendor ID ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleLeft}>
            Please enter your{"\n"}vendor&apos;s id
          </Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              placeholder="Vendor id"
              placeholderTextColor="#979797"
              value={vendorId}
              onChangeText={(text) => {
                const normalizedText = text.toLowerCase();
                setVendorId(normalizedText);

                // Persist to SecureStore so it survives navigations and restarts
                if (normalizedText.trim()) {
                  SecureStore.setItemAsync('saved_vendor_id', normalizedText.trim()).catch(() => {});
                } else {
                  SecureStore.deleteItemAsync('saved_vendor_id').catch(() => {});
                }
              }}
            />
          </View>
          <TouchableOpacity 
            style={[styles.verifyButton, isVerifying && { opacity: 0.7 }]} 
            onPress={handleVerifyVendor}
            disabled={isVerifying}
            activeOpacity={0.85}
          >
            {isVerifying ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify</Text>
            )}
          </TouchableOpacity>

          {verifiedVendor && (
            <View style={styles.vendorInfoCard}>
              <View style={styles.vendorInfoHeader}>
                <Text style={styles.vendorInfoName}>{verifiedVendor.name}</Text>
                <View style={styles.vendorPriceBadge}>
                  <Text style={styles.vendorPriceText}>₹{verifiedVendor.price_per_page}/page</Text>
                </View>
              </View>
              
              <View style={styles.pricingCalculator}>
                <View style={styles.totalAmountContainerNoInput}>
                  <View style={styles.totalAmountLabelCol}>
                    <Text style={styles.pricingLabel}>Estimated Pages</Text>
                    <Text style={styles.pricingSubLabel}>Based on uploaded files</Text>
                  </View>
                  <Text style={styles.totalAmountValueLarge}>₹{(totalPages * verifiedVendor.price_per_page).toFixed(2)}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Upload Files ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleLeft}>Upload files</Text>
          <Text style={styles.subtitle}>Upload files to the server</Text>
          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.uploadCard}
            activeOpacity={0.8}
            onPress={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="large" color="#1271dd" style={{ marginBottom: 16 }} />
            ) : (
              <CloudUpload size={48} color={hasUploaded ? "#1271dd" : "#737373"} strokeWidth={1.5} />
            )}
            <Text style={styles.uploadMainText}>
              {isUploading ? (
                <Text style={styles.uploadTextBlue}>Uploading Files...</Text>
              ) : hasUploaded ? (
                <Text style={styles.uploadTextBlue}>{uploadedFiles.length} File(s) Selected</Text>
              ) : (
                <>
                  <Text style={styles.uploadTextGray}>Drag &amp; drop or </Text>
                  <Text style={styles.uploadTextBlue}>choose files</Text>
                </>
              )}
            </Text>
            <Text style={styles.uploadSubText}>
              PDF, Image, Document, PPT, Excel
            </Text>
          </TouchableOpacity>

          {/* List of uploaded files */}
          {uploadedFiles.length > 0 && (
            <View style={styles.fileList}>
              {uploadedFiles.map((file, index) => (
                <View key={`file-${index}`} style={styles.fileItem}>
                  <View style={styles.fileItemLeft}>
                    <FileText size={20} color="#1271dd" />
                    <Text style={styles.fileNameText} numberOfLines={1}>{file.name}</Text>
                  </View>
                  <View style={styles.fileItemRight}>
                    <TouchableOpacity
                      onPress={() => handlePreview(file.uri, file.mimeType)}
                      style={styles.fileActionBtn}
                    >
                      <Text style={styles.fileActionText}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeFile(index)}
                      style={styles.fileActionBtn}
                    >
                      <Trash2 size={18} color="#e31e1e" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.separator} />

          <View style={styles.uploadActions}>
            <TouchableOpacity
              style={[styles.uploadNewButton, isUploading && { opacity: 0.6 }]}
              activeOpacity={0.85}
              onPress={handleUpload}
              disabled={isUploading}
            >
              <Text style={styles.uploadNewButtonText}>
                {isUploading ? "Processing..." : "Upload new"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, (!hasUploaded || !verifiedVendor) && { opacity: 0.5 }]}
              activeOpacity={0.85}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Print History ── */}
        <View style={styles.section}>
          <TouchableOpacity onPress={fetchHistory} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <Text style={[styles.sectionTitleLeft, { marginBottom: 0 }]}>Print history</Text>
             {isLoadingHistory && <RefreshCcw size={16} color="#1271dd" />}
          </TouchableOpacity>

          {history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No recent print jobs found.</Text>
            </View>
          ) : (
            history.map((item: any, index: number) => (
              <View
                key={`print-history-${index}`}
                style={[
                  styles.historyCard,
                  index < history.length - 1 && styles.historyCardGap,
                ]}
              >
                {/* Left: icon */}
                <View style={styles.fileIconCircle}>
                  <FileText size={22} color="#1271dd" strokeWidth={2} />
                </View>

                {/* Middle: Info */}
                <View style={styles.historyInfo}>
                  <Text style={styles.historyFileName} numberOfLines={1} ellipsizeMode="tail">
                    {item.fileName}
                  </Text>
                  <View style={styles.historyMeta}>
                    <Text style={styles.historySenderText}>{item.vendorName}</Text>
                    <View style={styles.dotSeparator} />
                    <Text style={styles.historyMetaText}>{item.time} | {item.date}</Text>
                  </View>
                </View>

                {/* Right: Actions & Status */}
                <View style={styles.historyActions}>
                  <TouchableOpacity 
                    style={styles.viewHistoryBtn}
                    onPress={() => Alert.alert("Job Status", `File "${item.fileName}" is currently ${item.status === 'completed' ? 'printed' : 'on the cloud'}.`)}
                  >
                    <Eye size={18} color="#64748b" />
                  </TouchableOpacity>

                  <View
                    style={[
                      styles.statusBadgeSmall,
                      item.status === "completed" && styles.statusBadgeCompleted,
                      item.status === "in_queue" && styles.statusBadgeQueue,
                      item.status === "failed" && styles.statusBadgeFailed,
                    ]}
                  >
                    {item.status === "completed" && <CheckCircle2 size={16} color="#1271dd" strokeWidth={2.5} />}
                    {item.status === "in_queue" && <Clock size={16} color="#f5a623" strokeWidth={2.5} />}
                    {item.status === "failed" && <XCircle size={16} color="#e31e1e" strokeWidth={2.5} />}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 24,
    marginBottom: 8,
  },
  headerIcons: {
    flexDirection: "row",
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f5f7fa",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e1e4e8",
  },
  welcomeText: {
    fontWeight: "700",
    color: "#2e3563",
    fontSize: 32,
    lineHeight: 40,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitleLeft: {
    fontWeight: "700",
    color: "#2e3563",
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 16,
  },
  subtitle: {
    color: "#9e9e9e",
    fontSize: 14,
    marginBottom: 16,
  },
  separator: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginBottom: 20,
  },
  inputWrapper: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: "#fcfdfe",
    marginBottom: 16,
  },
  textInput: {
    color: "#2e3563",
    fontSize: 16,
    height: 48,
  },
  verifyButton: {
    backgroundColor: "#1271dd",
    borderRadius: 12,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  vendorInfoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e3f0ff",
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  vendorInfoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f7ff",
  },
  vendorInfoName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2e3563",
    flex: 1,
  },
  vendorPriceBadge: {
    backgroundColor: "#eef6ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vendorPriceText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1271dd",
  },
  pricingCalculator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  pageInputContainer: {
    flex: 1,
  },
  pricingLabel: {
    fontSize: 12,
    color: "#979797",
    fontWeight: "600",
    marginBottom: 4,
  },
  pageInput: {
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#e3f0ff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: "#2e3563",
    fontWeight: "700",
  },
  totalAmountContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  totalAmountContainerNoInput: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    width: '100%'
  },
  totalAmountLabelCol: {
    flexDirection: "column",
  },
  totalAmountValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#16a34a",
  },
  totalAmountValueLarge: {
    color: "#2e3563",
    fontSize: 28,
    fontWeight: "800",
  },
  pricingSubLabel: {
    color: "#979797",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500"
  },
  uploadCard: {
    backgroundColor: "#f8fbff",
    borderRadius: 20,
    paddingVertical: 40,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#e3f0ff",
    borderStyle: "dashed",
  },
  uploadMainText: {
    fontSize: 16,
    marginTop: 16,
    fontWeight: "500",
  },
  uploadTextGray: {
    color: "#737373",
  },
  uploadTextBlue: {
    color: "#1271dd",
    fontWeight: "600",
  },
  uploadSubText: {
    color: "#979797",
    fontSize: 12,
    marginTop: 8,
  },
  previewButton: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  previewButtonText: {
    color: "#1271dd",
    fontWeight: "600",
    fontSize: 15,
  },
  uploadActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  uploadNewButton: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  uploadNewButtonText: {
    fontSize: 16,
    color: "#2e3563",
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    height: 56,
    backgroundColor: "#1271dd",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  historyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  historyCardGap: {
    marginBottom: 16,
  },
  emptyHistory: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyHistoryText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
  },
  fileIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#f0f7ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e0efff",
  },
  historyInfo: {
    flex: 1,
    justifyContent: "center",
  },
  historyFileName: {
    color: "#2e3563",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  historyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historySenderText: {
    color: "#1271dd",
    fontSize: 13,
    fontWeight: "600",
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#cbd5e1",
  },
  historyMetaText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "500",
  },
  historyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  viewHistoryBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  statusBadgeSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fcfdfe",
  },
  statusBadgeCompleted: {
    backgroundColor: "#f0fdf4",
  },
  statusBadgeQueue: {
    backgroundColor: "#fffbeb",
  },
  statusBadgeFailed: {
    backgroundColor: "#fef2f2",
  },
  fileList: {
    marginTop: 8,
    marginBottom: 20,
    gap: 10,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1e4e8",
  },
  fileItemLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fileNameText: {
    fontSize: 14,
    color: "#2e3563",
    fontWeight: "500",
    flex: 1,
  },
  fileItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  fileActionBtn: {
    padding: 4,
  },
  fileActionText: {
    color: "#1271dd",
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  profileModal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  profileModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  profileModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2e3563",
  },
  closeModalBtn: {
    padding: 4,
  },
  profileContent: {
    padding: 24,
    alignItems: "center",
  },
  profileImageLargeOuter: {
    position: "relative",
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  profileImageLargeInner: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
    backgroundColor: "#eef6ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#ffffff",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  profileImageLarge: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  profileInfoList: {
    width: "100%",
    gap: 20,
    marginBottom: 32,
  },
  profileInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#f8fbff",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e3f0ff",
  },
  profileInfoTextContainer: {
    flex: 1,
  },
  profileInfoLabel: {
    fontSize: 12,
    color: "#979797",
    fontWeight: "500",
    marginBottom: 2,
  },
  profileInfoValue: {
    fontSize: 15,
    color: "#2e3563",
    fontWeight: "600",
  },
  profileLogoutBtn: {
    width: "100%",
    height: 56,
    backgroundColor: "#1271dd",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#818181ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  profileLogoutText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  profileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eef6ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileImageSmall: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  usernameRobohashWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#ffffff",
    overflow: "hidden",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  usernameRobohash: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  changeProfileIconBtn: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: "#ffffff",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 5,
    borderColor: "#ffffff",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 10,
  },

  profileDeleteBtn: {
    width: "100%",
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#9d9d9dff",
  },
  profileDeleteText: {
    color: "#e31e1e",
    fontSize: 14,
    fontWeight: "700",
  },
  usernameModal: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  usernameModalHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  usernameModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2e3563",
    marginTop: 16,
    textAlign: "center",
  },
  usernameModalSubtitle: {
    fontSize: 14,
    color: "#979797",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  usernameForm: {
    width: "100%",
  },
  usernameInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fbff",
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "#e3f0ff",
    marginBottom: 24,
  },
  atSymbol: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1271dd",
    marginRight: 4,
  },
  usernameInput: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: "#2e3563",
    fontWeight: "600",
  },
  usernameSubmitBtn: {
    height: 56,
    backgroundColor: "#1271dd",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  usernameSubmitText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
