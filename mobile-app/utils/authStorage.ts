import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'user_token';
const USER_KEY = 'user_data';
const HISTORY_KEY = 'print_history';

export interface UserData {
  id: number;
  fullName: string;
  email: string;
  username: string;
  profileSeedOffset?: number;
}

export const saveAuthData = async (token: string, user: UserData) => {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Error saving auth data:', error);
  }
};

export const getAuthData = async () => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userData = await SecureStore.getItemAsync(USER_KEY);
    return {
      token,
      user: userData ? (JSON.parse(userData) as UserData) : null,
    };
  } catch (error) {
    console.error('Error getting auth data:', error);
    return { token: null, user: null };
  }
};

export const clearAuthData = async () => {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(HISTORY_KEY);
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
};

export const saveLocalHistory = async (history: any[]) => {
  try {
    await SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error saving local history:', error);
  }
};

export const getLocalHistory = async () => {
  try {
    const data = await SecureStore.getItemAsync(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting local history:', error);
    return [];
  }
};
