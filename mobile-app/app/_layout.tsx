import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GOOGLE_AUTH_CONFIG } from "../constants/auth";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    GoogleSignin.configure(GOOGLE_AUTH_CONFIG);
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </SafeAreaProvider>
  );
}