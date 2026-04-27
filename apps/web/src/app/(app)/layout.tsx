import { RequireAuth } from '@/components/require-auth';
import { SearchHost } from '@/components/search-host';
import { Topbar } from '@/components/topbar';
import { ActiveTimerConflictDialog } from '@/components/time-tracking/active-timer-conflict-dialog';
import { GlobalCardModal } from '@/components/board/global-card-modal';
import { DialogsProvider } from '@/components/ui/dialogs';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <DialogsProvider>
        <div className="flex min-h-screen flex-col">
          <Topbar />
          <main className="flex-1">{children}</main>
          <SearchHost />
          <ActiveTimerConflictDialog />
          <GlobalCardModal />
        </div>
      </DialogsProvider>
    </RequireAuth>
  );
}
