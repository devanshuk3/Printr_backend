import React, { useState, useRef, useEffect } from "react";
import { TextInput, TextInputProps } from "react-native";

interface PasswordInputProps extends Omit<TextInputProps, "value" | "onChangeText"> {
     value: string;
     onChangeText: (text: string) => void;
     maskDelay?: number;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
     value,
     onChangeText,
     maskDelay = 600,
     style,
     ...props
}) => {
     const [displayValue, setDisplayValue] = useState("");
     const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

     useEffect(() => {
          if (!value) {
               setDisplayValue("");
          }
     }, [value]);

     const handleChange = (text: string) => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);

          let newRealPass = value;

          if (text.length < displayValue.length) {
               newRealPass = value.slice(0, text.length);
          } else if (text.length > displayValue.length) {
               const added = text.slice(displayValue.length);
               newRealPass = value + added;
          } else {
               // For lengths equal, do nothing natively.
               return;
          }

          onChangeText(newRealPass);

          if (newRealPass.length > 0) {
               // Show all as dots except the last character
               const masked = "•".repeat(newRealPass.length - 1) + newRealPass.slice(-1);
               setDisplayValue(masked);

               timeoutRef.current = setTimeout(() => {
                    setDisplayValue("•".repeat(newRealPass.length));
               }, maskDelay);
          } else {
               setDisplayValue("");
          }
     };

     return (
          <TextInput
               style={[style, { fontFamily: "monospace", letterSpacing: 3 }]}
               value={displayValue}
               onChangeText={handleChange}
               autoCapitalize="none"
               autoCorrect={false}
               keyboardType="visible-password"
               secureTextEntry={false}
               {...props}
          />
     );
};
