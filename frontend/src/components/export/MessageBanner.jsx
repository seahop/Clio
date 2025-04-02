// frontend/src/components/export/MessageBanner.jsx
import React from 'react';
import { CheckSquare, AlertCircle } from 'lucide-react';

/**
 * Component for displaying success or error messages
 */
const MessageBanner = ({ message, error }) => {
  if (!message && !error) return null;
  
  return (
    <div className={`p-4 mb-4 rounded-md flex items-center gap-2 ${
      message ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'
    }`}>
      {message ? <CheckSquare size={20} /> : <AlertCircle size={20} />}
      <span>{message || error}</span>
    </div>
  );
};

export default MessageBanner;