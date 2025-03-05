// components/LoggerTable/LoggerTableHeader.jsx
import React from 'react';
import { Lock, FileText } from 'lucide-react';

const LoggerTableHeader = ({ columns, isAdmin }) => {
  return (
    <thead>
      <tr className="sticky top-0 bg-gray-700 z-10">
        <th className="w-20 sticky left-0 bg-gray-700 z-20 p-2 border border-gray-600 text-white text-sm">
          <div className="flex items-center space-x-2">
            <Lock size={14} />
            <FileText size={14} />
          </div>
        </th>
        {columns.map(col => (
          <th 
            key={col.field} 
            className={`${col.width} p-2 border border-gray-600 bg-gray-700 text-left text-white text-sm`}
          >
            {col.header}
          </th>
        ))}
        {isAdmin && <th className="w-10 sticky right-0 bg-gray-700 z-20 p-2 border border-gray-600 text-white text-sm">Actions</th>}
      </tr>
    </thead>
  );
};

export default LoggerTableHeader;