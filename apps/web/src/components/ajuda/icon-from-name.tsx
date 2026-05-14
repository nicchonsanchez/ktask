import {
  Rocket,
  LayoutGrid,
  SquareStack,
  CheckCircle2,
  Zap,
  Users,
  Download,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

const REGISTRY: Record<string, LucideIcon> = {
  Rocket,
  LayoutGrid,
  SquareStack,
  CheckCircle2,
  Zap,
  Users,
  Download,
  Settings,
};

export function IconFromName({ name, className }: { name: string; className?: string }) {
  const Icon = REGISTRY[name] ?? HelpCircle;
  return <Icon className={className} aria-hidden />;
}
