import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { API_URL } from '../../constants/apiConfig';

const OTP_LENGTH = 6;

interface OTPModalProps {
  visible: boolean;
  userId: number;
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}

export const OTPModal: React.FC<OTPModalProps> = ({ visible, userId, onClose, onSuccess }) => {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setDigits(Array(OTP_LENGTH).fill(''));
      setLoading(false);
      // Focus first input after a short delay for the modal animation
      setTimeout(() => inputRefs.current[0]?.focus(), 350);
    }
  }, [visible]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleDigitChange = (text: string, index: number) => {
    // Only allow single numeric digit
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // Move back on backspace if current field is empty
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const getOtpString = () => digits.join('');

  const handleVerify = async () => {
    const otp = getOtpString();
    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Incomplete Code', 'Please enter all 6 digits of the verification code.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      onSuccess(data.token, data.user);
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message);
      // Clear inputs so user can try again
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;

    setResending(true);
    try {
      const response = await fetch(`${API_URL}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to resend code');
      }

      Alert.alert('Code Sent', 'A new verification code has been sent to your email.');
      setTimer(60);
      // Clear inputs for the new code
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setResending(false);
    }
  };

  const isFilled = getOtpString().length === OTP_LENGTH;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.card}>
            {/* Header */}
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code we sent to your email address to complete registration.
            </Text>

            {/* OTP Input Row */}
            <View style={styles.otpRow}>
              {digits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { inputRefs.current[i] = ref; }}
                  style={[
                    styles.otpBox,
                    digit ? styles.otpBoxFilled : null,
                  ]}
                  value={digit}
                  onChangeText={(text) => handleDigitChange(text, i)}
                  onKeyPress={(e) => handleKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  textContentType="oneTimeCode"
                />
              ))}
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[
                styles.verifyButton,
                (!isFilled || loading) && styles.verifyButtonDisabled,
              ]}
              onPress={handleVerify}
              disabled={!isFilled || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify & Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={styles.resendLabel}>Didn't receive a code? </Text>
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending || timer > 0}
              >
                {resending ? (
                  <ActivityIndicator color="#1271dd" size="small" />
                ) : (
                  <Text style={[styles.resendLink, timer > 0 && styles.resendLinkDisabled]}>
                    {timer > 0 ? `Resend in ${timer}s` : 'Resend'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Cancel */}
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  keyboardView: {
    width: '100%',
    maxWidth: 400,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 15,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2e3563',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#979797',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  otpRow: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    marginBottom: 40,
  },
  otpBox: {
    width: 48,
    height: 58, 
    borderWidth: 1.5,
    borderColor: '#e1e4e8',
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    fontSize: 24,
    fontWeight: '700',
    color: '#2e3563',
    textAlign: 'center',
    padding: 0, // Remove default padding for better centering
    // Ensure text is centered on both platforms
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  otpBoxFilled: {
    borderColor: '#1271dd',
    backgroundColor: '#f0f6ff',
    borderWidth: 2,
  },
  verifyButton: {
    width: '100%',
    height: 56,
    backgroundColor: '#1271dd',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1271dd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 20,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resendLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#979797',
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1271dd',
  },
  resendLinkDisabled: {
    color: '#a1a0a5',
    fontWeight: '400',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#979797',
  },
});
