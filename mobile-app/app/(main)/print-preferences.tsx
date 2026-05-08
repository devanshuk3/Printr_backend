import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Linking,
  Modal,
  Animated,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Plus,
  Minus,
  ChevronLeft,
  FileText,
  Hash,
  Copy,
  Check,
  X,
  Smartphone,
  AlertCircle,
  CreditCard,
} from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import { API_URL } from "../../constants/apiConfig";
import { getAuthData } from "../../utils/authStorage";
import { PDFDocument, PageSizes } from "pdf-lib";
import { decode, encode } from "base64-arraybuffer";
// Fallback for Clipboard if native module is missing
let Clipboard: any;
try {
  Clipboard = require("expo-clipboard");
} catch (e) {
  console.warn("Clipboard module not found");
}

import QRCode from "react-native-qrcode-svg";

// Import Share dynamically or handle missing native modules in Expo Go
let Share: any;
try {
  Share = require("react-native-share").default;
} catch (e) {
  console.warn("native modules are not available in Expo Go.");
}

const parsePageRange = (rangeStr: string, maxPages: number) => {
  if (!rangeStr.trim()) return 0;
  const parts = rangeStr.split(",");
  let count = 0;
  const processedPages = new Set();

  parts.forEach((part) => {
    const range = part.trim().split("-");
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
  return Array.from(processedPages).length;
};

const processPdf = async (files: any[], prefs: any) => {
  const finalDoc = await PDFDocument.create();
  const tempDoc = await PDFDocument.create();

  // 1. Merge all files into tempDoc
  for (const file of files) {
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const arrayBuffer = decode(base64);

    let pdfDoc;
    const lowerName = file.name.toLowerCase();
    if (file.mimeType?.includes("pdf") || lowerName.endsWith(".pdf")) {
      try {
        pdfDoc = await PDFDocument.load(arrayBuffer, {
          ignoreEncryption: true,
        });
      } catch (e) {
        console.warn(
          `Failed to parse ${file.name} natively. Trying to continue.`,
        );
        continue;
      }
    } else if (
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      file.mimeType?.includes("image")
    ) {
      pdfDoc = await PDFDocument.create();
      let img;
      if (lowerName.endsWith(".png") || file.mimeType?.includes("png")) {
        img = await pdfDoc.embedPng(arrayBuffer);
      } else {
        img = await pdfDoc.embedJpg(arrayBuffer);
      }
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      console.warn(`Unsupported file type for merging: ${file.name}`);
      continue;
    }

    const copiedPages = await tempDoc.copyPages(
      pdfDoc,
      pdfDoc.getPageIndices(),
    );
    copiedPages.forEach((p: any) => tempDoc.addPage(p));
  }

  // 2. Page Selection
  let selectedIndices: number[] = [];
  const totalPages = tempDoc.getPageCount();
  if (prefs.pageSelection === "Custom" && prefs.customRange) {
    const parts = prefs.customRange.split(",");
    for (const part of parts) {
      const range = part.trim();
      if (range.includes("-")) {
        const partsArr = range.split("-");
        if (partsArr.length === 2) {
          const start = parseInt(partsArr[0]);
          const end = parseInt(partsArr[1]);
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) {
              if (i >= 1 && i <= totalPages) selectedIndices.push(i - 1);
            }
          }
        }
      } else {
        const pageNum = parseInt(range);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages)
          selectedIndices.push(pageNum - 1);
      }
    }
  } else {
    for (let i = 0; i < totalPages; i++) selectedIndices.push(i);
  }

  if (selectedIndices.length === 0) selectedIndices = [0];

  // 3. Create final pages with Layout and Scaling
  const A4 = PageSizes.A4;

  const tempBytes = await tempDoc.save();
  const embeddedPages = await finalDoc.embedPdf(tempBytes, selectedIndices);

  for (let i = 0; i < embeddedPages.length; i++) {
    const embeddedPage = embeddedPages[i];
    const origW = embeddedPage.width;
    const origH = embeddedPage.height;

    let targetW = A4[0];
    let targetH = A4[1];
    if (prefs.layout === "Landscape") {
      targetW = A4[1];
      targetH = A4[0];
    }

    const newPage = finalDoc.addPage([targetW, targetH]);

    let scale = 1;
    if (prefs.scaling === "Fit to Page") {
      const scaleX = targetW / origW;
      const scaleY = targetH / origH;
      scale = Math.min(scaleX, scaleY);
    } else if (prefs.scaling === "Custom" && prefs.customScale) {
      const pct = parseFloat(prefs.customScale.replace("%", ""));
      if (!isNaN(pct) && pct > 0) scale = pct / 100;
    }

    const scaledW = origW * scale;
    const scaledH = origH * scale;

    const x = (targetW - scaledW) / 2;
    const y = (targetH - scaledH) / 2;

    newPage.drawPage(embeddedPage, {
      x,
      y,
      width: scaledW,
      height: scaledH,
    });
  }

  const finalBytes = await finalDoc.save();
  return encode(finalBytes);
};

