// frontend/src/components/common/ui/statusMeta.js
// Single source of truth for the operational status of a logged file/artifact.
// Replaces the color maps previously duplicated across cardUtils and viewers.
import { HardDrive, Cpu, Lock, Trash2, CheckCircle, Moon, Eye, HelpCircle } from 'lucide-react';

export const STATUS_META = {
  ON_DISK:   { label: 'On Disk',   icon: HardDrive,   text: 'text-warning', chip: 'bg-warning/10 text-warning border-warning/30', stripe: 'border-l-warning/70', desc: 'File is still on the target system' },
  IN_MEMORY: { label: 'In Memory', icon: Cpu,         text: 'text-info',    chip: 'bg-info/10 text-info border-info/30',          stripe: 'border-l-info/70',    desc: 'Running only in memory' },
  ENCRYPTED: { label: 'Encrypted', icon: Lock,        text: 'text-[#b491e0]', chip: 'bg-[#b491e0]/10 text-[#b491e0] border-[#b491e0]/30', stripe: 'border-l-[#b491e0]/70', desc: 'File is encrypted' },
  REMOVED:   { label: 'Removed',   icon: Trash2,      text: 'text-danger',  chip: 'bg-danger/10 text-danger border-danger/30',    stripe: 'border-l-danger/70',  desc: 'File has been deleted' },
  CLEANED:   { label: 'Cleaned',   icon: CheckCircle, text: 'text-success', chip: 'bg-success/10 text-success border-success/30', stripe: 'border-l-success/70', desc: 'File and any traces have been removed' },
  DORMANT:   { label: 'Dormant',   icon: Moon,        text: 'text-muted',   chip: 'bg-surface-3 text-muted border-line',          stripe: 'border-l-line-strong', desc: 'Present but inactive' },
  DETECTED:  { label: 'Detected',  icon: Eye,         text: 'text-[#e08a4a]', chip: 'bg-[#e08a4a]/10 text-[#e08a4a] border-[#e08a4a]/30', stripe: 'border-l-[#e08a4a]/70', desc: 'Detected by defenders' },
  UNKNOWN:   { label: 'Unknown',   icon: HelpCircle,  text: 'text-faint',   chip: 'bg-surface-3 text-faint border-line',          stripe: 'border-l-line-strong', desc: 'Status needs verification' },
};

const FALLBACK = { label: 'Unknown', icon: HelpCircle, text: 'text-faint', chip: 'bg-surface-3 text-faint border-line', stripe: 'border-l-line-strong', desc: '' };

export const statusMeta = (status) => STATUS_META[status] || FALLBACK;
