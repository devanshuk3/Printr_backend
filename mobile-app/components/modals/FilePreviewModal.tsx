import { Modal, View, TouchableOpacity, Text, StyleSheet, Image, Platform, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';

interface FilePreviewModalProps {
     visible: boolean;
     onClose: () => void;
     fileUri: string | null;
     mimeType: string | null;
}

export const FilePreviewModal = ({ visible, onClose, fileUri, mimeType }: FilePreviewModalProps) => {
     if (!fileUri) return null;

     const isPdf = mimeType === 'application/pdf' || fileUri.toLowerCase().endsWith('.pdf');

     const handleAndroidFallback = async () => {
          try {
               await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/pdf',
                    UTI: 'com.adobe.pdf',
                    dialogTitle: 'Preview PDF'
               });
          } catch (err) {
               Alert.alert("Error", "We couldn't open the PDF viewer. Please make sure you have a PDF app installed.");
          }
     };

     return (
          <Modal
               visible={visible}
               animationType="slide"
               transparent={true}
               onRequestClose={onClose}
          >
               <View style={styles.overlay}>
                    <View style={styles.container}>
                         <View style={styles.header}>
                              <Text style={styles.headerTitle}>
                                   {isPdf ? 'PDF Preview' : 'Image Preview'}
                              </Text>
                              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                   <Text style={styles.closeButtonText}>✕</Text>
                              </TouchableOpacity>
                         </View>
                         <View style={styles.content}>
                              {isPdf ? (
                                   Platform.OS === 'ios' ? (
                                        <WebView 
                                             source={{ uri: fileUri }} 
                                             style={styles.webview}
                                             originWhitelist={['*']}
                                             allowFileAccess={true}
                                             allowFileAccessFromFileURLs={true}
                                             allowUniversalAccessFromFileURLs={true}
                                             scalesPageToFit={true}
                                        />
                                   ) : (
                                        <View style={styles.androidFallback}>
                                             <Text style={styles.fallbackText}>
                                                  PDF preview is ready.
                                             </Text>
                                             <TouchableOpacity 
                                                  style={styles.openButton}
                                                  onPress={handleAndroidFallback}
                                             >
                                                  <Text style={styles.openButtonText}>Open in PDF Viewer</Text>
                                             </TouchableOpacity>
                                             <Text style={styles.subText}>
                                                  (A PDF viewer app is required to preview this file)
                                             </Text>
                                        </View>
                                   )
                              ) : (
                                   <Image
                                        source={{ uri: fileUri }}
                                        style={styles.image}
                                        resizeMode="contain"
                                   />
                              )}
                         </View>
                    </View>
               </View>
          </Modal>
     );
};

const styles = StyleSheet.create({
     overlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.85)',
          justifyContent: 'center',
          alignItems: 'center',
     },
     container: {
          width: '90%',
          height: '90%',
          backgroundColor: '#fff',
          borderRadius: 10,
          overflow: 'hidden',
     },
     header: {
          height: 50,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
     },
     headerTitle: {
          fontSize: 16,
          fontWeight: 'bold',
          color: '#2e3563',
     },
     closeButton: {
          padding: 5,
     },
     closeButtonText: {
          fontSize: 20,
          color: '#999',
          fontWeight: 'bold',
     },
     content: {
          flex: 1,
          backgroundColor: '#000',
     },
     image: {
          flex: 1,
          width: '100%',
     },
     webview: {
          flex: 1,
     },
     androidFallback: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 30,
          backgroundColor: '#f8f9fa',
     },
     fallbackText: {
          fontSize: 18,
          color: '#2e3563',
          marginBottom: 20,
          textAlign: 'center',
          fontWeight: '500',
     },
     openButton: {
          backgroundColor: '#1271dd',
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: 12,
          elevation: 3,
     },
     openButtonText: {
          color: '#fff',
          fontSize: 16,
          fontWeight: 'bold',
     },
     subText: {
          marginTop: 20,
          fontSize: 12,
          color: '#999',
          textAlign: 'center',
     },
});
