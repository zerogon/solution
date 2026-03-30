import Link from "next/link";
import { ChevronRightIcon, HomeIcon } from "./Icons";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-surface-400">
      <Link href="/" className="transition-colors hover:text-primary-600">
        <HomeIcon size={16} />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRightIcon size={14} />
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-primary-600"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-surface-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
