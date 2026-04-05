// Compatibility shim: existing call sites import named *Icon components from here.
// Internally we re-export lucide-react icons, mapping our IconProps ({ size, className }) shape.
import {
  User,
  Folder,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Search,
  ArrowUpDown,
  Trash2,
  Pencil,
  Upload,
  BookOpen,
  Sparkles,
  Home,
  Check,
  RotateCcw,
  FileText,
  Loader,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

export type IconProps = Omit<LucideProps, "ref"> & { size?: number };

const wrap = (C: LucideIcon) => {
  const W = ({ size = 24, strokeWidth = 2, ...rest }: IconProps) => (
    <C size={size} strokeWidth={strokeWidth} {...rest} />
  );
  W.displayName = C.displayName ?? "Icon";
  return W;
};

export const UserIcon = wrap(User);
export const FolderIcon = wrap(Folder);
export const XIcon = wrap(X);
export const ChevronLeftIcon = wrap(ChevronLeft);
export const ChevronRightIcon = wrap(ChevronRight);
export const ChevronUpIcon = wrap(ChevronUp);
export const ChevronDownIcon = wrap(ChevronDown);
export const PlusIcon = wrap(Plus);
export const SearchIcon = wrap(Search);
export const SortIcon = wrap(ArrowUpDown);
export const TrashIcon = wrap(Trash2);
export const PencilIcon = wrap(Pencil);
export const UploadIcon = wrap(Upload);
export const BookOpenIcon = wrap(BookOpen);
export const SparklesIcon = wrap(Sparkles);
export const HomeIcon = wrap(Home);
export const CheckIcon = wrap(Check);
export const RotateCcwIcon = wrap(RotateCcw);
export const FileTextIcon = wrap(FileText);
export const LoaderIcon = wrap(Loader);
