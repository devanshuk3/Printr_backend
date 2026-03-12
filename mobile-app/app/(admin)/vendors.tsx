import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Store, Printer, IndianRupee, TrendingUp } from "lucide-react-native";
import { API_URL } from "../../constants/apiConfig";

// Static Vendor Data
const VENDOR_DATA = [
  { id: "V001", name: "Metro Print Station", pages: 1250, pricePerPage: 5 },
  { id: "V002", name: "Campus Copy Center", pages: 2840, pricePerPage: 3 },
  { id: "V003", name: "Quick Print Hub", pages: 940, pricePerPage: 5 },
  { id: "V004", name: "The Digital Press", pages: 5620, pricePerPage: 2 },
  { id: "V005", name: "Modern Xerographics", pages: 1800, pricePerPage: 4 },
];

const AdminVendorsPage = () => {
  const router = useRouter();
  const [vendors, setVendors] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const response = await fetch(`${API_URL}/vendors/all`);
      const data = await response.json();
      if (response.ok) {
        setVendors(data);
      }
    } catch (error) {
      console.error("Fetch Vendors Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateFinalAmount = (pages: number, rate: number) => {
    const total = pages * rate;
    const final = total * 0.1; // 10% commission/fees
    return final.toFixed(2);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ChevronLeft size={28} color="#2e3563" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Vendor Dashboard</Text>
          <Text style={styles.headerSubtitle}>Connected Stores & Revenue</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <TrendingUp size={24} color="#ffffff" />
            <Text style={styles.summaryValue}>{vendors.length}</Text>
            <Text style={styles.summaryLabel}>Total Vendors</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Vendor List</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#1271dd" style={{ marginTop: 40 }} />
        ) : vendors.map((vendor) => {
          // Note: In real app, vendor.pages would come from orders/stats table
          const mockPages = vendor.pages || Math.floor(Math.random() * 5000);
          const finalAmount = calculateFinalAmount(mockPages, vendor.price_per_page);
          
          return (
            <View key={vendor.id} style={styles.vendorCard}>
              <View style={styles.cardHeader}>
                <View style={styles.iconContainer}>
                  <Store size={24} color="#1271dd" />
                </View>
                <View style={styles.nameContainer}>
                  <Text style={styles.vendorName}>{vendor.name}</Text>
                  <Text style={styles.vendorId}>ID: {vendor.vendor_id}</Text>
                </View>
              </View>

              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <View style={styles.statIconLabel}>
                    <Printer size={16} color="#979797" />
                    <Text style={styles.statLabel}>Total Pages</Text>
                  </View>
                  <Text style={styles.statValue}>{mockPages.toLocaleString()}</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <View style={styles.statIconLabel}>
                    <IndianRupee size={16} color="#979797" />
                    <Text style={styles.statLabel}>Price/Page</Text>
                  </View>
                  <Text style={styles.statValue}>₹{vendor.price_per_page}</Text>
                </View>
              </View>

              <View style={styles.revenueContainer}>
                <View>
                  <Text style={styles.revenueLabel}>Total Gross Fee</Text>
                  <Text style={styles.grossValue}>₹{(mockPages * vendor.price_per_page).toLocaleString()}</Text>
                </View>
                <View style={styles.finalAmountBox}>
                  <Text style={styles.finalLabel}>Platform Fee (10%)</Text>
                  <Text style={styles.finalValue}>₹{parseFloat(finalAmount).toLocaleString()}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fcfdfe",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f5f7fa",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2e3563",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#979797",
    fontWeight: "500",
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  summarySection: {
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: "#1271dd",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1271dd",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffffff",
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2e3563",
    marginBottom: 16,
    marginTop: 8,
  },
  vendorCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#eef6ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  nameContainer: {
    flex: 1,
  },
  vendorName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2e3563",
    marginBottom: 2,
  },
  vendorId: {
    fontSize: 13,
    color: "#979797",
    fontWeight: "500",
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: "#f8fbff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
  },
  statIconLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#979797",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2e3563",
  },
  statDivider: {
    width: 1,
    height: "100%",
    backgroundColor: "#e1e4e8",
    marginHorizontal: 16,
  },
  revenueContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  revenueLabel: {
    fontSize: 13,
    color: "#979797",
    fontWeight: "500",
    marginBottom: 2,
  },
  grossValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2e3563",
  },
  finalAmountBox: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "flex-end",
  },
  finalLabel: {
    fontSize: 11,
    color: "#15803d",
    fontWeight: "700",
    marginBottom: 2,
  },
  finalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#16a34a",
  },
});

export default AdminVendorsPage;
