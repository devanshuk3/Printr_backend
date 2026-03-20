import React, { useState } from "react";
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import {
     View,
     Text,
     TouchableOpacity,
     Image,
     StyleSheet,
     ScrollView,
     ActivityIndicator,
     Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { FloatingLabelInput } from "../../components/ui/FloatingLabelInput";
import { API_URL } from "../../constants/apiConfig";
import { saveAuthData } from "../../utils/authStorage";

import { setSharedFullName } from "../../utils/sharedState";


export default function SignUp() {
     const router = useRouter();
     const [fullName, setFullName] = useState("");     
     const [email, setEmail] = useState("");
     const [username, setUsername] = useState("");
     const [password, setPassword] = useState("");
     const [loading, setLoading] = useState(false);

     const promptAsync = async () => {
          try {
               setLoading(true);
               
               // Ensure play services are available
               await GoogleSignin.hasPlayServices();
               
               // A small delay helps avoid 'Current activity is null' errors in some React Native versions
               // by ensuring the activity is correctly attached after any component re-render.
               await new Promise(resolve => setTimeout(resolve, 300));

               // Force account selection by signing out first
               try { await GoogleSignin.signOut(); } catch {}

               const userInfo = await GoogleSignin.signIn();
               if (userInfo.data?.idToken) {
                    handleGoogleSignup(userInfo.data.idToken);
               } else {
                    throw new Error("No ID Token found. Please check your Google Cloud Console configuration.");
               }
          } catch (error: any) {
               if (error.code === 'DEVELOPER_ERROR') {
                    console.error("Native Google Signup DEVELOPER_ERROR:", error);
                    Alert.alert("Configuration Issue", "DEVELOPER_ERROR: Please check if your SHA-1 key is registered correctly in Google Cloud Console.");
               } else if (error.code !== 'SIGN_IN_CANCELLED') {
                    console.error("Native Google Registration error:", error);
                    Alert.alert("Registration Failed", `Error: ${error.message}`);
               }
          } finally {
               setLoading(false);
          }
     };

     const handleGoogleSignup = async (idToken: string) => {
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
                    throw new Error(data.message || "Google registration failed");
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
               Alert.alert("Registration Failed", error.message);
          } finally {
               setLoading(false);
          }
     };

     const handleSignUp = async () => {
          const trimmedFullName = fullName.trim();
          const trimmedEmail = email.trim();
          const trimmedUsername = username.trim();

          if (!trimmedFullName || !trimmedEmail || !trimmedUsername || !password.trim()) {
               Alert.alert("Error", "Please fill in all fields");
               return;
          }

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(trimmedEmail)) {
               Alert.alert("Error", "Please enter a valid email address");
               return;
          }

          setLoading(true);
          try {
               const response = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: {
                         'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                         fullName: trimmedFullName,
                         email: trimmedEmail,
                         username: trimmedUsername,
                         password,
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
                    throw new Error(data.message || "Something went wrong");
               }

               // Successfully registered
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
               console.error("Signup error:", error);
               Alert.alert("Registration Failed", error.message);
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
                               <Text style={styles.title}>Create an account</Text>
                              <Text style={styles.subtitle}>
                                   {"Already have an account? "}
                                   <Text style={styles.loginLink} onPress={() => router.replace("/")}>Login</Text>
                              </Text>
                         </View>
                         {/* Form */}
                         <View style={styles.form}>
                              {/* Full Name Input */}
                              <FloatingLabelInput
                                   label="Full Name"
                                   value={fullName}
                                   onChangeText={setFullName}
                                   autoCapitalize="words"
                                   autoCorrect={false}
                              />

                              {/* Username Input */}
                              <FloatingLabelInput
                                   label="Username"
                                   value={username}
                                   onChangeText={setUsername}
                                   autoCapitalize="none"
                                   autoCorrect={false}
                              />

                              {/* Email Input */}
                              <FloatingLabelInput
                                   label="E-mail"
                                   value={email}
                                   onChangeText={setEmail}
                                   keyboardType="email-address"
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

                              {/* Sign Up Button */}
                              <TouchableOpacity
                                   style={[styles.signupButton, loading && { opacity: 0.7 }]}
                                   activeOpacity={0.85}
                                   onPress={handleSignUp}
                                   disabled={loading}
                              >
                                   {loading ? (
                                        <ActivityIndicator color="#ffffff" />
                                   ) : (
                                        <Text style={styles.signupButtonText}>Sign Up</Text>
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
                    </View>
               </ScrollView>
          </SafeAreaView>
     );

}

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
     loginLink: {
          textDecorationLine: "underline",
          color: "#1271dd",
     },
     form: {
          marginBottom: 32,
     },
     signupButton: {
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
          marginTop: 24,
     },
     signupButtonText: {
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

});
