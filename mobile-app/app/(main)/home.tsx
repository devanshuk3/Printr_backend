import React, { JSX, useState, useEffect } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { clearAuthData, saveAuthData } from "../../utils/authStorage";
import * as IntentLauncher from "expo-intent-launcher";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { FilePreviewModal } from "../../components/modals/FilePreviewModal";
import { Linking } from "react-native";
import { API_URL } from "../../constants/apiConfig";
import {
  CloudUpload,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  ChevronRight,
  LogOut,
  Trash2,
  User,
  Mail,
  UserCircle
} from "lucide-react-native";
import { getAuthData, UserData } from "../../utils/authStorage";
import { Modal } from 'react-native';

// ─── Data ────────────────────────────────────────────────────────────────────

const printHistoryData = [
  {
    fileName: "file_name_1",
    time: "09:46",
    date: "22-02-26",
    status: "completed",
    iconSrc:
      "https://c.animaapp.com/mm942dqfWjFW8r/img/free-file-icon-1453-thumb-2.png",
  },
  {
    fileName: "file_name_2",
    time: "12:54",
    date: "20-02-26",
    status: "in_queue",
    iconSrc:
      "https://c.animaapp.com/mm942dqfWjFW8r/img/free-file-icon-1453-thumb-2.png",
  },
  {
    fileName: "file_name_3",
    time: "15:20",
    date: "19-02-26",
    status: "failed",
    iconSrc:
      "https://c.animaapp.com/mm942dqfWjFW8r/img/free-file-icon-1453-thumb-2.png",
  },
];

// Lucide icons are imported directly, so we don't need the local icon components

export default function HomePage() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [hasUploaded, setHasUploaded] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ uri: string, name: string, mimeType: string }>>([]);
  const [activePreviewFile, setActivePreviewFile] = useState<{ uri: string, mimeType: string } | null>(null);
  const [isImagePreviewVisible, setIsImagePreviewVisible] = useState(false);
  
  // Profile State
  const params = useLocalSearchParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isProfileVisible, setIsProfileVisible] = useState(false);
  const [isUsernameModalVisible, setIsUsernameModalVisible] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);

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
      }
    };
    fetchUser();
  }, [params.isNewUser]);

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

  const robohashUrl = userData ? `https://robohash.org/${userData.username || userData.id}.png` : null;

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
        type: "*/*",
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles = await Promise.all(result.assets.map(async (asset) => {
          const fileName = asset.name;
          const destinationUri = (FileSystem.documentDirectory || "") + fileName;

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

        setUploadedFiles(prev => [...prev, ...newFiles]);
        setHasUploaded(true);
        Alert.alert("Success", `${newFiles.length} file(s) added.`);
      }
    } catch (err) {
      console.error("Error picking/storing document:", err);
      Alert.alert("Error", "Failed to pick or store file.");
    }
  };

  const removeFile = (index: number) => {
    const updatedFiles = [...uploadedFiles];
    updatedFiles.splice(index, 1);
    setUploadedFiles(updatedFiles);
    if (updatedFiles.length === 0) setHasUploaded(false);
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
    router.push({
      pathname: "/print-preferences",
      params: { files: JSON.stringify(uploadedFiles) },
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
                <UserCircle size={60} color="#1271dd" />
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
          <View style={styles.modalOverlay}>
            <View style={styles.profileModal}>
              <View style={styles.profileModalHeader}>
                <Text style={styles.profileModalTitle}>My Profile</Text>
                <TouchableOpacity onPress={() => setIsProfileVisible(false)} style={styles.closeModalBtn}>
                  <XCircle size={24} color="#979797" />
                </TouchableOpacity>
              </View>

              <View style={styles.profileContent}>
                <View style={styles.profileImageLargeContainer}>
                  {robohashUrl ? (
                    <Image source={{ uri: robohashUrl }} style={styles.profileImageLarge} />
                  ) : (
                    <UserCircle size={100} color="#1271dd" />
                  )}
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
              onChangeText={setVendorId}
            />
          </View>
          <TouchableOpacity style={styles.verifyButton} activeOpacity={0.85}>
            <Text style={styles.verifyButtonText}>Verify</Text>
          </TouchableOpacity>
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
          >
            <CloudUpload size={48} color={hasUploaded ? "#1271dd" : "#737373"} strokeWidth={1.5} />
            <Text style={styles.uploadMainText}>
              {hasUploaded ? (
                <Text style={styles.uploadTextBlue}>{uploadedFiles.length} File(s) Selected</Text>
              ) : (
                <>
                  <Text style={styles.uploadTextGray}>Drag &amp; drop or </Text>
                  <Text style={styles.uploadTextBlue}>choose files</Text>
                </>
              )}
            </Text>
            <Text style={styles.uploadSubText}>
              Image, PDF, File size max 25 MB
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
              style={styles.uploadNewButton}
              activeOpacity={0.85}
              onPress={handleUpload}
            >
              <Text style={styles.uploadNewButtonText}>Upload new</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, !hasUploaded && { opacity: 0.6 }]}
              activeOpacity={0.85}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Print History ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleLeft}>Print history</Text>

          {printHistoryData.map((item, index) => (
            <View
              key={`print-history-${index}`}
              style={[
                styles.historyCard,
                index < printHistoryData.length - 1 && styles.historyCardGap,
              ]}
            >
              {/* Left: icon + info */}
              <TouchableOpacity style={styles.historyLeftTouch}>
                <View style={styles.historyLeft}>
                  <View style={styles.fileIconCircle}>
                    <FileText size={24} color="#1271dd" />
                  </View>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyFileName} numberOfLines={1}>
                      {item.fileName}
                    </Text>
                    <View style={styles.historyMeta}>
                      <Text style={styles.historyMetaText}>{item.time}</Text>
                      <Text style={styles.historyMetaText}>{item.date}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Right: status badge */}
              <View
                style={[
                  styles.statusBadge,
                  item.status === "completed" && styles.statusBadgeCompleted,
                  item.status === "in_queue" && styles.statusBadgeQueue,
                  item.status === "failed" && styles.statusBadgeFailed,
                ]}
              >
                {item.status === "completed" && <CheckCircle2 size={24} color="#1271dd" />}
                {item.status === "in_queue" && <Clock size={24} color="#f5a623" />}
                {item.status === "failed" && <XCircle size={24} color="#e31e1e" />}
              </View>
            </View>
          ))}
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
    marginTop: 20,
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
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  historyCardGap: {
    marginBottom: 16,
  },
  historyLeftTouch: {
    flex: 1,
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fileIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#f0f7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  historyInfo: {
    flex: 1,
    flexDirection: "column",
  },
  historyFileName: {
    color: "#2e3563",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  historyMeta: {
    flexDirection: "row",
    gap: 8,
  },
  historyMetaText: {
    color: "#979797",
    fontSize: 12,
    fontWeight: "500",
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
  profileImageLargeContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#f0f7ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 4,
    borderColor: "#e3f0ff",
  },
  profileImageLarge: {
    width: 100,
    height: 100,
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
    backgroundColor: "#e31e1e",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#e31e1e",
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
    backgroundColor: "#f0f7ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e3f0ff",
    overflow: "hidden",
  },
  profileImageSmall: {
    width: 28,
    height: 28,
  },
  profileDeleteBtn: {
    width: "100%",
    height: 56,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#e31e1e",
  },
  profileDeleteText: {
    color: "#e31e1e",
    fontSize: 16,
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
