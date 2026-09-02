// frontend/src/components/common/ui/index.js
// Shared design-system primitives. Prefer these over hand-rolled markup so the
// app stays visually consistent and can be restyled from one place (tokens live
// in tailwind.config.js + src/index.css).
export { default as Button } from './Button';
export { default as Card } from './Card';
export { default as Panel } from './Panel';
export { default as Badge } from './Badge';
export { default as Chip } from './Chip';
export { default as Skeleton, SkeletonText } from './Skeleton';
export { default as EmptyState } from './EmptyState';
export { default as SectionHeader } from './SectionHeader';
export { default as StatusLegend } from './StatusLegend';
export { default as BrandMark } from './BrandMark';
export { STATUS_META, statusMeta } from './statusMeta';
