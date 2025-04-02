// frontend/src/hooks/useCardNavigation.js
import { useCallback } from 'react';
import { COLUMNS } from '../utils/constants';

/**
 * Custom hook for handling navigation between card fields
 */
export const useCardNavigation = ({ row, onCellBlur, onCellClick, onCellChange }) => {
  // Improved function to move to the next cell in sequence
  const moveToNextCell = useCallback(async (
    currentRowId, 
    currentField, 
    currentValue, 
    isReverse = false, 
    skipSave = false
  ) => {
    if (currentField === 'analyst') return;
    
    // Define the tab order explicitly
    const tabOrder = [
      // Network column
      'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain',
      // Content column
      'username', 'command', 'notes', 'secrets', 'analyst',
      // Status column
      'filename', 'hash_algorithm', 'hash_value', 'pid', 'status'
    ];
    
    // Find the current position in the tab order
    const currentIndex = tabOrder.indexOf(currentField);
    if (currentIndex === -1) return;
    
    // Calculate the next or previous index based on direction
    let nextIndex;
    if (isReverse) {
      // Go to previous field
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) nextIndex = tabOrder.length - 1; // Wrap around
    } else {
      // Go to next field
      nextIndex = currentIndex + 1;
      if (nextIndex >= tabOrder.length) nextIndex = 0; // Wrap around
    }
    
    const nextField = tabOrder[nextIndex];
    
    try {
      // Save the current cell value if not skipping save
      if (!skipSave && currentField !== 'analyst') {
        // Try to save the current value
        await onCellBlur({ target: { value: currentValue } }, currentRowId, currentField);
      }
      
      // Find the next editable cell
      let nextEditableIndex = nextIndex;
      let attempts = 0;
      const maxAttempts = tabOrder.length; // Prevent infinite loops
      
      while (attempts < maxAttempts) {
        // Check if the next field is editable (not analyst and not locked)
        if (tabOrder[nextEditableIndex] !== 'analyst' && !row.locked) {
          break;
        }
        
        // Move to the next field in the direction we're going
        if (isReverse) {
          nextEditableIndex--;
          if (nextEditableIndex < 0) nextEditableIndex = tabOrder.length - 1;
        } else {
          nextEditableIndex++;
          if (nextEditableIndex >= tabOrder.length) nextEditableIndex = 0;
        }
        
        attempts++;
      }
      
      // If we found an editable field, focus it
      if (attempts < maxAttempts) {
        const nextEditableField = tabOrder[nextEditableIndex];
        
        // Allow a small delay for the DOM to update
        setTimeout(() => {
          onCellClick(currentRowId, nextEditableField);
        }, 10);
      }
    } catch (err) {
      console.error('Failed to navigate to next cell:', err);
    }
  }, [row, onCellBlur, onCellClick]);

  return { moveToNextCell };
};

export default useCardNavigation;