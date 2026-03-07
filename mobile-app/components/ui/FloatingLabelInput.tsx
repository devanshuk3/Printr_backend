import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  TextInputProps,
} from "react-native";

interface FloatingLabelInputProps extends TextInputProps {
  label: string;
  value: string;
  InputComponent?: React.ComponentType<any>;
}

export const FloatingLabelInput: React.FC<FloatingLabelInputProps> = ({
  label,
  value,
  onFocus,
  onBlur,
  style,
  InputComponent = TextInput,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: isFocused || value ? 1 : 0,
      duration: 80,
      useNativeDriver: false,
    }).start();
  }, [isFocused, value]);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const labelTranslateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -28],
  });

  const labelStyle = {
    position: "absolute" as const,
    left: 20,
    fontSize: animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: [16, 14],
    }),
    color: animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: ["#979797", "#2e3563"],
    }),
    backgroundColor: "#fffefe",
    paddingHorizontal: 8,
    zIndex: 2,
    pointerEvents: "none" as const,
    transform: [{ translateY: labelTranslateY }],
    includeFontPadding: false,
    textAlignVertical: "center" as const,
  };

  return (
    <View style={styles.inputWrapper}>
      <InputComponent
        {...props}
        style={[styles.input, style]}
        value={value}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder=""
      />
      <View style={styles.labelContainer} pointerEvents="none">
        <Animated.Text style={labelStyle}>{label}</Animated.Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inputWrapper: {
    position: "relative",
    marginTop: 20,
    marginBottom: 12,
  },
  labelContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    zIndex: 2,
  },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b5b5b5",
    backgroundColor: "#ffffff",
    fontSize: 16,
    paddingHorizontal: 16,
    color: "#333333",
  },
});
