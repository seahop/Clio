// src/components/templates/index.js
// This file exports all template-related components from a single entry point

import TemplateManager from './TemplateManager';
import { SaveTemplateDialog, ApplyTemplateDialog } from './TemplateDialogs';
import { TemplateList, TemplateItem, TemplateDetails, SaveIcon, MergeIcon } from './TemplateList';

export {
  TemplateManager,
  SaveTemplateDialog,
  ApplyTemplateDialog,
  TemplateList,
  TemplateItem,
  TemplateDetails,
  SaveIcon,
  MergeIcon
};

// Default export for convenience
export default TemplateManager;