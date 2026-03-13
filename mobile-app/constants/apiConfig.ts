import { Platform } from 'react-native';

// Use your local machine's IP address for internal testing
// For Render deployment, keep it as 'https://printr-backend.onrender.com'
const BASE_URL = __DEV__ 
  ? 'http://10.36.65.139:5000' 
  : 'https://printr-backend.onrender.com';

export const API_URL = `${BASE_URL}/api`;
