import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Frame as LoginFrame } from "./(auth)/login";
import { getAuthData } from "../utils/authStorage";
import { setSharedFullName } from "./(auth)/signup";
import { API_URL } from "../constants/apiConfig";
import { clearAuthData, saveAuthData } from "../utils/authStorage";

export default function Index() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { token, user } = await getAuthData();
        if (token && user) {
          // Attempt to verify and extend the session with the backend
          const response = await fetch(`${API_URL}/auth/verify`, {
             method: 'GET',
             headers: {
                'x-auth-token': token,
             },
          });

          if (response.ok) {
             const data = await response.json();
             // Extend session locally
             await saveAuthData(data.token, data.user);
             setSharedFullName(data.user.fullName);
             router.replace("/home");
             return; // Stop here, routing is handled
          } else {
             // Token might be expired or invalid, clear it
             await clearAuthData();
          }
        }
        setIsChecking(false);
      } catch (error) {
        console.error("Auth check failed:", error);
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isChecking) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fffefe" }}>
        <ActivityIndicator size="large" color="#1271dd" />
      </View>
    );
  }

  return <LoginFrame />;
}