// frontend/src/components/relations/EnrichedDetailCards.jsx
import React from 'react';

const EnrichedDetailCards = ({ details }) => {
  return (
    <div className="border-b border-gray-600 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {details.map((detail, i) => (
          <div key={i} className="bg-gray-800/50 rounded-md p-3 flex flex-col items-center justify-center text-center">
            <div className="mb-2">{detail.icon}</div>
            <div className="text-sm font-medium text-gray-300">{detail.label}</div>
            <div className="text-lg font-bold text-white">{detail.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EnrichedDetailCards;