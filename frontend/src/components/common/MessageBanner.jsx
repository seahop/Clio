// frontend/src/components/common/MessageBanner.jsx
import React from 'react';
import { Check, AlertCircle } from 'lucide-react';

/**
 * Reusable component for displaying success or error messages
 */
const MessageBanner = ({ message, error }) => {
  if (!message && !error) return null;
  
  return (
    <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
      message ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
    }`}>
      {message ? <Check size={20} /> : <AlertCircle size={20} />}
      <span>{message || error}</span>
    </div>
  );
};

export default MessageBanner;