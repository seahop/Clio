// frontend/src/hooks/useCardFields.js
import { useState, useEffect, useCallback } from 'react';

// Default fields to display in card header
const DEFAULT_CARD_FIELDS = {
  internal_ip: true,
  mac_address: true,
  pid: true,
  hostname: true,
  username: true,
  filename: true,
  command: true,
  status: true
};

export const useCardFields = (currentUser) => {
  const [visibleFields, setVisibleFields] = useState(DEFAULT_CARD_FIELDS);
  
  // Load saved settings on mount
  useEffect(() => {
    try {
      const username = currentUser?.username;
      if (username) {
        const savedSettings = localStorage.getItem(`${username}_cardFields`);
        if (savedSettings) {
          setVisibleFields(JSON.parse(savedSettings));
        }
      }
    } catch (error) {
      console.error('Failed to load card field settings:', error);
    }
  }, [currentUser]);
  
  // Handle settings updates
  const updateVisibleFields = useCallback((settings) => {
    setVisibleFields(settings);
    
    // You could also save to localStorage here if you want updates to be persisted immediately
    try {
      const username = currentUser?.username;
      if (username) {
        localStorage.setItem(`${username}_cardFields`, JSON.stringify(settings));
      }
    } catch (error) {
      console.error('Failed to save card field settings:', error);
    }
  }, [currentUser]);
  
  return {
    visibleFields,
    updateVisibleFields
  };
};

export default useCardFields;