// Price calculation is now handled server-side via /api/payment/calculate

const getUpiParam = (url: string, param: string) => {
  const regex = new RegExp(`(?:[?&]|^)${param}=([^&^#]*)`, "i");
  const match = url.match(regex);
  return match ? decodeURIComponent(match[1]) : null;
};

const PrintSettings = () => {
  const router = useRouter();
  const {
    files,
    vendorId,
    vendorPhone,
    bwPrice,
    colorPrice,
    upiId,
    vendorName,
    hasBw,
    hasColor,
  } = useLocalSearchParams<{
    files: string;
    vendorId: string;
    vendorPhone: string;
    bwPrice: string;
    colorPrice: string;
    upiId: string;
    vendorName: string;
    hasBw: string;
    hasColor: string;
  }>();
  const initialFiles = files
    ? (JSON.parse(files) as Array<{
        uri: string;
        name: string;
        mimeType: string;
        needsConversion?: boolean;
      }>)
    : [];
  const [internalFiles, setInternalFiles] = useState<
    Array<{
      uri: string;
      name: string;
      mimeType: string;
      needsConversion?: boolean;
      serverPath?: string;
      serverOrderId?: string;
      pageCount?: number;
    }>
  >(initialFiles);

  const [copies, setCopies] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [fullDocPages, setFullDocPages] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [formData, setFormData] = useState({
    colorMode: hasColor === "true" ? "Colored" : "Black & White",
    layout: "Portrait",
    scaling: "Fit to Page",
    customScale: "",
    pageSelection: "All",
    customRange: "",
    doubleSided: "NO",
    binding: "None",
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [pendingAmount, setPendingAmount] = useState("0.00");
  const [isUploading, setIsUploading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successScale] = useState(new Animated.Value(0));
  const [rippleScale] = useState(new Animated.Value(0));
  const [rippleOpacity] = useState(new Animated.Value(0.4));
  const [iconRotate] = useState(new Animated.Value(0));
  const [isFetchingVendor, setIsFetchingVendor] = useState(false);
  const [vendorUPI, setVendorUPI] = useState<{
    upiId: string;
    name: string;
  } | null>(null);
  const [upiError, setUpiError] = useState<string | null>(null);
  const [allocatedOrderIds, setAllocatedOrderIds] = useState<number[]>([]);
  const [currentUserUsername, setCurrentUserUsername] =
    useState<string>("User");
  const [paymentMethod, setPaymentMethod] = useState<
    "Online" | "Cash on Delivery"
  >("Online");
  const [priceBreakdown, setPriceBreakdown] = useState<{
    effectivePages: number;
    sheetsPerCopy: number;
    pricePerPage: number;
    bindingCost: number;
    copies: number;
  } | null>(null);

  useEffect(() => {
    const calculateTotalPages = async () => {
      setIsLoadingPages(true);
      let total = 0;
      try {
        for (const file of internalFiles) {
          // Files now come with pageCount already calculated from home.tsx
          if (file.pageCount !== undefined) {
            total += file.pageCount;
            continue;
          }

          // Standard local fallback (same as home.tsx logic)
          const isPdf =
            file.mimeType === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf");
          if (isPdf) {
            try {
              const content = await FileSystem.readAsStringAsync(file.uri, {
                encoding: FileSystem.EncodingType.UTF8,
              });
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

    if (internalFiles.length > 0) {
      calculateTotalPages();
    } else {
      setIsLoadingPages(false);
    }
  }, [internalFiles]);

  useEffect(() => {
    if (formData.pageSelection === "All") {
      setTotalPages(fullDocPages);
    } else if (formData.pageSelection === "Custom") {
      const count = parsePageRange(formData.customRange, fullDocPages);
      setTotalPages(count);
    }
  }, [formData.pageSelection, formData.customRange, fullDocPages]);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const { token } = await getAuthData();
        const response = await fetch(`${API_URL}/payment/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-auth-token": token || "",
          },
          body: JSON.stringify({
            vendorId,
            totalPages: fullDocPages,
            copies,
            colorMode: formData.colorMode,
            doubleSided: formData.doubleSided,
            pageSelection: formData.pageSelection,
            customRange: formData.customRange,
            binding: formData.binding,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setTotalCost(data.totalAmount);
          if (
            formData.pageSelection === "Custom" &&
            data.effectivePages !== undefined
          ) {
            setTotalPages(data.effectivePages);
          }
        } else {
          console.warn("Price calculation failed, showing 0");
          setTotalCost(0);
        }
      } catch (err) {
        console.error("Error fetching price:", err);
        setTotalCost(0);
      }
      setPendingAmount("0.00");
    };

    if (totalPages > 0 || fullDocPages > 0) {
      fetchPrice();
    } else {
      setTotalCost(0);
      setPendingAmount("0.00");
    }
  }, [
    totalPages,
    copies,
    formData.colorMode,
    formData.doubleSided,
    formData.pageSelection,
    formData.customRange,
    formData.binding,
    fullDocPages,
  ]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
              formData[field as keyof typeof formData] === option &&
                styles.optionButtonSelected,
            ]}
            onPress={() => handleChange(field, option)}
          >
            <Text
              style={[
                styles.optionText,
                formData[field as keyof typeof formData] === option &&
                  styles.optionTextSelected,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const performUpload = async () => {
    setIsUploading(true);
    try {
      const { token, user } = await getAuthData();
      const username = user?.username || "unknown";
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const uploadTimeStr = `${day}${month}${year}_${hours}${minutes}`;
      const orderId = Date.now().toString();

      // Step 1: Upload Original Files
      let uploadResults: string[] = [];
      try {
        const base64Data = await processPdf(internalFiles, formData);
        const mergedFileName = `${username}_${uploadTimeStr}_MergedDocument.pdf`;
        const mergedFilePath = `${FileSystem.cacheDirectory}${mergedFileName}`;
        await FileSystem.writeAsStringAsync(mergedFilePath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const urlResponse = await fetch(`${API_URL}/vendors/files/upload-url`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-auth-token": token || "",
          },
          body: JSON.stringify({
            vendorId: vendorId,
            fileName: mergedFileName,
            contentType: "application/pdf",
            totalPages: totalPages,
            totalAmount: parseFloat(pendingAmount) || totalCost,
            isColor: formData.colorMode === "Colored",
            pageCount: totalPages,
            orderId: allocatedOrderIds[0],
          }),
        });

        if (!urlResponse.ok) {
          throw new Error(
            "We're having trouble starting your upload. Please try again.",
          );
        }
        const {
          uploadUrl,
          filePath,
          orderId: returnedOrderId,
        } = await urlResponse.json();

        let uploadRes;
        let retries = 3;
        while (retries > 0) {
          try {
            uploadRes = await FileSystem.uploadAsync(
              uploadUrl,
              mergedFilePath,
              {
                httpMethod: "PUT",
                uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                headers: {
                  "Content-Type": "application/pdf",
                },
              },
            );
            if (uploadRes.status >= 200 && uploadRes.status < 300) {
              break;
            } else {
              throw new Error(`Status ${uploadRes.status}`);
            }
          } catch (err) {
            retries--;
            if (retries === 0) {
              throw new Error(
                "Something went wrong while sending your files after multiple attempts. Please check your connection.",
              );
            }
            // wait a bit before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        if (returnedOrderId) {
          const confirmRes = await fetch(
            `${API_URL}/vendors/orders/${returnedOrderId}/confirm-upload`,
            {
              method: "POST",
              headers: { "x-auth-token": token || "" },
            },
          );
          if (!confirmRes.ok) {
            console.warn(
              "Upload confirmation failed but file uploaded:",
              await confirmRes.text(),
            );
          }
        }

        uploadResults.push(filePath);
      } catch (err: any) {
        throw new Error("Failed to process or upload document: " + err.message);
      }

      // Step 2: Create and upload Print Preferences JSON
      try {
        const preferences = {
          // Only core printing preferences in the JSON file
          copies,
          colorMode: formData.colorMode,
          layout: formData.layout,
          pageSelection: formData.pageSelection,
          customRange: formData.customRange,
          doubleSided: formData.doubleSided,
          binding: formData.binding,
        };

        const jsonFileName = `job_preferences_${username}_${uploadTimeStr}.json`;
        const jsonFilePath = `${FileSystem.cacheDirectory}${jsonFileName}`;
        await FileSystem.writeAsStringAsync(
          jsonFilePath,
          JSON.stringify(preferences, null, 2),
        );

        const urlResponseJson = await fetch(
          `${API_URL}/vendors/files/upload-url`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-auth-token": token || "",
            },
            body: JSON.stringify({
              vendorId: vendorId,
              fileName: jsonFileName,
              contentType: "application/json",
              orderId: allocatedOrderIds[0],
            }),
          },
        );

        if (urlResponseJson.ok) {
          const { uploadUrl: jsonUploadUrl } = await urlResponseJson.json();

          let jsonUploadRes;
          let jsonRetries = 3;
          while (jsonRetries > 0) {
            try {
              jsonUploadRes = await FileSystem.uploadAsync(
                jsonUploadUrl,
                jsonFilePath,
                {
                  httpMethod: "PUT",
                  uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                  headers: { "Content-Type": "application/json" },
                },
              );
              if (jsonUploadRes.status >= 200 && jsonUploadRes.status < 300) {
                break;
              } else {
                throw new Error(`Status ${jsonUploadRes.status}`);
              }
            } catch (err) {
              jsonRetries--;
              if (jsonRetries === 0) {
                console.warn("JSON upload failed after retries.");
              }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
      } catch (jsonErr) {
        console.error(
          "Failed to upload preferences JSON (non-fatal):",
          jsonErr,
        );
      }

      console.log("All files for order " + orderId + " uploaded successfully");
      return uploadResults;
    } catch (error: any) {
      // Error will be handled by the caller
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSuccess = () => {
    setShowSuccessModal(true);

    // Reset values
    successScale.setValue(0);
    rippleScale.setValue(0);
    rippleOpacity.setValue(0.5);
    iconRotate.setValue(0);

    // Trigger Success Haptic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Combined Animation Group
    Animated.parallel([
      // Main scale-in bounce
      Animated.spring(successScale, {
        toValue: 1,
        tension: 50,
        friction: 6,
        useNativeDriver: true,
      }),
      // Ripple pulse expansion
      Animated.sequence([
        Animated.delay(150),
        Animated.parallel([
          Animated.timing(rippleScale, {
            toValue: 2.2,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(rippleOpacity, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Subtle rotation for playfulness
      Animated.sequence([
        Animated.delay(100),
        Animated.timing(iconRotate, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  const completePrintJob = async () => {
    try {
      const { token } = await getAuthData();
      const statsResponse = await fetch(`${API_URL}/vendors/increment-stats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": token || "",
        },
        body: JSON.stringify({
          vendorId: vendorId,
          pages: totalPages * copies,
          totalAmount: parseFloat(pendingAmount) || totalCost,
        }),
      });
      if (!statsResponse.ok) console.warn("Failed to update stats on server");
    } catch (statsErr) {
      console.error("Stats update error:", statsErr);
    }
  };
  const fetchVendorDetails = async () => {
    if (!vendorId) return;
    setIsFetchingVendor(true);
    setUpiError(null);
    try {
      const { token } = await getAuthData();
      const response = await fetch(`${API_URL}/vendors/verify/${vendorId}`, {
        headers: { "x-auth-token": token || "" },
      });
      if (!response.ok) throw new Error("Could not load vendor information.");
      const data = await response.json();
      if (!data.upi_id) {
        setUpiError("This vendor has no UPI ID set up.");
      } else {
        setVendorUPI({
          upiId: data.upi_id,
          name: data.name || vendorName || "Merchant",
        });
      }
    } catch (err) {
      console.error("Error fetching vendor:", err);
      // Fallback to params if fetch fails
      if (upiId) {
        setVendorUPI({ upiId, name: vendorName || "Merchant" });
      } else {
        setUpiError("Could not retrieve vendor UPI details.");
      }
    } finally {
      setIsFetchingVendor(false);
    }
  };

  const handleUPIPayment = async () => {
    const upi = vendorUPI?.upiId || upiId;
    const name = vendorUPI?.name || vendorName || "Merchant";

    if (!upi) {
      Alert.alert("Error", "UPI ID not found for this vendor.");
      return;
    }

    const { user } = await getAuthData();
    const username = user?.username || user?.fullName?.split(" ")[0] || "User";
    const amount = parseFloat(pendingAmount).toFixed(2);
    const note =
      allocatedOrderIds.length > 0
        ? `Order#${allocatedOrderIds.join(",")}`
        : username;
    const params = `pa=${upi}&pn=${encodeURIComponent(name)}&am=${amount}&tn=${encodeURIComponent(note)}&cu=INR`;

    try {
      await Linking.openURL(`upi://pay?${params}`);
    } catch (error) {
      console.error("UPI link error:", error);
      Alert.alert("Failure", "Could not open any UPI app on your device.");
    }
  };

  const handleCheckout = async () => {
    if (isLoadingPages) {
      Alert.alert(
        "Calculating Price",
        "Please wait a moment while we verify the document details.",
      );
      return;
    }

    if (internalFiles.length === 0) {
      Alert.alert("Error", "No files selected to print.");
      return;
    }

    if (!upiId) {
      Alert.alert(
        "Payment Error",
        "This vendor has not set up their UPI ID yet. Please contact them directly.",
      );
      return;
    }

    if (!vendorPhone) {
      Alert.alert(
        "Contact Error",
        "This vendor has no phone number listed for WhatsApp sharing.",
      );
      return;
    }

    // Fetch the final authoritative price from the backend before showing payment
    try {
      const { token } = await getAuthData();
      const response = await fetch(`${API_URL}/payment/calculate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": token || "",
        },
        body: JSON.stringify({
          vendorId,
          totalPages: fullDocPages,
          copies,
          colorMode: formData.colorMode,
          doubleSided: formData.doubleSided,
          pageSelection: formData.pageSelection,
          customRange: formData.customRange,
          binding: formData.binding,
        }),
      });

      if (!response.ok) {
        Alert.alert(
          "Error",
          "We couldn't calculate your total. Please try again.",
        );
        return;
      }

      const priceData = await response.json();
      const finalAmount = priceData.totalAmount.toFixed(2);
      setTotalCost(priceData.totalAmount);
      setPendingAmount(finalAmount);
      setPriceBreakdown({
        effectivePages: priceData.effectivePages,
        sheetsPerCopy: priceData.sheetsPerCopy,
        pricePerPage: priceData.pricePerPage,
        bindingCost: priceData.bindingCost,
        copies: copies,
      });

      // Pre-allocate Order IDs from backend to include in UPI note
      const batchResponse = await fetch(`${API_URL}/vendors/orders/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": token || "",
        },
        body: JSON.stringify({
          vendorId,
          paymentMethod: "Online",
          paymentStatus: "pending",
          files: [
            {
              pageCount: totalPages || 1,
              totalAmount: priceData.totalAmount,
              isColor: formData.colorMode === "Colored",
            },
          ],
        }),
      });

      if (batchResponse.ok) {
        const batchData = await batchResponse.json();
        setAllocatedOrderIds(batchData.orderIds);
      }

      const { user: authUser } = await getAuthData();
      if (authUser?.username) {
        setCurrentUserUsername(authUser.username);
      } else if (authUser?.fullName) {
        setCurrentUserUsername(authUser.fullName.split(" ")[0]);
      }
    } catch (err) {
      console.error("Checkout price fetch error:", err);
      Alert.alert(
        "Error",
        "We couldn't verify the price. Please check your connection.",
      );
      return;
    }

    setShowPaymentModal(true);
    fetchVendorDetails();
  };

  const copyToClipboard = async () => {
    try {
      if (Clipboard && Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(upiId || "");
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
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} color="#2e3563" />
        </TouchableOpacity>
        <Text style={styles.title}>Print Settings</Text>
      </View>
      <View style={styles.summaryBanner}>
        <View style={styles.summaryItem}>
          <FileText size={20} color="#1271dd" />
          <Text style={styles.summaryLabel}>
            {internalFiles.length}{" "}
            {internalFiles.length === 1 ? "File" : "Files"}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Hash size={20} color="#1271dd" />
          <Text style={styles.summaryLabel}>
            {isLoadingPages ? "Calculating..." : `${totalPages} Total Pages`}
          </Text>
        </View>
      </View>

      <View style={styles.totalPriceStick}>
        <View>
          <Text style={styles.stickLabel}>Total Cost</Text>
          <Text style={styles.stickValue}>₹{totalCost.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.stickBtn,
            (isUploading || isLoadingPages) && { opacity: 0.7 },
          ]}
          onPress={handleCheckout}
          disabled={isUploading || isLoadingPages}
        >
          {isUploading || isLoadingPages ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.stickBtnText}>PRINT NOW</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 100 }]}
      >
        {internalFiles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>
              Selected Files ({internalFiles.length})
            </Text>
            <View style={styles.fileSummaryList}>
              {internalFiles.map((file, idx) => (
                <View key={idx} style={styles.fileSummaryItem}>
                  <Text style={styles.fileSummaryName} numberOfLines={1}>
                    {idx + 1}. {file.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {renderDropdown("Color Mode", "colorMode", [
          ...(hasColor === "true" ? ["Colored"] : []),
          ...(hasBw === "true" || hasBw === undefined ? ["Black & White"] : []),
        ])}

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
                onPress={() => setCopies((c) => c + 1)}
                style={styles.stepperButton}
              >
                <Plus size={20} color="#2e3563" />
              </TouchableOpacity>
              <View style={styles.stepperDivider} />
              <TouchableOpacity
                onPress={() => setCopies((c) => Math.max(1, c - 1))}
                style={styles.stepperButton}
              >
                <Minus size={20} color="#2e3563" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {renderDropdown("Layout", "layout", ["Portrait", "Landscape"])}

        {renderDropdown("Binding", "binding", [
          "None",
          "Spiral Binding",
          "Hard Binding",
        ])}

        <View style={styles.section}>
          <Text style={styles.label}>Scaling</Text>
          <View style={styles.pickerContainer}>
            {["Fit to Page", "Original Size", "Custom"].map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  formData.scaling === option && styles.optionButtonSelected,
                ]}
                onPress={() => handleChange("scaling", option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    formData.scaling === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {formData.scaling === "Custom" && (
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 100%"
              value={formData.customScale}
              onChangeText={(val) => handleChange("customScale", val)}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Pages</Text>
          <View style={styles.pagesList}>
            <TouchableOpacity
              style={styles.radioRow}
              onPress={() => handleChange("pageSelection", "All")}
            >
              <View
                style={[
                  styles.radio,
                  formData.pageSelection === "All" && styles.radioSelected,
                ]}
              />
              <Text style={styles.radioLabel}>All</Text>
            </TouchableOpacity>

            <View style={styles.radioRow}>
              <TouchableOpacity
                style={styles.radioRow}
                onPress={() => handleChange("pageSelection", "Custom")}
              >
                <View
                  style={[
                    styles.radio,
                    formData.pageSelection === "Custom" && styles.radioSelected,
                  ]}
                />
                <Text style={styles.radioLabel}>Custom Range</Text>
              </TouchableOpacity>
            </View>
            {formData.pageSelection === "Custom" && (
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 1-5, 8"
                value={formData.customRange}
                onChangeText={(val) => handleChange("customRange", val)}
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Double-Sided Printing</Text>
          <View style={styles.doubleSidedList}>
            {["YES", "NO"].map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.radioRow}
                onPress={() => handleChange("doubleSided", option)}
              >
                <View
                  style={[
                    styles.radio,
                    formData.doubleSided === option && styles.radioSelected,
                  ]}
                />
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
              <Text style={styles.modalTitle}>Order Confirmation</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <X size={24} color="#2e3563" />
              </TouchableOpacity>
            </View>

            <View style={styles.paymentMethodSelector}>
              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  paymentMethod === "Online" && styles.methodBtnActive,
                ]}
                onPress={async () => {
                  setPaymentMethod("Online");
                  // Sync with backend
                  const { token } = await getAuthData();
                  for (const id of allocatedOrderIds) {
                    await fetch(`${API_URL}/vendors/orders/${id}`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        "x-auth-token": token || "",
                      },
                      body: JSON.stringify({
                        payment_method: "Online",
                        payment_status: "pending",
                      }),
                    });
                  }
                }}
              >
                <Smartphone
                  size={20}
                  color={paymentMethod === "Online" ? "#ffffff" : "#64748b"}
                />
                <Text
                  style={[
                    styles.methodBtnText,
                    paymentMethod === "Online" && styles.methodBtnTextActive,
                  ]}
                >
                  Online Pay
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  paymentMethod === "Cash on Delivery" &&
                    styles.methodBtnActive,
                ]}
                onPress={async () => {
                  setPaymentMethod("Cash on Delivery");
                  // Sync with backend
                  const { token } = await getAuthData();
                  for (const id of allocatedOrderIds) {
                    await fetch(`${API_URL}/vendors/orders/${id}`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        "x-auth-token": token || "",
                      },
                      body: JSON.stringify({
                        payment_method: "Cash on Delivery",
                        payment_status: "pending",
                      }),
                    });
                  }
                }}
              >
                <Check
                  size={20}
                  color={
                    paymentMethod === "Cash on Delivery" ? "#ffffff" : "#64748b"
                  }
                />
                <Text
                  style={[
                    styles.methodBtnText,
                    paymentMethod === "Cash on Delivery" &&
                      styles.methodBtnTextActive,
                  ]}
                >
                  Pay at Shop
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              {paymentMethod === "Online" && (
                <>
                  <View style={styles.qrContainer}>
                    <QRCode
                      value={`upi://pay?pa=${upiId}&pn=${encodeURIComponent(vendorName || "Merchant")}&am=${pendingAmount}&cu=INR&tn=${encodeURIComponent(allocatedOrderIds.length > 0 ? `Order#${allocatedOrderIds.join(",")}` : currentUserUsername || "User")}`}
                      size={220}
                      color="#2e3563"
                    />
                  </View>
                  <Text style={styles.hintText}>
                    Scan this QR using any UPI app (GPay, PhonePe, Paytm)
                  </Text>
                </>
              )}

              {paymentMethod === "Online" && (
                <View style={styles.upiDirectContainer}>
                  <Text style={styles.upiGridTitle}>Pay via UPI App</Text>
                  {isFetchingVendor ? (
                    <View style={styles.upiLoadingBox}>
                      <ActivityIndicator color="#1271dd" size="small" />
                      <Text style={styles.upiLoadingText}>
                        Preparing payment...
                      </Text>
                    </View>
                  ) : upiError ? (
                    <View style={styles.upiErrorBox}>
                      <AlertCircle size={20} color="#ef4444" />
                      <Text style={styles.upiErrorText}>{upiError}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.upiDirectBtn,
                        parseFloat(pendingAmount) <= 0 && { opacity: 0.6 },
                      ]}
                      onPress={handleUPIPayment}
                      disabled={parseFloat(pendingAmount) <= 0}
                    >
                      <Smartphone size={20} color="#ffffff" />
                      <Text style={styles.upiDirectBtnText}>
                        Pay ₹{pendingAmount} via UPI
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {paymentMethod === "Online" && (
                <View style={styles.manualEntryBox}>
                  <Text style={styles.manualLabel}>Or pay to UPI ID:</Text>
                  <TouchableOpacity
                    style={styles.upiCopyBox}
                    onPress={copyToClipboard}
                  >
                    <Text style={styles.upiIdDisplayText}>{upiId}</Text>
                    {isCopied ? (
                      <Check size={18} color="#10b981" />
                    ) : (
                      <Copy size={18} color="#1271dd" />
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.paymentSummary}>
                <View style={styles.summaryTitleRow}>
                  <Text style={styles.summaryTitle}>Bill Breakdown</Text>
                </View>

                {priceBreakdown && (
                  <View style={styles.breakdownContainer}>
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Pages per copy:</Text>
                      <Text style={styles.breakdownValue}>
                        {priceBreakdown.effectivePages}
                      </Text>
                    </View>
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>
                        Sheets per copy (
                        {formData.doubleSided === "YES"
                          ? "Double-sided"
                          : "Single-sided"}
                        ):
                      </Text>
                      <Text style={styles.breakdownValue}>
                        {priceBreakdown.sheetsPerCopy}
                      </Text>
                    </View>
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>
                        Price per sheet:
                      </Text>
                      <Text style={styles.breakdownValue}>
                        ₹{priceBreakdown.pricePerPage.toFixed(2)}
                      </Text>
                    </View>
                    {priceBreakdown.bindingCost > 0 && (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>
                          Binding Cost ({formData.binding}):
                        </Text>
                        <Text style={styles.breakdownValue}>
                          ₹{priceBreakdown.bindingCost.toFixed(2)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>
                        Number of copies:
                      </Text>
                      <Text style={styles.breakdownValue}>
                        x {priceBreakdown.copies}
                      </Text>
                    </View>
                    <View style={styles.breakdownDivider} />
                  </View>
                )}

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowLabel}>Total Amount:</Text>
                  <Text
                    style={[
                      styles.summaryRowValue,
                      { color: "#1271dd", fontWeight: "800", fontSize: 18 },
                    ]}
                  >
                    ₹{pendingAmount}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowLabel}>Note:</Text>
                  <Text style={styles.summaryRowValue} numberOfLines={1}>
                    {currentUserUsername}
                    {allocatedOrderIds.length > 0
                      ? `_Order#${allocatedOrderIds.join(",")}`
                      : ""}
                  </Text>
                </View>
              </View>

              <View style={styles.verificationNote}>
                <Text style={styles.verificationNoteText}>
                  * Printing will only be done when the payment is verified by
                  the vendor
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.confirmPaymentBtn,
                  isUploading && { opacity: 0.7 },
                  paymentMethod === "Cash on Delivery" && {
                    backgroundColor: "#1271dd",
                    shadowColor: "#1271dd",
                  },
                ]}
                disabled={isUploading}
                onPress={() => {
                  const title =
                    paymentMethod === "Online"
                      ? "Confirm Payment"
                      : "Confirm Order";
                  const message =
                    paymentMethod === "Online"
                      ? "Note: Your order will be rejected if payment is not completed. Please also ensure your document formatting is correct."
                      : "Your order will be sent to the vendor. You can pay at the shop when you collect your prints.";

                  Alert.alert(title, message, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text:
                        paymentMethod === "Online"
                          ? "Yes, I have paid"
                          : "Confirm Order",
                      onPress: async () => {
                        try {
                          // Update payment_status based on method
                          const { token } = await getAuthData();
                          const newPaymentStatus =
                            paymentMethod === "Online"
                              ? "completed"
                              : "pending";
                          for (const id of allocatedOrderIds) {
                            await fetch(`${API_URL}/vendors/orders/${id}`, {
                              method: "PATCH",
                              headers: {
                                "Content-Type": "application/json",
                                "x-auth-token": token || "",
                              },
                              body: JSON.stringify({
                                payment_method: paymentMethod,
                                payment_status: newPaymentStatus,
                              }),
                            });
                          }
                          await performUpload();
                          setShowPaymentModal(false);
                          await completePrintJob();
                          handleSuccess();
                        } catch (err: any) {
                          Alert.alert(
                            "Upload Failed",
                            "We couldn't send your files to the vendor. Please check your internet connection.",
                          );
                        }
                      },
                    },
                  ]);
                }}
              >
                {isUploading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.confirmPaymentText}>
                    {paymentMethod === "Online"
                      ? "I HAVE PAID"
                      : "CONFIRM COD ORDER"}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={styles.securityNote}>
                Your files will be securely stored and shared with the vendor
                after payment.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Success Animation Modal */}
      <Modal visible={showSuccessModal} transparent={true} animationType="fade">
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrapper}>
              {/* Ripple Background Animation */}
              <Animated.View
                style={[
                  styles.successRipple,
                  {
                    transform: [{ scale: rippleScale }],
                    opacity: rippleOpacity,
                  },
                ]}
              />

              <Animated.View
                style={[
                  styles.successIconCircle,
                  {
                    transform: [
                      { scale: successScale },
                      {
                        rotate: iconRotate.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["-15deg", "0deg"],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Check size={54} color="#ffffff" strokeWidth={4.5} />
              </Animated.View>
            </View>

            <Text style={styles.successTitle}>Files Uploaded!</Text>
            <Text style={styles.successSubtitle}>
              Your print job has been securely sent to the cloud. The vendor
              will process it once they verify the payment.
            </Text>

            <TouchableOpacity
              style={styles.successCloseBtn}
              onPress={() => {
                setShowSuccessModal(false);
                router.replace("/home");
              }}
            >
              <Text style={styles.successCloseText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 10,
    gap: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f5f7fa",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e1e4e8",
  },
  content: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#2e3563" },
  section: { marginBottom: 32 },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2e3563",
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  pickerContainer: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
    backgroundColor: "#ffffff",
  },
  optionButtonSelected: { backgroundColor: "#1271dd", borderColor: "#1271dd" },
  optionText: { color: "#2e3563", fontWeight: "600", fontSize: 14 },
  optionTextSelected: { color: "#ffffff" },
  copiesSection: { flexDirection: "row", alignItems: "center", gap: 16 },
  copiesInput: {
    width: 80,
    height: 52,
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "600",
    color: "#2e3563",
    backgroundColor: "#fcfdfe",
  },
  stepperContainer: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  stepperButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDivider: { width: 1.5, height: "100%", backgroundColor: "#e1e4e8" },
  textInput: {
    marginTop: 12,
    height: 52,
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: "#2e3563",
    backgroundColor: "#fcfdfe",
  },
  pagesList: { gap: 14 },
  doubleSidedList: { gap: 14 },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#e1e4e8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: "#1271dd", borderWidth: 6 },
  radioLabel: { fontSize: 15, fontWeight: "500", color: "#2e3563" },
  buttonRow: { flexDirection: "row", gap: 16, marginTop: 16 },
  actionButton: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
  },
  printButton: {
    backgroundColor: "#1271dd",
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: "#2e3563",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  checkoutButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  fileSummaryList: {
    backgroundColor: "#f8fbff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e3f0ff",
  },
  fileSummaryItem: { paddingVertical: 4 },
  fileSummaryName: { fontSize: 14, color: "#1271dd", fontWeight: "500" },
  summaryBanner: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  summaryItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryLabel: { fontSize: 15, fontWeight: "700", color: "#2e3563" },
  summaryDivider: { width: 1, height: 24, backgroundColor: "#bfdbfe" },
  totalPriceStick: {
    backgroundColor: "#ffffff",
    flexDirection: "row",
    padding: 24,
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: "#f0f0f0",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  stickLabel: {
    fontSize: 12,
    color: "#979797",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  stickValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2e3563",
    marginTop: 2,
  },
  stickBtn: {
    backgroundColor: "#1271dd",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  stickBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#2e3563",
  },
  modalScroll: {
    padding: 24,
    alignItems: "center",
  },
  qrContainer: {
    padding: 20,
    backgroundColor: "#f8fbff",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#eff6ff",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 5,
  },
  hintText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 24,
    fontWeight: "500",
  },
  manualEntryBox: {
    width: "100%",
    marginBottom: 24,
  },
  manualLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  upiCopyBox: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  upiIdDisplayText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2e3563",
  },
  paymentSummary: {
    width: "100%",
    backgroundColor: "#f8fbff",
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e0f2fe",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryRowLabel: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
  },
  summaryRowValue: {
    fontSize: 14,
    color: "#2e3563",
    fontWeight: "700",
  },
  confirmPaymentBtn: {
    width: "100%",
    backgroundColor: "#10b981",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 16,
  },
  confirmPaymentText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
  },
  securityNote: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 18,
  },
  verificationNote: {
    backgroundColor: "#fff4e5",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ffe8cc",
    width: "100%",
  },
  verificationNoteText: {
    fontSize: 12,
    color: "#d97706",
    textAlign: "center",
    fontWeight: "600",
    lineHeight: 18,
  },
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(46, 53, 99, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCard: {
    backgroundColor: "#ffffff",
    borderRadius: 32,
    padding: 32,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  successIconWrapper: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    position: "relative",
  },
  successRipple: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#10b981",
  },
  successIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 2,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2e3563",
    marginBottom: 12,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  successCloseBtn: {
    backgroundColor: "#1271dd",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  successCloseText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  upiDirectContainer: {
    width: "100%",
    marginBottom: 24,
  },
  upiDirectBtn: {
    flexDirection: "row",
    backgroundColor: "#1271dd",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  upiDirectBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  upiGridTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    textAlign: "center",
  },
  upiLoadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
    backgroundColor: "#f8fbff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0f2fe",
  },
  upiLoadingText: {
    fontSize: 14,
    color: "#1271dd",
    fontWeight: "600",
  },
  upiErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
    backgroundColor: "#fef2f2",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  upiErrorText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "600",
  },
  summaryTitleRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 10,
    marginBottom: 15,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2e3563",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  breakdownContainer: {
    marginBottom: 10,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  breakdownLabel: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },
  breakdownValue: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 12,
  },
  paymentMethodSelector: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#ffffff",
  },
  methodBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  methodBtnActive: {
    borderColor: "#1271dd",
    backgroundColor: "#1271dd",
  },
  methodBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
  methodBtnTextActive: {
    color: "#ffffff",
  },
});

export default PrintSettings;
