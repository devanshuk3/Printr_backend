import React, { useState, useEffect } from "react";
import { GoogleSignin } from '@react-native-google-signin/google-signin';


import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { FloatingLabelInput } from "../../components/ui/FloatingLabelInput";
import { API_URL, GOOGLE_CLIENT_ID } from "../../constants/apiConfig";
import { setSharedFullName } from "../../utils/sharedState";
import { saveAuthData } from "../../utils/authStorage";
import { Check } from "lucide-react-native";

const LoginPage = () => {
  const router = useRouter();

  useEffect(() => {
    // IMPORTANT: Configure GoogleSignin with your Web Client ID from Google Cloud Console.
    // For standalone APKs to work, you MUST also have an Android Client ID entry 
    // in Google Cloud Console with your package name "com.devanshu.printr" 
    // and the SHA-1 fingerprint of your EAS build signing certificate.
    GoogleSignin.configure({
      webClientId: GOOGLE_CLIENT_ID,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });
  }, []);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
 
  const promptAsync = async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      // Force account selection every time by signing out of any previous session
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // Ignore catch if no user was signed in
      }
      const userInfo = await GoogleSignin.signIn();
      if (userInfo.data?.idToken) {
        handleGoogleLogin(userInfo.data.idToken);
      } else {
        throw new Error("No ID Token found. Please check your Google Cloud Console configuration.");
      }
    } catch (error: any) {
      console.error("Native Google Login error:", error);
      Alert.alert("Login Failed", "Could not complete native Google Sign-In. Error code: " + error.code);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (idToken: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.message || "Google login failed");
      }

      setSharedFullName(data.user.fullName);
      await saveAuthData(data.token, data.user);
      
      if (data.isNewUser) {
        router.replace({ pathname: "/home", params: { isNewUser: 'true' } } as any);
      } else {
        router.replace("/home");
      }
    } catch (error: any) {
      console.error("Google Auth error:", error);
      Alert.alert("Login Failed", error.message);
    } finally {
      setLoading(false);
    }
  };
 
  const handleLogin = async () => {
    const trimmedIdentifier = identifier.trim();
    const trimmedPassword = password; // Usually passwords shouldn't be trimmed, but leading/trailing spaces are rare intended chars. However, let's stay safe and only trim identifier.
    
    if (!trimmedIdentifier || !password.trim()) {
      Alert.alert("Error", "Please fill in both email/username and password");
      return;
    }

    if (trimmedIdentifier.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: trimmedIdentifier,
          password: password,
        }),
      });

      const contentType = response.headers.get("content-type");
      let data;
      
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || "Server returned an invalid response");
      }

      if (!response.ok) {
        throw new Error(data.message || "Invalid credentials");
      }

      // Successfully logged in
      setSharedFullName(data.user.fullName);
      
      // Save session to persistent storage
      await saveAuthData(data.token, {
        id: data.user.id,
        fullName: data.user.fullName,
        email: data.user.email,
        username: data.user.username
      });
      
      router.replace("/home");
    } catch (error: any) {
      console.error("Login detail error:", error);
      Alert.alert("Login Failed", error.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView style={styles.scrollView} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Log in to your account</Text>
            <Text style={styles.subtitle}>
              {"Don't have an account? "}
              <Text style={styles.signUpLink} onPress={() => router.push("/signup")}>Sign Up</Text>
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Identifier Input (Email or Username) */}
            <FloatingLabelInput
              label="E-mail or Username"
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Password Input */}
            <FloatingLabelInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              InputComponent={PasswordInput}
            />

            {/* Remember me + Forgot password */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.checkbox,
                    rememberMe ? styles.checkboxChecked : null,
                  ]}
                >
                  {rememberMe && <Check size={16} color="#ffffff" strokeWidth={3} />}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && { opacity: 0.7 }]}
              activeOpacity={0.85}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Separator */}
          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>or sign up with</Text>
            <View style={styles.separatorLine} />
          </View>

          {/* Google Button */}
          <TouchableOpacity 
            style={[styles.googleButton, loading && { opacity: 0.7 }]} 
            activeOpacity={0.85}
            onPress={promptAsync}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#4285F4" />
            ) : (
              <Image
                style={styles.googleLogo}
                source={{
                  uri: "https://c.animaapp.com/mm7juqcwVoWucW/img/google-2015-logo-svg-1.png",
                }}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>

          {/* Legal Links */}
          <View style={styles.legalRow}>
            <Text style={styles.legalText}>
              By logging in, you agree to our{"\n"}
              <Text 
                style={styles.legalLink} 
                onPress={() => Linking.openURL(`${API_URL.replace('/api', '')}/docs/terms-conditions.txt`)}
              >
                Terms & Conditions
              </Text>
              {" and "}
              <Text 
                style={styles.legalLink} 
                onPress={() => Linking.openURL(`${API_URL.replace('/api', '')}/docs/privacy-policy.txt`)}
              >
                Privacy Policy
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#fffefe",
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
    backgroundColor: "#fffefe",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    paddingHorizontal: 20,
  },
  header: {
    marginTop: 24,
    marginBottom: 40,
  },
  title: {
    fontWeight: "700",
    color: "#2e3563",
    fontSize: 32,
    lineHeight: 40,
    marginBottom: 12,
  },
  subtitle: {
    fontWeight: "400",
    color: "#979797",
    fontSize: 14,
  },
  signUpLink: {
    textDecorationLine: "underline",
  },
  form: {
    marginBottom: 40,
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 32,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#939393",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  checkboxChecked: {
    backgroundColor: "#1271dd",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    alignItems: "center",
    justifyContent: "center",
  },
  rememberText: {
    fontWeight: "400",
    color: "#979797",
    fontSize: 14,
  },
  forgotText: {
    fontWeight: "400",
    color: "#979797",
    fontSize: 14,
  },
  loginButton: {
    height: 56,
    backgroundColor: "#1271dd",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5f5f5fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
  },
  loginButtonText: {
    fontWeight: "600",
    color: "#ffffff",
    fontSize: 16,
  },
  separatorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#d1d1d1",
  },
  separatorText: {
    fontWeight: "400",
    color: "#a1a0a5",
    fontSize: 14,
    marginHorizontal: 16,
    alignItems: "center"

  },
  googleButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e1e4e8",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  googleLogo: {
    width: 120,
    height: 24,
  },
  legalRow: {
    marginTop: 32,
    alignItems: "center",
  },
  legalText: {
    textAlign: "center",
    fontSize: 13,
    color: "#979797",
    lineHeight: 20,
  },
  legalLink: {
    color: "#1271dd",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});

export default LoginPage;
